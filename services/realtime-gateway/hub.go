package main

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type websocketClient struct {
	conn          *websocket.Conn
	userID        string
	authToken     string
	subscriptions map[string]struct{}
	writeMu       sync.Mutex
	writeWait     time.Duration
}

func newWebSocketClient(conn *websocket.Conn, userID, authToken string, writeWait time.Duration) *websocketClient {
	return &websocketClient{
		conn:          conn,
		userID:        userID,
		authToken:     authToken,
		subscriptions: map[string]struct{}{},
		writeWait:     writeWait,
	}
}

func (c *websocketClient) sendJSON(payload any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	return c.sendRaw(encoded)
}

func (c *websocketClient) sendRaw(payload []byte) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	if c.writeWait > 0 {
		_ = c.conn.SetWriteDeadline(time.Now().Add(c.writeWait))
	}

	return c.conn.WriteMessage(websocket.TextMessage, payload)
}

type realtimeHub struct {
	mu                  sync.RWMutex
	userClients         map[string]map[*websocketClient]struct{}
	conversationClients map[string]map[*websocketClient]struct{}
}

func newRealtimeHub() *realtimeHub {
	return &realtimeHub{
		userClients:         map[string]map[*websocketClient]struct{}{},
		conversationClients: map[string]map[*websocketClient]struct{}{},
	}
}

func (h *realtimeHub) register(client *websocketClient) {
	h.mu.Lock()
	defer h.mu.Unlock()

	clients, ok := h.userClients[client.userID]
	if !ok {
		clients = map[*websocketClient]struct{}{}
		h.userClients[client.userID] = clients
	}

	clients[client] = struct{}{}
}

func (h *realtimeHub) addSubscription(client *websocketClient, conversationID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	clients, ok := h.conversationClients[conversationID]
	if !ok {
		clients = map[*websocketClient]struct{}{}
		h.conversationClients[conversationID] = clients
	}

	clients[client] = struct{}{}
	client.subscriptions[conversationID] = struct{}{}
}

func (h *realtimeHub) removeSubscription(client *websocketClient, conversationID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if clients, ok := h.conversationClients[conversationID]; ok {
		delete(clients, client)
		if len(clients) == 0 {
			delete(h.conversationClients, conversationID)
		}
	}

	delete(client.subscriptions, conversationID)
}

func (h *realtimeHub) unregister(client *websocketClient) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if clients, ok := h.userClients[client.userID]; ok {
		delete(clients, client)
		if len(clients) == 0 {
			delete(h.userClients, client.userID)
		}
	}

	for conversationID := range client.subscriptions {
		if clients, ok := h.conversationClients[conversationID]; ok {
			delete(clients, client)
			if len(clients) == 0 {
				delete(h.conversationClients, conversationID)
			}
		}
	}

	client.subscriptions = map[string]struct{}{}
}

func (h *realtimeHub) collectTargets(conversationID string, recipientUserIDs []string) []*websocketClient {
	h.mu.RLock()
	defer h.mu.RUnlock()

	targets := map[*websocketClient]struct{}{}

	if conversationID != "" {
		if clients, ok := h.conversationClients[conversationID]; ok {
			for client := range clients {
				targets[client] = struct{}{}
			}
		}
	}

	for _, userID := range recipientUserIDs {
		if clients, ok := h.userClients[userID]; ok {
			for client := range clients {
				targets[client] = struct{}{}
			}
		}
	}

	result := make([]*websocketClient, 0, len(targets))
	for client := range targets {
		result = append(result, client)
	}

	return result
}

func (h *realtimeHub) publish(conversationID string, recipientUserIDs []string, payload []byte) int {
	targets := h.collectTargets(conversationID, recipientUserIDs)
	if len(targets) == 0 {
		return 0
	}

	delivered := 0
	for _, client := range targets {
		if err := client.sendRaw(payload); err != nil {
			log.Printf("[realtime-gateway] publish send failed (user: %s): %v", client.userID, err)
			h.unregister(client)
			_ = client.conn.Close()
			continue
		}

		delivered += 1
	}

	return delivered
}
