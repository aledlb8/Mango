package main

import (
	"log"
	"net/http"
)

func main() {
	cfg := loadConfig()
	server := newServer(cfg)

	mux := http.NewServeMux()
	server.registerRoutes(mux)

	addr := ":" + cfg.Port
	log.Printf("%s listening on http://localhost%s", cfg.ServiceName, addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
