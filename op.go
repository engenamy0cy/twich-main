package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

var jwtSecret []byte

type ChatMessage struct {
	User string `json:"user"`
	Text string `json:"text"`
}

var (
	clients   = make(map[*websocket.Conn]string)
	clientsMu sync.Mutex
)

func getUserFromToken(tokenStr string) (string, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return "", fmt.Errorf("неверный токен")
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		if email, exists := claims["email"].(string); exists {
			return email, nil
		}
		if sub, exists := claims["sub"]; exists {
			return fmt.Sprintf("User #%v", sub), nil
		}
	}
	return "Аноним", nil
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	username, err := getUserFromToken(token)
	if err != nil {
		http.Error(w, "Ошибка авторизации", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Ошибка Upgrade:", err)
		return
	}
	defer conn.Close()

	clientsMu.Lock()
	clients[conn] = username
	clientsMu.Unlock()

	defer func() {
		clientsMu.Lock()
		delete(clients, conn)
		clientsMu.Unlock()
	}()

	for {
		var msg ChatMessage
		if err := conn.ReadJSON(&msg); err != nil {
			break
		}
		if msg.Text == "" {
			continue
		}
		msg.User = username

		clientsMu.Lock()
		for client := range clients {
			_ = client.WriteJSON(msg)
		}
		clientsMu.Unlock()
	}
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Файл .env не найден, читаем системные переменные")
	}

	secret := os.Getenv("JWT_SECRET_KEY")
	if secret == "" {
		log.Fatal("Ошибка: переменная JWT_SECRET_KEY пустая!")
	}
	jwtSecret = []byte(secret)

	http.HandleFunc("/ws", handleWebSocket)
	fmt.Println("Чат-сервер запущен на :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
