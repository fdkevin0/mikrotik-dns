package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestResolveDNSAlwaysReturnsRecordsArray(t *testing.T) {
	result := resolveDNS("invalid\x00domain", "A")
	if result.Records == nil {
		t.Fatal("resolution records are nil")
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), `"records":null`) {
		t.Fatalf("resolution encoded null records: %s", encoded)
	}
}
