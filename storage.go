package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/publicsuffix"
)

const defaultRetention = 24 * time.Hour

func parseRetention(value string) (time.Duration, error) {
	if value == "" {
		return defaultRetention, nil
	}
	hours, err := strconv.Atoi(value)
	if err != nil || hours <= 0 {
		return 0, errors.New("DATA_RETENTION_HOURS must be a positive integer")
	}
	retention := time.Duration(hours) * time.Hour
	if retention <= 0 {
		return 0, errors.New("DATA_RETENTION_HOURS is too large")
	}
	return retention, nil
}

func prepareDB(db *sql.DB) error {
	statements := []string{
		`PRAGMA journal_mode = WAL`,
		`CREATE TABLE IF NOT EXISTS queries(
			id INTEGER PRIMARY KEY,
			timestamp INTEGER NOT NULL,
			client TEXT NOT NULL,
			domain TEXT NOT NULL,
			type TEXT NOT NULL,
			query_id INTEGER NOT NULL,
			result TEXT,
			completed_at INTEGER,
			source TEXT NOT NULL,
			reverse_domain TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS raw_logs(
			id INTEGER PRIMARY KEY,
			received_at INTEGER NOT NULL,
			source TEXT NOT NULL,
			message TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_queries_timestamp ON queries(timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_queries_domain_timestamp_client ON queries(domain COLLATE NOCASE, timestamp, client)`,
		`CREATE INDEX IF NOT EXISTS idx_queries_client_timestamp ON queries(client, timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_queries_reverse_domain_timestamp ON queries(reverse_domain, timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_queries_source_query_id_timestamp ON queries(source, query_id, timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_raw_logs_received_at ON raw_logs(received_at)`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			return fmt.Errorf("database setup: %w", err)
		}
	}
	return nil
}

func purgeOld(db *sql.DB, retention time.Duration) {
	cutoff := time.Now().Add(-retention).Unix()
	for table, column := range map[string]string{"queries": "timestamp", "raw_logs": "received_at"} {
		if _, err := db.Exec(`DELETE FROM `+table+` WHERE `+column+` < ?`, cutoff); err != nil {
			log.Printf("Error purging %s: %v", table, err)
		}
	}
}

func storeRawLog(db *sql.DB, receivedAt int64, source, message string) {
	if _, err := db.Exec(`INSERT INTO raw_logs(received_at, source, message) VALUES(?,?,?)`, receivedAt, source, message); err != nil {
		log.Printf("Raw log insert error: %v", err)
	}
}

type DomainCount struct {
	Domain string `json:"domain"`
	Count  int    `json:"count"`
}

type DomainGroup struct {
	Domain      string `json:"domain"`
	Count       int    `json:"count"`
	DomainCount int    `json:"domain_count"`
}

type DomainClient struct {
	Client     string `json:"client"`
	QueryCount int    `json:"query_count"`
	LastQuery  int64  `json:"last_query"`
}

func normalizeDomain(domain string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(domain)), ".")
}

func registrableDomain(domain string) string {
	domain = normalizeDomain(domain)
	if value, err := publicsuffix.EffectiveTLDPlusOne(domain); err == nil {
		return value
	}
	return domain
}

func reverseDomain(domain string) string {
	runes := []rune(normalizeDomain(domain))
	for left, right := 0, len(runes)-1; left < right; left, right = left+1, right-1 {
		runes[left], runes[right] = runes[right], runes[left]
	}
	return string(runes)
}

func queryDomainCounts(db *sql.DB, cutoff int64, group string) ([]DomainCount, error) {
	query := `SELECT domain, COUNT(*) FROM queries WHERE timestamp >= ?`
	args := []any{cutoff}
	if group != "" {
		query += ` AND ` + suffixIDsSQL()
		args = append(args, suffixArgs(group)...)
	}
	rows, err := db.Query(query+` GROUP BY domain`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := make([]DomainCount, 0)
	for rows.Next() {
		var count DomainCount
		if err := rows.Scan(&count.Domain, &count.Count); err != nil {
			return nil, err
		}
		if group == "" || registrableDomain(count.Domain) == group {
			counts = append(counts, count)
		}
	}
	return counts, rows.Err()
}

func groupDomainCounts(counts []DomainCount) []DomainGroup {
	byDomain := make(map[string]DomainGroup)
	for _, count := range counts {
		domain := registrableDomain(count.Domain)
		group := byDomain[domain]
		group.Domain = domain
		group.Count += count.Count
		group.DomainCount++
		byDomain[domain] = group
	}
	groups := make([]DomainGroup, 0, len(byDomain))
	for _, group := range byDomain {
		groups = append(groups, group)
	}
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].Count == groups[j].Count {
			return groups[i].Domain < groups[j].Domain
		}
		return groups[i].Count > groups[j].Count
	})
	return groups
}

func suffixIDsSQL() string {
	return `id IN (
		SELECT id FROM queries WHERE domain = ? COLLATE NOCASE
		UNION ALL
		SELECT id FROM queries WHERE reverse_domain >= ? AND reverse_domain < ?
	)`
}

func suffixArgs(domain string) []any {
	prefix := reverseDomain(domain) + "."
	return []any{domain, prefix, prefix + "\uffff"}
}

func queryDomainClients(db *sql.DB, domain string, cutoff int64, suffix bool, pageSize, offset int) ([]DomainClient, error) {
	condition := `domain = ? COLLATE NOCASE`
	args := []any{cutoff, domain}
	if suffix {
		condition = suffixIDsSQL()
		args = append([]any{cutoff}, suffixArgs(domain)...)
	}
	args = append(args, pageSize, offset)
	rows, err := db.Query(`
		SELECT client, COUNT(*), MAX(timestamp)
		FROM queries WHERE timestamp >= ? AND `+condition+`
		GROUP BY client ORDER BY COUNT(*) DESC, MAX(timestamp) DESC
		LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	clients := make([]DomainClient, 0)
	for rows.Next() {
		var client DomainClient
		if err := rows.Scan(&client.Client, &client.QueryCount, &client.LastQuery); err != nil {
			return nil, err
		}
		clients = append(clients, client)
	}
	return clients, rows.Err()
}

type QueryRecord struct {
	ID                int64   `json:"id"`
	Timestamp         int64   `json:"timestamp"`
	CompletedAt       *int64  `json:"completed_at"`
	Source            string  `json:"source"`
	Client            string  `json:"client"`
	Domain            string  `json:"domain"`
	RegistrableDomain string  `json:"registrable_domain"`
	Type              string  `json:"type"`
	QueryID           int64   `json:"query_id"`
	Result            *string `json:"result"`
}

type QueryFilter struct {
	Domain     string
	DomainMode string
	Source     string
	Client     string
	Type       string
	QueryID    *int64
	From       int64
	To         int64
	PageSize   int
	Offset     int
}

func queryRecords(db *sql.DB, filter QueryFilter) ([]QueryRecord, error) {
	conditions := []string{"timestamp >= ?"}
	args := []any{filter.From}
	domain := normalizeDomain(filter.Domain)
	if domain != "" {
		switch filter.DomainMode {
		case "suffix":
			conditions = append(conditions, suffixIDsSQL())
			args = append(args, suffixArgs(domain)...)
		case "contains":
			conditions = append(conditions, `instr(lower(domain), ?) > 0`)
			args = append(args, domain)
		default:
			conditions = append(conditions, `domain = ? COLLATE NOCASE`)
			args = append(args, domain)
		}
	}
	for column, value := range map[string]string{"source": filter.Source, "client": filter.Client} {
		if value != "" {
			conditions = append(conditions, column+` = ?`)
			args = append(args, value)
		}
	}
	if filter.Type != "" {
		conditions = append(conditions, `type = ? COLLATE NOCASE`)
		args = append(args, filter.Type)
	}
	if filter.QueryID != nil {
		conditions = append(conditions, `query_id = ?`)
		args = append(args, *filter.QueryID)
	}
	if filter.To > 0 {
		conditions = append(conditions, `timestamp <= ?`)
		args = append(args, filter.To)
	}
	args = append(args, filter.PageSize, filter.Offset)
	rows, err := db.Query(`
		SELECT id, timestamp, completed_at, source, client, domain, type, query_id, result
		FROM queries WHERE `+strings.Join(conditions, " AND ")+`
		ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]QueryRecord, 0)
	for rows.Next() {
		var record QueryRecord
		var completedAt sql.NullInt64
		var result sql.NullString
		if err := rows.Scan(&record.ID, &record.Timestamp, &completedAt, &record.Source, &record.Client, &record.Domain, &record.Type, &record.QueryID, &result); err != nil {
			return nil, err
		}
		record.RegistrableDomain = registrableDomain(record.Domain)
		if completedAt.Valid {
			record.CompletedAt = &completedAt.Int64
		}
		if result.Valid {
			record.Result = &result.String
		}
		records = append(records, record)
	}
	return records, rows.Err()
}
