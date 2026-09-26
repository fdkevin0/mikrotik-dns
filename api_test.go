package main

import (
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"
)

func TestIPVersionsExcludesRouterLocalQueries(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prepareDB(db)

	now := time.Now().Unix()
	for _, client := range []string{"192.0.2.1", "2001:db8::1", "router"} {
		if _, err := db.Exec(`INSERT INTO queries(timestamp, client, domain, type, query_id, source, reverse_domain) VALUES(?,?,?,?,?,?,?)`, now, client, "example.com", "A", 1, "router-a", reverseDomain("example.com")); err != nil {
			t.Fatal(err)
		}
	}

	recorder := httptest.NewRecorder()
	api{db: db, retention: 24 * time.Hour}.ipVersions(recorder, httptest.NewRequest("GET", "/api/ipv4-vs-ipv6", nil))
	if recorder.Code != 200 {
		t.Fatalf("status = %d, want 200: %s", recorder.Code, recorder.Body.String())
	}
	var counts []struct {
		IPType string `json:"ip_type"`
		Count  int    `json:"count"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&counts); err != nil {
		t.Fatal(err)
	}
	got := make(map[string]int)
	for _, count := range counts {
		got[count.IPType] = count.Count
	}
	if got["IPv4"] != 1 || got["IPv6"] != 1 {
		t.Fatalf("IP version counts = %v, want one IPv4 and one IPv6", got)
	}
}
