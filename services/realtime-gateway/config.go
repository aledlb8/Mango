package main

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type config struct {
	ServiceName          string
	Port                 string
	CorsOrigin           string
	IdentityServiceURL   string
	MessagingServiceURL  string
	InternalAPIKey       string
	RequestTimeout       time.Duration
	MaxPayloadBytes      int64
	WebSocketReadLimit   int64
	WebSocketWriteWait   time.Duration
	WebSocketPongTimeout time.Duration
}

func loadConfig() config {
	return config{
		ServiceName:          "realtime-gateway",
		Port:                 getEnv("REALTIME_GATEWAY_PORT", "4001"),
		CorsOrigin:           getEnv("CORS_ORIGIN", "*"),
		IdentityServiceURL:   strings.TrimRight(getEnv("IDENTITY_SERVICE_URL", "http://localhost:3002"), "/"),
		MessagingServiceURL:  strings.TrimRight(getEnv("MESSAGING_SERVICE_URL", "http://localhost:3004"), "/"),
		InternalAPIKey:       getEnv("REALTIME_GATEWAY_INTERNAL_API_KEY", ""),
		RequestTimeout:       time.Duration(getIntEnv("REALTIME_GATEWAY_REQUEST_TIMEOUT_MS", 3_000)) * time.Millisecond,
		MaxPayloadBytes:      int64(getIntEnv("REALTIME_GATEWAY_MAX_PAYLOAD_BYTES", 1_048_576)),
		WebSocketReadLimit:   int64(getIntEnv("REALTIME_GATEWAY_WS_READ_LIMIT_BYTES", 65_536)),
		WebSocketWriteWait:   time.Duration(getIntEnv("REALTIME_GATEWAY_WS_WRITE_TIMEOUT_MS", 5_000)) * time.Millisecond,
		WebSocketPongTimeout: time.Duration(getIntEnv("REALTIME_GATEWAY_WS_PONG_TIMEOUT_MS", 60_000)) * time.Millisecond,
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
