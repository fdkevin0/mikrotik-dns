package main

import (
	"database/sql"
	"log"
	"net"
	"os"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	retention, err := parseRetention(os.Getenv("DATA_RETENTION_HOURS"))
	if err != nil {
		log.Fatal(err)
	}

	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "./data/dnslogs.db"
	}

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	if err := prepareDB(db); err != nil {
		log.Fatal(err)
	}
	purgeOld(db, retention)
	log.Printf("Data retention: %v", retention)

	go func() {
		for {
			time.Sleep(time.Hour)
			purgeOld(db, retention)
		}
	}()

	go receiveLogs(db)
	serveAPI(db, retention)
}

func receiveLogs(db *sql.DB) {
	addr, _ := net.ResolveUDPAddr("udp", ":5354")
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		log.Fatalf("Failed to listen UDP: %v", err)
	}
	defer conn.Close()
	log.Println("Listening for UDP on :5354")

	buf := make([]byte, 65535)
	for {
		n, remote, err := conn.ReadFromUDP(buf)
		if err != nil {
			log.Printf("Error reading UDP: %v", err)
			continue
		}
		receivedAt := time.Now().Unix()
		for line := range strings.SplitSeq(strings.TrimRight(string(buf[:n]), "\r\n"), "\n") {
			line = strings.TrimSuffix(line, "\r")
			storeRawLog(db, receivedAt, remote.String(), line)
			handleLineFrom(db, remote.IP.String(), line)
		}
	}
}
