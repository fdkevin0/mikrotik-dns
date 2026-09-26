package main

import (
	"database/sql"
	"strings"
	"testing"
	"time"
)

func TestParseRetention(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  time.Duration
		err   bool
	}{
		{name: "default", want: 24 * time.Hour},
		{name: "custom", value: "168", want: 7 * 24 * time.Hour},
		{name: "zero", value: "0", err: true},
		{name: "negative", value: "-1", err: true},
		{name: "not a number", value: "week", err: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseRetention(tt.value)
			if (err != nil) != tt.err {
				t.Fatalf("parseRetention(%q) error = %v, want error %v", tt.value, err, tt.err)
			}
			if got != tt.want {
				t.Fatalf("parseRetention(%q) = %v, want %v", tt.value, got, tt.want)
			}
		})
	}
}

func TestPurgeOld(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prepareDB(db)

	now := time.Now()
	for _, timestamp := range []int64{
		now.Add(-48 * time.Hour).Unix(),
		now.Add(-time.Hour).Unix(),
	} {
		if _, err := db.Exec(`INSERT INTO queries(timestamp, client, domain, type, query_id, source, reverse_domain) VALUES(?,?,?,?,?,?,?)`, timestamp, "client", "example.com", "A", 1, "router", reverseDomain("example.com")); err != nil {
			t.Fatal(err)
		}
	}
	storeRawLog(db, now.Add(-48*time.Hour).Unix(), "192.0.2.1:514", "old raw line")
	storeRawLog(db, now.Add(-time.Hour).Unix(), "192.0.2.1:514", "new raw line")

	purgeOld(db, 24*time.Hour)

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM queries`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("remaining query count = %d, want 1", count)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM raw_logs`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("remaining raw log count = %d, want 1", count)
	}
}

func TestRegistrableDomain(t *testing.T) {
	tests := map[string]string{
		"api.example.com":          "example.com",
		"cdn.example.com.cn":       "example.com.cn",
		"www.example.co.jp":        "example.co.jp",
		"assets.example.github.io": "example.github.io",
		"LOCALHOST.":               "localhost",
		"192.0.2.1":                "192.0.2.1",
	}

	for domain, want := range tests {
		if got := registrableDomain(domain); got != want {
			t.Errorf("registrableDomain(%q) = %q, want %q", domain, got, want)
		}
	}
}

func TestGroupDomainCounts(t *testing.T) {
	groups := groupDomainCounts([]DomainCount{
		{Domain: "api.example.com", Count: 2},
		{Domain: "www.example.com", Count: 3},
		{Domain: "cdn.example.com.cn", Count: 7},
		{Domain: "example.co.jp", Count: 7},
	})

	want := []DomainGroup{
		{Domain: "example.co.jp", Count: 7, DomainCount: 1},
		{Domain: "example.com.cn", Count: 7, DomainCount: 1},
		{Domain: "example.com", Count: 5, DomainCount: 2},
	}
	if len(groups) != len(want) {
		t.Fatalf("group count = %d, want %d", len(groups), len(want))
	}
	for i := range want {
		if groups[i] != want[i] {
			t.Errorf("group %d = %+v, want %+v", i, groups[i], want[i])
		}
	}
}

func TestPrepareDBCreatesIndexes(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prepareDB(db)

	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'queries'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	indexes := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		indexes[name] = true
	}
	for _, name := range []string{
		"idx_queries_timestamp",
		"idx_queries_domain_timestamp_client",
		"idx_queries_client_timestamp",
		"idx_queries_reverse_domain_timestamp",
		"idx_queries_source_query_id_timestamp",
	} {
		if !indexes[name] {
			t.Errorf("missing index %q", name)
		}
	}
	var rawLogIndex int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_raw_logs_received_at'`).Scan(&rawLogIndex); err != nil {
		t.Fatal(err)
	}
	if rawLogIndex != 1 {
		t.Error("missing index \"idx_raw_logs_received_at\"")
	}
}

func TestQueryRecordsFilters(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prepareDB(db)
	insert := func(timestamp int64, client, domain, queryType string, queryID int64) {
		t.Helper()
		if _, err := db.Exec(`INSERT INTO queries(timestamp, client, domain, type, query_id, source, reverse_domain) VALUES(?,?,?,?,?,?,?)`, timestamp, client, domain, queryType, queryID, "router", reverseDomain(domain)); err != nil {
			t.Fatal(err)
		}
	}
	insert(100, "client-a", "api.example.com", "A", 1)
	insert(90, "client-b", "example.com", "AAAA", 2)
	insert(80, "client-a", "notexample.com", "A", 3)
	insert(70, "client-a", "cdn.other.net", "A", 4)

	assertDomains := func(name string, filter QueryFilter, want ...string) {
		t.Helper()
		filter.PageSize = 20
		records, err := queryRecords(db, filter)
		if err != nil {
			t.Fatal(err)
		}
		if len(records) != len(want) {
			t.Fatalf("%s domains = %v, want %v", name, records, want)
		}
		for index := range want {
			if records[index].Domain != want[index] {
				t.Errorf("%s domain %d = %q, want %q", name, index, records[index].Domain, want[index])
			}
		}
	}

	assertDomains("exact", QueryFilter{Domain: "example.com", DomainMode: "exact"}, "example.com")
	assertDomains("suffix", QueryFilter{Domain: "example.com", DomainMode: "suffix"}, "api.example.com", "example.com")
	assertDomains("contains", QueryFilter{Domain: "example", DomainMode: "contains"}, "api.example.com", "example.com", "notexample.com")
	assertDomains("advanced", QueryFilter{Client: "client-a", Type: "A", From: 75, To: 100}, "api.example.com", "notexample.com")
	queryID := int64(4)
	assertDomains("query id", QueryFilter{QueryID: &queryID}, "cdn.other.net")
}

func TestQueryDomainClientsSuffix(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prepareDB(db)

	now := time.Now().Unix()
	insert := func(timestamp int64, client, domain string) {
		t.Helper()
		if _, err := db.Exec(`INSERT INTO queries(timestamp, client, domain, type, query_id, source, reverse_domain) VALUES(?,?,?,?,?,?,?)`, timestamp, client, domain, "A", 1, "router", reverseDomain(domain)); err != nil {
			t.Fatal(err)
		}
	}
	insert(now, "client-a", "example.com")
	insert(now, "client-a", "api.example.com")
	insert(now, "client-a", "API.EXAMPLE.COM")
	insert(now, "client-b", "deep.api.example.com")
	insert(now, "client-c", "notexample.com")
	insert(now-48*60*60, "client-d", "old.example.com")

	clients, err := queryDomainClients(db, "example.com", now-24*60*60, true, 20, 0)
	if err != nil {
		t.Fatal(err)
	}
	want := []DomainClient{
		{Client: "client-a", QueryCount: 3, LastQuery: now},
		{Client: "client-b", QueryCount: 1, LastQuery: now},
	}
	if len(clients) != len(want) {
		t.Fatalf("client count = %d, want %d: %+v", len(clients), len(want), clients)
	}
	for i := range want {
		if clients[i] != want[i] {
			t.Errorf("client %d = %+v, want %+v", i, clients[i], want[i])
		}
	}

	exact, err := queryDomainClients(db, "example.com", now-24*60*60, false, 20, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(exact) != 1 || exact[0].Client != "client-a" || exact[0].QueryCount != 1 {
		t.Fatalf("exact match = %+v, want only client-a with one query", exact)
	}
}

func TestSuffixQueryUsesReverseDomainIndex(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prepareDB(db)
	prefix := reverseDomain("example.com") + "."
	rows, err := db.Query(`EXPLAIN QUERY PLAN
		SELECT id FROM queries
		WHERE timestamp >= ?
		  AND id IN (
			SELECT id FROM queries WHERE domain = ? COLLATE NOCASE
			UNION ALL
			SELECT id FROM queries WHERE reverse_domain >= ? AND reverse_domain < ?
		  )`, 0, "example.com", prefix, prefix+"\uffff")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var plan strings.Builder
	for rows.Next() {
		var id, parent, notUsed int
		var detail string
		if err := rows.Scan(&id, &parent, &notUsed, &detail); err != nil {
			t.Fatal(err)
		}
		plan.WriteString(detail)
		plan.WriteByte('\n')
	}
	if !strings.Contains(plan.String(), "idx_queries_reverse_domain_timestamp") {
		t.Fatalf("suffix query plan does not use reverse-domain index:\n%s", plan.String())
	}
}
