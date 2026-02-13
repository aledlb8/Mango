package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type voiceTargetKind string

const (
	targetChannel      voiceTargetKind = "channel"
	targetDirectThread voiceTargetKind = "direct_thread"
)

var (
	errVoiceSessionNotFound = errors.New("voice session not found")
	errVoiceNotConnected    = errors.New("not connected to this voice session")
)

type voiceFeatureFlags struct {
	ScreenShare bool `json:"screenShare"`
}

type voiceSignalingInfo struct {
	URL              string `json:"url"`
	RoomName         string `json:"roomName"`
	ParticipantToken string `json:"participantToken"`
}

type voiceParticipantState struct {
	UserID        string `json:"userId"`
	Muted         bool   `json:"muted"`
	Deafened      bool   `json:"deafened"`
	Speaking      bool   `json:"speaking"`
	ScreenSharing bool   `json:"screenSharing"`
	JoinedAt      string `json:"joinedAt"`
	LastSeenAt    string `json:"lastSeenAt"`
}

type voiceSession struct {
	ID               string                  `json:"id"`
	TargetKind       voiceTargetKind         `json:"targetKind"`
	TargetID         string                  `json:"targetId"`
	ServerID         *string                 `json:"serverId"`
	StartedAt        string                  `json:"startedAt"`
	UpdatedAt        string                  `json:"updatedAt"`
	ReconnectGraceMs int64                   `json:"reconnectGraceMs"`
	Features         voiceFeatureFlags       `json:"features"`
	Participants     []voiceParticipantState `json:"participants"`
	Signaling        voiceSignalingInfo      `json:"signaling"`
}

type joinVoiceRequest struct {
	Muted    *bool `json:"muted"`
	Deafened *bool `json:"deafened"`
	Speaking *bool `json:"speaking"`
}

type updateVoiceStateRequest struct {
	Muted    *bool `json:"muted"`
	Deafened *bool `json:"deafened"`
	Speaking *bool `json:"speaking"`
}

type updateScreenShareRequest struct {
	ScreenSharing *bool `json:"screenSharing"`
}

type heartbeatRequest struct {
	Speaking *bool `json:"speaking"`
}

type participantRecord struct {
	UserID        string
	Muted         bool
	Deafened      bool
	Speaking      bool
	ScreenSharing bool
	JoinedAt      time.Time
	LastSeenAt    time.Time
}

type sessionRecord struct {
	ID           string
	TargetKind   voiceTargetKind
	TargetID     string
	ServerID     *string
	StartedAt    time.Time
	UpdatedAt    time.Time
	Participants map[string]*participantRecord
}

type voiceStore struct {
	mu                sync.RWMutex
	sessionsByTarget  map[string]*sessionRecord
	targetByUserID    map[string]string
	reconnectGrace    time.Duration
	enableScreenShare bool
	signalingURL      string
	livekitAPIKey     string
	livekitAPISecret  string
	tokenTTL          time.Duration
}

func newVoiceStore(
	reconnectGrace time.Duration,
	enableScreenShare bool,
	signalingURL string,
	livekitAPIKey string,
	livekitAPISecret string,
	tokenTTL time.Duration,
) *voiceStore {
	return &voiceStore{
		sessionsByTarget:  map[string]*sessionRecord{},
		targetByUserID:    map[string]string{},
		reconnectGrace:    reconnectGrace,
		enableScreenShare: enableScreenShare,
		signalingURL:      signalingURL,
		livekitAPIKey:     strings.TrimSpace(livekitAPIKey),
		livekitAPISecret:  strings.TrimSpace(livekitAPISecret),
		tokenTTL:          tokenTTL,
	}
}

func targetKey(kind voiceTargetKind, targetID string) string {
	return string(kind) + ":" + targetID
}

func copyStringPtr(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	copied := trimmed
	return &copied
}

func randomSuffix(n int) string {
	if n < 2 {
		n = 2
	}

	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}

	return hex.EncodeToString(buf)
}

func roomName(kind voiceTargetKind, targetID string) string {
	return "mango_" + string(kind) + "_" + targetID
}

type livekitVideoGrant struct {
	RoomJoin       bool   `json:"roomJoin"`
	Room           string `json:"room"`
	CanPublish     bool   `json:"canPublish"`
	CanSubscribe   bool   `json:"canSubscribe"`
	CanPublishData bool   `json:"canPublishData"`
}

type livekitTokenClaims struct {
	Video livekitVideoGrant `json:"video"`
	Name  string            `json:"name"`
	jwt.RegisteredClaims
}

func (s *voiceStore) participantToken(userID string, kind voiceTargetKind, targetID string) (string, error) {
	if s.livekitAPIKey == "" || s.livekitAPISecret == "" {
		return "", errors.New("LiveKit API credentials are not configured")
	}

	identity := userID + "_" + randomSuffix(6)
	now := time.Now().UTC()
	claims := livekitTokenClaims{
		Video: livekitVideoGrant{
			RoomJoin:       true,
			Room:           roomName(kind, targetID),
			CanPublish:     true,
			CanSubscribe:   true,
			CanPublishData: true,
		},
		Name: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.livekitAPIKey,
			Subject:   identity,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now.Add(-30 * time.Second)),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.tokenTTL)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, err := token.SignedString([]byte(s.livekitAPISecret))
	if err != nil {
		return "", fmt.Errorf("failed to sign LiveKit participant token: %w", err)
	}

	return signedToken, nil
}

func (s *voiceStore) buildSession(record *sessionRecord, userID string) (voiceSession, error) {
	participants := make([]voiceParticipantState, 0, len(record.Participants))
	for _, participant := range record.Participants {
		participants = append(participants, voiceParticipantState{
			UserID:        participant.UserID,
			Muted:         participant.Muted,
			Deafened:      participant.Deafened,
			Speaking:      participant.Speaking,
			ScreenSharing: participant.ScreenSharing,
			JoinedAt:      participant.JoinedAt.UTC().Format(time.RFC3339Nano),
			LastSeenAt:    participant.LastSeenAt.UTC().Format(time.RFC3339Nano),
		})
	}

	participantToken, err := s.participantToken(userID, record.TargetKind, record.TargetID)
	if err != nil {
		return voiceSession{}, err
	}

	return voiceSession{
		ID:               record.ID,
		TargetKind:       record.TargetKind,
		TargetID:         record.TargetID,
		ServerID:         record.ServerID,
		StartedAt:        record.StartedAt.UTC().Format(time.RFC3339Nano),
		UpdatedAt:        record.UpdatedAt.UTC().Format(time.RFC3339Nano),
		ReconnectGraceMs: s.reconnectGrace.Milliseconds(),
		Features: voiceFeatureFlags{
			ScreenShare: s.enableScreenShare,
		},
		Participants: participants,
		Signaling: voiceSignalingInfo{
			URL:              s.signalingURL,
			RoomName:         roomName(record.TargetKind, record.TargetID),
			ParticipantToken: participantToken,
		},
	}, nil
}

func (s *voiceStore) leaveByKeyLocked(key string, userID string, now time.Time) (*sessionRecord, error) {
	record, ok := s.sessionsByTarget[key]
	if !ok {
		return nil, errVoiceSessionNotFound
	}

	if _, exists := record.Participants[userID]; !exists {
		return nil, errVoiceNotConnected
	}

	delete(record.Participants, userID)
	delete(s.targetByUserID, userID)
	record.UpdatedAt = now

	if len(record.Participants) == 0 {
		delete(s.sessionsByTarget, key)
	}

	return record, nil
}

func (s *voiceStore) removeUserFromPriorSessionLocked(userID, keepKey string, now time.Time) {
	existingKey := s.targetByUserID[userID]
	if existingKey == "" || existingKey == keepKey {
		return
	}

	record := s.sessionsByTarget[existingKey]
	if record == nil {
		delete(s.targetByUserID, userID)
		return
	}

	delete(record.Participants, userID)
	record.UpdatedAt = now
	delete(s.targetByUserID, userID)

	if len(record.Participants) == 0 {
		delete(s.sessionsByTarget, existingKey)
	}
}

func (s *voiceStore) Join(
	kind voiceTargetKind,
	targetID,
	userID string,
	serverID *string,
	body joinVoiceRequest,
) (voiceSession, error) {
	now := time.Now().UTC()
	key := targetKey(kind, targetID)

	s.mu.Lock()
	defer s.mu.Unlock()

	s.removeUserFromPriorSessionLocked(userID, key, now)

	record, exists := s.sessionsByTarget[key]
	if !exists {
		record = &sessionRecord{
			ID:           "vsn_" + randomSuffix(8),
			TargetKind:   kind,
			TargetID:     targetID,
			ServerID:     serverID,
			StartedAt:    now,
			UpdatedAt:    now,
			Participants: map[string]*participantRecord{},
		}
		s.sessionsByTarget[key] = record
	} else {
		record.ServerID = serverID
		record.UpdatedAt = now
	}

	participant, exists := record.Participants[userID]
	if !exists {
		participant = &participantRecord{
			UserID:     userID,
			Muted:      false,
			Deafened:   false,
			Speaking:   false,
			JoinedAt:   now,
			LastSeenAt: now,
		}
		record.Participants[userID] = participant
	}

	if body.Muted != nil {
		participant.Muted = *body.Muted
	}
	if body.Deafened != nil {
		participant.Deafened = *body.Deafened
	}
	if body.Speaking != nil {
		participant.Speaking = *body.Speaking
	}

	if participant.Deafened {
		participant.Speaking = false
	}

	if !s.enableScreenShare {
		participant.ScreenSharing = false
	}

	participant.LastSeenAt = now
	record.UpdatedAt = now
	s.targetByUserID[userID] = key

	return s.buildSession(record, userID)
}

func (s *voiceStore) Leave(kind voiceTargetKind, targetID, userID string) (voiceSession, error) {
	now := time.Now().UTC()
	key := targetKey(kind, targetID)

	s.mu.Lock()
	defer s.mu.Unlock()

	record, err := s.leaveByKeyLocked(key, userID, now)
	if err != nil {
		return voiceSession{}, err
	}

	return s.buildSession(record, userID)
}

func (s *voiceStore) UpdateState(kind voiceTargetKind, targetID, userID string, body updateVoiceStateRequest) (voiceSession, error) {
	now := time.Now().UTC()
	key := targetKey(kind, targetID)

	s.mu.Lock()
	defer s.mu.Unlock()

	record, ok := s.sessionsByTarget[key]
	if !ok {
		return voiceSession{}, errVoiceSessionNotFound
	}

	participant, ok := record.Participants[userID]
	if !ok {
		return voiceSession{}, errVoiceNotConnected
	}

	if body.Muted != nil {
		participant.Muted = *body.Muted
	}
	if body.Deafened != nil {
		participant.Deafened = *body.Deafened
	}
	if body.Speaking != nil {
		participant.Speaking = *body.Speaking
	}

	if participant.Deafened {
		participant.Speaking = false
	}

	participant.LastSeenAt = now
	record.UpdatedAt = now

	return s.buildSession(record, userID)
}

func (s *voiceStore) UpdateScreenShare(kind voiceTargetKind, targetID, userID string, screenSharing bool) (voiceSession, error) {
	now := time.Now().UTC()
	key := targetKey(kind, targetID)

	s.mu.Lock()
	defer s.mu.Unlock()

	record, ok := s.sessionsByTarget[key]
	if !ok {
		return voiceSession{}, errVoiceSessionNotFound
	}

	participant, ok := record.Participants[userID]
	if !ok {
		return voiceSession{}, errVoiceNotConnected
	}

	if !s.enableScreenShare {
		participant.ScreenSharing = false
	} else {
		participant.ScreenSharing = screenSharing
	}

	participant.LastSeenAt = now
	record.UpdatedAt = now

	return s.buildSession(record, userID)
}

func (s *voiceStore) Heartbeat(kind voiceTargetKind, targetID, userID string, body heartbeatRequest) (voiceSession, error) {
	now := time.Now().UTC()
	key := targetKey(kind, targetID)

	s.mu.Lock()
	defer s.mu.Unlock()

	record, ok := s.sessionsByTarget[key]
	if !ok {
		return voiceSession{}, errVoiceSessionNotFound
	}

	participant, ok := record.Participants[userID]
	if !ok {
		return voiceSession{}, errVoiceNotConnected
	}

	if body.Speaking != nil {
		participant.Speaking = *body.Speaking
		if participant.Deafened {
			participant.Speaking = false
		}
	}

	participant.LastSeenAt = now
	record.UpdatedAt = now

	return s.buildSession(record, userID)
}

func (s *voiceStore) Get(kind voiceTargetKind, targetID, userID string) (*voiceSession, error) {
	key := targetKey(kind, targetID)

	s.mu.RLock()
	defer s.mu.RUnlock()

	record := s.sessionsByTarget[key]
	if record == nil {
		return nil, nil
	}

	session, err := s.buildSession(record, userID)
	if err != nil {
		return nil, err
	}

	return &session, nil
}

func (s *voiceStore) CleanupExpired() {
	now := time.Now().UTC()

	s.mu.Lock()
	defer s.mu.Unlock()

	for key, record := range s.sessionsByTarget {
		for userID, participant := range record.Participants {
			if now.Sub(participant.LastSeenAt) <= s.reconnectGrace {
				continue
			}

			delete(record.Participants, userID)
			if s.targetByUserID[userID] == key {
				delete(s.targetByUserID, userID)
			}
		}

		if len(record.Participants) == 0 {
			delete(s.sessionsByTarget, key)
			continue
		}

		record.UpdatedAt = now
	}
}

type server struct {
	corsOrigin string
	store      *voiceStore
}

func main() {
	port := getEnv("VOICE_SIGNALING_PORT", "4003")
	corsOrigin := getEnv("CORS_ORIGIN", "*")
	signalingURL := getEnv("LIVEKIT_WS_URL", "ws://localhost:7880")
	livekitAPIKey := getEnv("LIVEKIT_API_KEY", "devkey")
	livekitAPISecret := getEnv("LIVEKIT_API_SECRET", "secret")
	reconnectGraceMs := getIntEnv("VOICE_SIGNALING_RECONNECT_GRACE_MS", 30000)
	tokenTTLSeconds := getIntEnv("VOICE_SIGNALING_TOKEN_TTL_SECONDS", 3600)
	if reconnectGraceMs < 5000 {
		reconnectGraceMs = 5000
	}
	if tokenTTLSeconds < 60 {
		tokenTTLSeconds = 60
	}

	enableScreenShare := strings.EqualFold(getEnv("VOICE_SIGNALING_ENABLE_SCREEN_SHARE", "false"), "true")

	s := &server{
		corsOrigin: corsOrigin,
		store: newVoiceStore(
			time.Duration(reconnectGraceMs)*time.Millisecond,
			enableScreenShare,
			signalingURL,
			livekitAPIKey,
			livekitAPISecret,
			time.Duration(tokenTTLSeconds)*time.Second,
		),
	}

	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			s.store.CleanupExpired()
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/v1/voice/channels/", s.handleVoiceChannels)
	mux.HandleFunc("/v1/voice/direct-threads/", s.handleVoiceDirectThreads)
	mux.HandleFunc("/", s.handleRoot)

	addr := ":" + port
	log.Printf("voice-signaling listening on http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func (s *server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	s.respondJSON(w, http.StatusOK, map[string]any{
		"service":   "voice-signaling",
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	})
}

func (s *server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		s.respondOptions(w)
		return
	}

	s.respondJSON(w, http.StatusOK, map[string]any{
		"service": "voice-signaling",
		"routes": []string{
			"GET /health",
			"GET /v1/voice/channels/:channelId",
			"POST /v1/voice/channels/:channelId/join",
			"POST /v1/voice/channels/:channelId/leave",
			"POST /v1/voice/channels/:channelId/state",
			"POST /v1/voice/channels/:channelId/heartbeat",
			"POST /v1/voice/channels/:channelId/screen-share",
			"GET /v1/voice/direct-threads/:threadId",
			"POST /v1/voice/direct-threads/:threadId/join",
			"POST /v1/voice/direct-threads/:threadId/leave",
			"POST /v1/voice/direct-threads/:threadId/state",
			"POST /v1/voice/direct-threads/:threadId/heartbeat",
			"POST /v1/voice/direct-threads/:threadId/screen-share",
		},
	})
}

func (s *server) handleVoiceChannels(w http.ResponseWriter, r *http.Request) {
	s.handleVoiceTarget(w, r, targetChannel, "/v1/voice/channels/")
}

func (s *server) handleVoiceDirectThreads(w http.ResponseWriter, r *http.Request) {
	s.handleVoiceTarget(w, r, targetDirectThread, "/v1/voice/direct-threads/")
}

func sessionErrorStatus(err error) int {
	if errors.Is(err, errVoiceSessionNotFound) || errors.Is(err, errVoiceNotConnected) {
		return http.StatusNotFound
	}

	return http.StatusInternalServerError
}

func (s *server) handleVoiceTarget(w http.ResponseWriter, r *http.Request, kind voiceTargetKind, prefix string) {
	if r.Method == http.MethodOptions {
		s.respondOptions(w)
		return
	}

	targetID, action, err := parseTargetPath(r.URL.Path, prefix)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "Route not found.")
		return
	}

	userID := strings.TrimSpace(r.Header.Get("X-Voice-User-Id"))
	if userID == "" {
		s.respondError(w, http.StatusUnauthorized, "Missing X-Voice-User-Id.")
		return
	}

	serverID := copyStringPtr(r.Header.Get("X-Voice-Server-Id"))
	screenShareEnabled := strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Screen-Share-Enabled")), "true")
	if !screenShareEnabled && action == "screen-share" {
		s.respondError(w, http.StatusNotFound, "Screen sharing is disabled.")
		return
	}

	switch {
	case action == "" && r.Method == http.MethodGet:
		session, err := s.store.Get(kind, targetID, userID)
		if err != nil {
			s.respondError(w, sessionErrorStatus(err), err.Error())
			return
		}

		if session == nil {
			s.respondJSON(w, http.StatusOK, nil)
			return
		}

		s.respondJSON(w, http.StatusOK, session)
		return

	case action == "join" && r.Method == http.MethodPost:
		var body joinVoiceRequest
		if err := decodeJSONBody(r.Body, &body); err != nil {
			s.respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		session, err := s.store.Join(kind, targetID, userID, serverID, body)
		if err != nil {
			s.respondError(w, sessionErrorStatus(err), err.Error())
			return
		}

		s.respondJSON(w, http.StatusOK, session)
		return

	case action == "leave" && r.Method == http.MethodPost:
		session, err := s.store.Leave(kind, targetID, userID)
		if err != nil {
			s.respondError(w, sessionErrorStatus(err), err.Error())
			return
		}

		s.respondJSON(w, http.StatusOK, session)
		return

	case action == "state" && r.Method == http.MethodPost:
		var body updateVoiceStateRequest
		if err := decodeJSONBody(r.Body, &body); err != nil {
			s.respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		session, err := s.store.UpdateState(kind, targetID, userID, body)
		if err != nil {
			s.respondError(w, sessionErrorStatus(err), err.Error())
			return
		}

		s.respondJSON(w, http.StatusOK, session)
		return

	case action == "heartbeat" && r.Method == http.MethodPost:
		var body heartbeatRequest
		if err := decodeJSONBody(r.Body, &body); err != nil {
			s.respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		session, err := s.store.Heartbeat(kind, targetID, userID, body)
		if err != nil {
			s.respondError(w, sessionErrorStatus(err), err.Error())
			return
		}

		s.respondJSON(w, http.StatusOK, session)
		return

	case action == "screen-share" && r.Method == http.MethodPost:
		if !s.store.enableScreenShare {
			s.respondError(w, http.StatusNotFound, "Screen sharing is disabled.")
			return
		}

		var body updateScreenShareRequest
		if err := decodeJSONBody(r.Body, &body); err != nil {
			s.respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		if body.ScreenSharing == nil {
			s.respondError(w, http.StatusBadRequest, "screenSharing must be a boolean.")
			return
		}

		session, err := s.store.UpdateScreenShare(kind, targetID, userID, *body.ScreenSharing)
		if err != nil {
			s.respondError(w, sessionErrorStatus(err), err.Error())
			return
		}

		s.respondJSON(w, http.StatusOK, session)
		return
	}

	s.respondError(w, http.StatusMethodNotAllowed, "Method not allowed.")
}

func parseTargetPath(path, prefix string) (string, string, error) {
	trimmed := strings.TrimPrefix(path, prefix)
	parts := strings.Split(strings.Trim(trimmed, "/"), "/")
	if len(parts) == 0 || strings.TrimSpace(parts[0]) == "" {
		return "", "", errors.New("missing target id")
	}

	decodedID, err := url.PathUnescape(parts[0])
	if err != nil {
		return "", "", errors.New("invalid target id")
	}

	action := ""
	if len(parts) > 1 {
		action = strings.TrimSpace(parts[1])
	}

	if len(parts) > 2 {
		return "", "", errors.New("invalid route")
	}

	return decodedID, action, nil
}

func decodeJSONBody[T any](body io.ReadCloser, out *T) error {
	if body == nil {
		return nil
	}
	defer body.Close()

	payload, err := io.ReadAll(io.LimitReader(body, 1<<20))
	if err != nil {
		return errors.New("Failed to read request body.")
	}

	if len(bytes.TrimSpace(payload)) == 0 {
		return nil
	}

	if err := json.Unmarshal(payload, out); err != nil {
		return errors.New("Invalid JSON body.")
	}

	return nil
}

func (s *server) respondOptions(w http.ResponseWriter) {
	headers := s.corsHeaders()
	for key, value := range headers {
		w.Header().Set(key, value)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) respondJSON(w http.ResponseWriter, status int, payload any) {
	headers := s.corsHeaders()
	headers["Content-Type"] = "application/json"
	for key, value := range headers {
		w.Header().Set(key, value)
	}
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *server) respondError(w http.ResponseWriter, status int, message string) {
	s.respondJSON(w, status, map[string]string{
		"error": message,
	})
}

func (s *server) corsHeaders() map[string]string {
	return map[string]string{
		"Access-Control-Allow-Origin":  s.corsOrigin,
		"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie, X-Voice-User-Id, X-Voice-Server-Id, X-Voice-Target-Kind, X-Voice-Target-Id, X-Screen-Share-Enabled",
		"Access-Control-Max-Age":       "86400",
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}

func getIntEnv(key string, fallback int) int {
	raw := strings.TrimSpace(getEnv(key, ""))
	if raw == "" {
		return fallback
	}

	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}

	return value
}
