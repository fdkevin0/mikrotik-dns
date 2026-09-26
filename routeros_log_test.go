package main

import (
	"database/sql"
	"testing"
)

func TestHandleLineRecordsRouterOSFields(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prepareDB(db)

	handleLineFrom(db, "198.51.100.1", "<30>2026-09-26T12:00:00Z router dns,info dns query from 192.0.2.10: #22433118 WWW.Example.COM. A")
	handleLineFrom(db, "198.51.100.1", "<30>2026-09-26T12:00:01Z router dns,info dns done query: #22433118 www.example.com 192.0.2.50")
	handleLineFrom(db, "198.51.100.1", "<30>Sep 26 12:00:02 router dns,info dns local query: #33347 cloud.mikrotik.com. AAAA")
	handleLineFrom(db, "198.51.100.1", "<30>2026-09-26T12:00:03Z router dns,info dns query from 2001:db8::1: #44 service.example. UNKNOWN (65)")

	records, err := queryRecords(db, QueryFilter{From: 0, PageSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 3 {
		t.Fatalf("record count = %d, want 3", len(records))
	}
	byID := make(map[int64]QueryRecord)
	for _, record := range records {
		byID[record.QueryID] = record
	}
	remote := byID[22433118]
	if remote.Source != "198.51.100.1" || remote.Client != "192.0.2.10" || remote.Domain != "www.example.com" || remote.Type != "A" {
		t.Errorf("remote query = %+v", remote)
	}
	if remote.Result == nil || *remote.Result != "www.example.com 192.0.2.50" || remote.CompletedAt == nil {
		t.Errorf("completed query fields = %+v", remote)
	}
	local := byID[33347]
	if local.Client != "router" || local.Domain != "cloud.mikrotik.com" || local.Type != "AAAA" {
		t.Errorf("local query = %+v", local)
	}
	if got := byID[44].Type; got != "HTTPS" {
		t.Errorf("unknown type resolution = %q, want HTTPS", got)
	}
}

func TestHandleLineRejectsDefaultFormat(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prepareDB(db)

	handleLineFrom(db, "198.51.100.1", "2026-09-26 12:00:00 dns query from 192.0.2.10: #22433118 example.com. A")

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM queries`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("default-format record count = %d, want 0", count)
	}
}

func TestDoneQueryMatchesSameLogSource(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prepareDB(db)
	handleLineFrom(db, "router-a", "<30>2026-09-26T12:00:00Z router-a dns,info dns query from 192.0.2.1: #7 one.example. A")
	handleLineFrom(db, "router-b", "<30>2026-09-26T12:00:00Z router-b dns,info dns query from 192.0.2.2: #7 two.example. A")
	handleLineFrom(db, "router-a", "<30>2026-09-26T12:00:01Z router-a dns,info dns done query: #7 one.example 192.0.2.7")

	for _, test := range []struct {
		source     string
		wantResult bool
	}{
		{source: "router-a", wantResult: true},
		{source: "router-b", wantResult: false},
	} {
		records, err := queryRecords(db, QueryFilter{Source: test.source, From: 0, PageSize: 10})
		if err != nil {
			t.Fatal(err)
		}
		if len(records) != 1 {
			t.Fatalf("%s record count = %d, want 1", test.source, len(records))
		}
		if (records[0].Result != nil) != test.wantResult {
			t.Errorf("%s result = %v, want present %v", test.source, records[0].Result, test.wantResult)
		}
	}
}

func TestDelayedDoneQueryDoesNotCompleteNewerReusedID(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prepareDB(db)

	handleLineFrom(db, "router-a", "<30>2026-09-26T12:00:00Z router-a dns,info dns query from 192.0.2.1: #7 old.example. A")
	handleLineFrom(db, "router-a", "<30>2026-09-26T12:01:00Z router-a dns,info dns query from 192.0.2.1: #7 new.example. A")
	handleLineFrom(db, "router-a", "<30>2026-09-26T12:00:01Z router-a dns,info dns done query: #7 old.example 192.0.2.7")

	records, err := queryRecords(db, QueryFilter{From: 0, PageSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	byDomain := make(map[string]QueryRecord)
	for _, record := range records {
		byDomain[record.Domain] = record
	}
	if byDomain["old.example"].Result == nil {
		t.Error("delayed completion did not match the older eligible query")
	}
	if byDomain["new.example"].Result != nil {
		t.Error("delayed completion incorrectly matched the newer query")
	}
}
