package main

import (
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/websocket"
)

const (
	internalPublishPath = "/internal/realtime/events"
	webSocketPath       = "/v1/ws"
)

type server struct {
	cfg      config
	hub      *realtimeHub
	client   *http.Client
	upgrader websocket.Upgrader
}

type meResponse struct {
	ID string `json:"id"`
}

type realtimeClientMessage struct {
	Type           string `json:"type"`
	ChannelID      string `json:"channelId"`
	ConversationID string `json:"conversationId"`
}

type realtimePublishRequest struct {
	Type             string          `json:"type"`
	Payload          json.RawMessage `json:"payload"`
	ConversationID   string          `json:"conversationId"`
	RecipientUserIDs []string        `json:"recipientUserIds"`
}

func newServer(cfg config) *server {
	return &server{
		cfg:    cfg,
		hub:    newRealtimeHub(),
		client: &http.Client{Timeout: cfg.RequestTimeout},
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool {
				return true
			},
		},
	}
}

func (s *server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc(webSocketPath, s.handleWebSocket)
	mux.HandleFunc(internalPublishPath, s.handleInternalPublish)
	mux.HandleFunc("/", s.handleRoot)
}

func (s *server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	s.respondJSON(w, http.StatusOK, map[string]string{
		"service": s.cfg.ServiceName,
		"status":  "ok",
	})
}

func (s *server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		s.respondOptions(w)
		return
	}

	s.respondJSON(w, http.StatusOK, map[string]any{
		"service": s.cfg.ServiceName,
		"routes": []string{
			"GET /health",
			"GET /v1/ws?token=...",
			"POST /internal/realtime/events",
		},
	})
}

func (s *server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		s.respondOptions(w)
		return
	}

	if r.Method != http.MethodGet {
		s.respondError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	token := readWebSocketAuthToken(r)
	if token == "" {
		s.respondError(w, http.StatusUnauthorized, "Missing websocket auth token.")
		return
	}

	userID, statusCode, err := s.authenticateToken(token)
	if err != nil {
		s.respondError(w, statusCode, err.Error())
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[realtime-gateway] websocket upgrade failed: %v", err)
		return
	}

	client := newWebSocketClient(conn, userID, token, s.cfg.WebSocketWriteWait)
	client.conn.SetReadLimit(s.cfg.WebSocketReadLimit)
	s.hub.register(client)

	if err := client.sendJSON(map[string]any{
		"type":   "ready",
		"userId": userID,
	}); err != nil {
		log.Printf("[realtime-gateway] websocket ready send failed (user: %s): %v", userID, err)
		s.hub.unregister(client)
		_ = client.conn.Close()
		return
	}

	go s.readWebSocketLoop(client)
}

func (s *server) readWebSocketLoop(client *websocketClient) {
	defer func() {
		s.hub.unregister(client)
		_ = client.conn.Close()
	}()

	for {
		_, payload, err := client.conn.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(
				err,
				websocket.CloseNormalClosure,
				websocket.CloseGoingAway,
				websocket.CloseNoStatusReceived,
			) {
				log.Printf("[realtime-gateway] websocket read failed (user: %s): %v", client.userID, err)
			}
			return
		}

		s.handleClientMessage(client, payload)
	}
}

func (s *server) handleClientMessage(client *websocketClient, payload []byte) {
	var parsed realtimeClientMessage
	if err := json.Unmarshal(payload, &parsed); err != nil {
		_ = client.sendJSON(map[string]any{
			"type":  "error",
			"error": "Invalid JSON message.",
		})
		return
	}

	switch strings.TrimSpace(parsed.Type) {
	case "ping":
		_ = client.sendJSON(map[string]any{
			"type": "pong",
		})
		return

	case "subscribe":
		conversationID := normalizedConversationID(parsed)
		if conversationID == "" {
			_ = client.sendJSON(map[string]any{
				"type":  "error",
				"error": "conversationId is required.",
			})
			return
		}

		allowed, statusCode, err := s.authorizeConversation(client.authToken, conversationID)
		if err != nil {
			_ = client.sendJSON(map[string]any{
				"type":  "error",
				"error": "Authorization service unavailable.",
			})
			log.Printf("[realtime-gateway] subscribe authorization failed: %v", err)
			return
		}

		if !allowed {
			message := "Not authorized for this conversation."
			if statusCode == http.StatusNotFound {
				message = "Conversation not found."
			}

			_ = client.sendJSON(map[string]any{
				"type":  "error",
				"error": message,
			})
			return
		}

		s.hub.addSubscription(client, conversationID)
		_ = client.sendJSON(map[string]any{
			"type":      "subscribed",
			"channelId": conversationID,
		})
		return

	case "unsubscribe":
		conversationID := normalizedConversationID(parsed)
		if conversationID == "" {
			_ = client.sendJSON(map[string]any{
				"type":  "error",
				"error": "conversationId is required.",
			})
			return
		}

		s.hub.removeSubscription(client, conversationID)
		_ = client.sendJSON(map[string]any{
			"type":      "unsubscribed",
			"channelId": conversationID,
		})
		return

	default:
		_ = client.sendJSON(map[string]any{
			"type":  "error",
			"error": "Unsupported realtime message type.",
		})
	}
}

func (s *server) handleInternalPublish(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		s.respondOptions(w)
		return
	}

	if r.Method != http.MethodPost {
		s.respondError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	if !s.validInternalAPIKey(r.Header.Get("X-Realtime-Internal-Key")) {
		s.respondError(w, http.StatusUnauthorized, "Unauthorized.")
		return
	}

	var body realtimePublishRequest
	if err := decodeJSONBody(r.Body, s.cfg.MaxPayloadBytes, &body); err != nil {
		s.respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	eventType := strings.TrimSpace(body.Type)
	if eventType == "" {
		s.respondError(w, http.StatusBadRequest, "type is required.")
		return
	}

	encodedPayload := bytes.TrimSpace(body.Payload)
	if len(encodedPayload) == 0 {
		encodedPayload = []byte("null")
	}
	if !json.Valid(encodedPayload) {
		s.respondError(w, http.StatusBadRequest, "payload must be valid JSON.")
		return
	}

	encodedMessage, err := json.Marshal(map[string]any{
		"type":    eventType,
		"payload": json.RawMessage(encodedPayload),
	})
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to encode publish payload.")
		return
	}

	conversationID := strings.TrimSpace(body.ConversationID)
	recipients := normalizeIDs(body.RecipientUserIDs)
	delivered := s.hub.publish(conversationID, recipients, encodedMessage)
	s.respondJSON(w, http.StatusAccepted, map[string]any{
		"accepted":  true,
		"delivered": delivered,
	})
}

func (s *server) validInternalAPIKey(provided string) bool {
	configured := strings.TrimSpace(s.cfg.InternalAPIKey)
	if configured == "" {
		return true
	}

	actual := strings.TrimSpace(provided)
	if actual == "" {
		return false
	}

	return subtle.ConstantTimeCompare([]byte(configured), []byte(actual)) == 1
}

func (s *server) authenticateToken(token string) (string, int, error) {
	req, err := http.NewRequest(http.MethodGet, s.cfg.IdentityServiceURL+"/v1/me", nil)
	if err != nil {
		return "", http.StatusInternalServerError, errors.New("Failed to build identity request.")
	}

	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.client.Do(req)
	if err != nil {
		return "", http.StatusServiceUnavailable, errors.New("Identity service unavailable.")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", http.StatusUnauthorized, errors.New("Invalid websocket auth token.")
	}

	var me meResponse
	if err := json.NewDecoder(resp.Body).Decode(&me); err != nil {
		return "", http.StatusUnauthorized, errors.New("Invalid websocket auth token.")
	}

	userID := strings.TrimSpace(me.ID)
	if userID == "" {
		return "", http.StatusUnauthorized, errors.New("Invalid websocket auth token.")
	}

	return userID, http.StatusOK, nil
}

func (s *server) authorizeConversation(token string, conversationID string) (bool, int, error) {
	channelStatus, err := s.messagingReadStatus(token, "/v1/channels/"+url.PathEscape(conversationID)+"/messages?limit=1")
	if err != nil {
		return false, http.StatusServiceUnavailable, err
	}

	switch channelStatus {
	case http.StatusOK:
		return true, http.StatusOK, nil
	case http.StatusForbidden, http.StatusUnauthorized:
		return false, channelStatus, nil
	case http.StatusNotFound:
	default:
		if channelStatus >= http.StatusInternalServerError {
			return false, http.StatusServiceUnavailable, errors.New("messaging service unavailable")
		}
		return false, http.StatusBadRequest, nil
	}

	directThreadStatus, err := s.messagingReadStatus(token, "/v1/direct-threads/"+url.PathEscape(conversationID)+"/messages?limit=1")
	if err != nil {
		return false, http.StatusServiceUnavailable, err
	}

	switch directThreadStatus {
	case http.StatusOK:
		return true, http.StatusOK, nil
	case http.StatusForbidden, http.StatusUnauthorized:
		return false, directThreadStatus, nil
	case http.StatusNotFound:
		return false, http.StatusNotFound, nil
	default:
		if directThreadStatus >= http.StatusInternalServerError {
			return false, http.StatusServiceUnavailable, errors.New("messaging service unavailable")
		}
		return false, http.StatusBadRequest, nil
	}
}

func (s *server) messagingReadStatus(token string, path string) (int, error) {
	req, err := http.NewRequest(http.MethodGet, s.cfg.MessagingServiceURL+path, nil)
	if err != nil {
		return http.StatusInternalServerError, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := s.client.Do(req)
	if err != nil {
		return http.StatusServiceUnavailable, err
	}
	defer resp.Body.Close()

	return resp.StatusCode, nil
}

func normalizedConversationID(message realtimeClientMessage) string {
	conversationID := strings.TrimSpace(message.ConversationID)
	if conversationID != "" {
		return conversationID
	}

	return strings.TrimSpace(message.ChannelID)
}

func readWebSocketAuthToken(r *http.Request) string {
	queryToken := strings.TrimSpace(r.URL.Query().Get("token"))
	if queryToken != "" {
		return queryToken
	}

	return readBearerToken(r.Header.Get("Authorization"))
}

func readBearerToken(header string) string {
	raw := strings.TrimSpace(header)
	if raw == "" {
		return ""
	}

	const prefix = "bearer "
	lowered := strings.ToLower(raw)
	if !strings.HasPrefix(lowered, prefix) {
		return ""
	}

	return strings.TrimSpace(raw[len(prefix):])
}

func decodeJSONBody[T any](body io.ReadCloser, maxBytes int64, out *T) error {
	if body == nil {
		return errors.New("Invalid JSON body.")
	}
	defer body.Close()

	payload, err := io.ReadAll(io.LimitReader(body, maxBytes))
	if err != nil {
		return errors.New("Failed to read request body.")
	}

	if len(bytes.TrimSpace(payload)) == 0 {
		return errors.New("Invalid JSON body.")
	}

	if err := json.Unmarshal(payload, out); err != nil {
		return errors.New("Invalid JSON body.")
	}

	return nil
}

func normalizeIDs(values []string) []string {
	unique := map[string]struct{}{}
	normalized := make([]string, 0, len(values))

	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}

		if _, ok := unique[trimmed]; ok {
			continue
		}

		unique[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}

	return normalized
}

func (s *server) respondOptions(w http.ResponseWriter) {
	for key, value := range s.corsHeaders() {
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
		"Access-Control-Allow-Origin":  s.cfg.CorsOrigin,
		"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie, X-Realtime-Internal-Key",
		"Access-Control-Max-Age":       "86400",
	}
}
