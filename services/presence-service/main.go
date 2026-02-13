package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type PresenceStatus string

const (
	StatusOnline  PresenceStatus = "online"
	StatusIdle    PresenceStatus = "idle"
	StatusDnd     PresenceStatus = "dnd"
	StatusOffline PresenceStatus = "offline"
)

type PresenceState struct {
	UserID     string         `json:"userId"`
	Status     PresenceStatus `json:"status"`
	LastSeenAt string         `json:"lastSeenAt"`
	ExpiresAt  *string        `json:"expiresAt"`
}

type updatePresenceRequest struct {
	Status *string `json:"status"`
}

type bulkPresenceRequest struct {
	UserIDs []string `json:"userIds"`
}

type meResponse struct {
	ID string `json:"id"`
}

type presenceRecord struct {
	Status     PresenceStatus
	LastSeenAt time.Time
	ExpiresAt  time.Time
}

type presenceStore struct {
	mu      sync.RWMutex
	records map[string]presenceRecord
	ttl     time.Duration
}

func newPresenceStore(ttl time.Duration) *presenceStore {
	return &presenceStore{
		records: map[string]presenceRecord{},
		ttl:     ttl,
	}
}

func (s *presenceStore) Upsert(userID string, status PresenceStatus) PresenceState {
	now := time.Now().UTC()
	expiresAt := now.Add(s.ttl)

	s.mu.Lock()
	s.records[userID] = presenceRecord{
		Status:     status,
		LastSeenAt: now,
		ExpiresAt:  expiresAt,
	}
	s.mu.Unlock()

	expires := expiresAt.Format(time.RFC3339)
	return PresenceState{
		UserID:     userID,
		Status:     status,
		LastSeenAt: now.Format(time.RFC3339),
		ExpiresAt:  &expires,
	}
}

func (s *presenceStore) Get(userID string) PresenceState {
	s.mu.RLock()
	record, ok := s.records[userID]
	s.mu.RUnlock()
	if !ok {
		now := time.Now().UTC()
		return PresenceState{
			UserID:     userID,
			Status:     StatusOffline,
			LastSeenAt: now.Format(time.RFC3339),
			ExpiresAt:  nil,
		}
	}

	now := time.Now().UTC()
	if record.ExpiresAt.Before(now) {
		return PresenceState{
			UserID:     userID,
			Status:     StatusOffline,
			LastSeenAt: record.LastSeenAt.UTC().Format(time.RFC3339),
			ExpiresAt:  nil,
		}
	}

	expires := record.ExpiresAt.UTC().Format(time.RFC3339)
	return PresenceState{
		UserID:     userID,
		Status:     record.Status,
		LastSeenAt: record.LastSeenAt.UTC().Format(time.RFC3339),
		ExpiresAt:  &expires,
	}
}

func (s *presenceStore) Bulk(userIDs []string) []PresenceState {
	unique := make(map[string]struct{}, len(userIDs))
	result := make([]PresenceState, 0, len(userIDs))

	for _, userID := range userIDs {
		id := strings.TrimSpace(userID)
		if id == "" {
			continue
		}

		if _, exists := unique[id]; exists {
			continue
		}

		unique[id] = struct{}{}
		result = append(result, s.Get(id))
	}

	return result
}

func (s *presenceStore) CleanupExpired() {
	now := time.Now().UTC()

	s.mu.Lock()
	for userID, record := range s.records {
		if record.ExpiresAt.Before(now.Add(-5 * s.ttl)) {
			delete(s.records, userID)
		}
	}
	s.mu.Unlock()
}

type server struct {
	corsOrigin         string
	identityServiceURL string
	store              *presenceStore
	client             *http.Client
}

func main() {
	port := getEnv("PRESENCE_SERVICE_PORT", "4002")
	corsOrigin := getEnv("CORS_ORIGIN", "*")
	identityServiceURL := getEnv("IDENTITY_SERVICE_URL", "http://localhost:3002")
	ttlSeconds := getIntEnv("PRESENCE_TTL_SECONDS", 75)
	if ttlSeconds < 15 {
		ttlSeconds = 15
	}

	s := &server{
		corsOrigin:         corsOrigin,
		identityServiceURL: identityServiceURL,
		store:              newPresenceStore(time.Duration(ttlSeconds) * time.Second),
		client:             &http.Client{Timeout: 3 * time.Second},
	}

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			s.store.CleanupExpired()
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/v1/presence", s.handlePresence)
	mux.HandleFunc("/v1/presence/me", s.handlePresenceMe)
	mux.HandleFunc("/v1/presence/bulk", s.handlePresenceBulk)
	mux.HandleFunc("/v1/presence/", s.handlePresenceByUserID)
	mux.HandleFunc("/", s.handleRoot)

	addr := ":" + port
	log.Printf("presence-service listening on http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func (s *server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	s.respondJSON(w, http.StatusOK, map[string]string{
		"service": "presence-service",
		"status":  "ok",
	})
}

func (s *server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		s.respondOptions(w)
		return
	}

	s.respondJSON(w, http.StatusOK, map[string]any{
		"service": "presence-service",
		"routes": []string{
			"GET /health",
			"PUT /v1/presence",
			"GET /v1/presence/me",
			"POST /v1/presence/bulk",
			"GET /v1/presence/:userId",
		},
	})
}

func (s *server) handlePresence(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		s.respondOptions(w)
		return
	}
	if r.Method != http.MethodPut {
		s.respondError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	userID, statusCode, err := s.authenticate(r)
	if err != nil {
		s.respondError(w, statusCode, err.Error())
		return
	}

	var body updatePresenceRequest
	if err := decodeJSONBody(r.Body, &body); err != nil {
		s.respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	status := StatusOnline
	if body.Status != nil {
		parsed, err := parseUpdateStatus(*body.Status)
		if err != nil {
			s.respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		status = parsed
	}

	state := s.store.Upsert(userID, status)
	s.respondJSON(w, http.StatusOK, state)
}

func (s *server) handlePresenceMe(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		s.respondOptions(w)
		return
	}
	if r.Method != http.MethodGet {
		s.respondError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	userID, statusCode, err := s.authenticate(r)
	if err != nil {
		s.respondError(w, statusCode, err.Error())
		return
	}

	state := s.store.Get(userID)
	s.respondJSON(w, http.StatusOK, state)
}

func (s *server) handlePresenceBulk(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		s.respondOptions(w)
		return
	}
	if r.Method != http.MethodPost {
		s.respondError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	_, statusCode, err := s.authenticate(r)
	if err != nil {
		s.respondError(w, statusCode, err.Error())
		return
	}

	var body bulkPresenceRequest
	if err := decodeJSONBody(r.Body, &body); err != nil {
		s.respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	if len(body.UserIDs) == 0 {
		s.respondJSON(w, http.StatusOK, []PresenceState{})
		return
	}

	states := s.store.Bulk(body.UserIDs)
	s.respondJSON(w, http.StatusOK, states)
}

func (s *server) handlePresenceByUserID(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		s.respondOptions(w)
		return
	}
	if r.Method != http.MethodGet {
		s.respondError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	_, statusCode, err := s.authenticate(r)
	if err != nil {
		s.respondError(w, statusCode, err.Error())
		return
	}

	userID := strings.TrimPrefix(r.URL.Path, "/v1/presence/")
	userID = strings.TrimSpace(userID)
	if userID == "" {
		s.respondError(w, http.StatusBadRequest, "userId is required.")
		return
	}

	state := s.store.Get(userID)
	s.respondJSON(w, http.StatusOK, state)
}

func (s *server) authenticate(r *http.Request) (string, int, error) {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	cookieHeader := strings.TrimSpace(r.Header.Get("Cookie"))
	if authHeader == "" && cookieHeader == "" {
		return "", http.StatusUnauthorized, errors.New("Unauthorized.")
	}

	req, err := http.NewRequest(http.MethodGet, s.identityServiceURL+"/v1/me", nil)
	if err != nil {
		return "", http.StatusInternalServerError, errors.New("Failed to build identity request.")
	}

	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	if cookieHeader != "" {
		req.Header.Set("Cookie", cookieHeader)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return "", http.StatusServiceUnavailable, errors.New("Identity service unavailable.")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", http.StatusUnauthorized, errors.New("Unauthorized.")
	}

	var me meResponse
	if err := json.NewDecoder(resp.Body).Decode(&me); err != nil {
		return "", http.StatusUnauthorized, errors.New("Unauthorized.")
	}

	if strings.TrimSpace(me.ID) == "" {
		return "", http.StatusUnauthorized, errors.New("Unauthorized.")
	}

	return strings.TrimSpace(me.ID), http.StatusOK, nil
}

func parseUpdateStatus(raw string) (PresenceStatus, error) {
	status := PresenceStatus(strings.TrimSpace(strings.ToLower(raw)))
	switch status {
	case StatusOnline, StatusIdle, StatusDnd:
		return status, nil
	default:
		return "", errors.New("status must be one of: online, idle, dnd.")
	}
}

func decodeJSONBody[T any](body io.ReadCloser, out *T) error {
	if body == nil {
		return errors.New("Invalid JSON body.")
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
		"Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
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
