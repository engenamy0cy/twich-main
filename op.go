package main

import (
    "fmt"
    "net/http"
    "os"
    "sync"

    "://github.com"
    "://github.com"
)

var secretKey = []byte(getEnv("JWT_SECRET_KEY", "my_super_secret_key_12345"))

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

var (
	clients = make(map[*websocket.Conn]string)
	mu      sync.Mutex
)

type Message struct {
	User string `json:"user"`
	Text string `json:"text"`
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseToken(tokenStr string) (string, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return secretKey, nil
	})
	if err != nil || !token.Valid {
		return "", fmt.Errorf("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", fmt.Errorf("invalid claims")
	}
	sub, _ := claims["sub"].(string)
	return sub, nil
}

func handleWS(w http.ResponseWriter, r *http.Request) {
	tokenStr := r.URL.Query().Get("token")
	userID, err := parseToken(tokenStr)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	mu.Lock()
	clients[conn] = userID
	mu.Unlock()

	defer func() {
		mu.Lock()
		delete(clients, conn)
		mu.Unlock()
	}()

	for {
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			break
		}
		msg.User = "User #" + userID

		mu.Lock()
		for client := range clients {
			client.WriteJSON(msg)
		}
		mu.Unlock()
	}
}

func main() {
	http.HandleFunc("/ws", handleWS)
	fmt.Println("Go сервер запущен на http://127.0.0.1:8080")
	http.ListenAndServe(":8080", nil)
}
