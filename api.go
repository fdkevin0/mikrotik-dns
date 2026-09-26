package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

type api struct {
	db        *sql.DB
	retention time.Duration
}

func serveAPI(db *sql.DB, retention time.Duration) {
	server := api{db: db, retention: retention}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/top-domains", server.topDomains)
	mux.HandleFunc("/api/top-domain-groups", server.topDomainGroups)
	mux.HandleFunc("/api/domain-group-members", server.domainGroupMembers)
	mux.HandleFunc("/api/query-types", server.queryTypes)
	mux.HandleFunc("/api/clients", server.clients)
	mux.HandleFunc("/api/unique-clients-count", server.uniqueClients)
	mux.HandleFunc("/api/unique-domains-count", server.uniqueDomains)
	mux.HandleFunc("/api/queries-per-minute", server.queryRate)
	mux.HandleFunc("/api/ipv4-vs-ipv6", server.ipVersions)
	mux.HandleFunc("/api/domain-clients", server.domainClients)
	mux.HandleFunc("/api/client-queries", server.clientQueries)
	mux.HandleFunc("/api/queries", server.queries)
	mux.HandleFunc("/api/resolve-domain", server.resolveDomain)
	mux.HandleFunc("/api/raw-logs", server.rawLogs)

	log.Println("Starting HTTP server on :8080")
	log.Fatal(http.ListenAndServe(":8080", corsMiddleware(loggingMiddleware(mux))))
}

func (server api) cutoff() int64 { return time.Now().Add(-server.retention).Unix() }

func pagination(request *http.Request, defaultSize, maxSize int) (page, pageSize, offset int) {
	page, pageSize = 1, defaultSize
	if value, err := strconv.Atoi(request.URL.Query().Get("page")); err == nil && value > 0 {
		page = value
	}
	if value, err := strconv.Atoi(request.URL.Query().Get("page_size")); err == nil && value > 0 {
		pageSize = min(value, maxSize)
	}
	return page, pageSize, (page - 1) * pageSize
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("JSON response error: %v", err)
	}
}

func dbError(w http.ResponseWriter, err error) {
	log.Printf("Database error: %v", err)
	http.Error(w, "DB error", http.StatusInternalServerError)
}

func (server api) topDomains(w http.ResponseWriter, _ *http.Request) {
	rows, err := server.db.Query(`SELECT domain, COUNT(*) FROM queries WHERE timestamp >= ? GROUP BY domain ORDER BY COUNT(*) DESC LIMIT 20`, server.cutoff())
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()
	items := make([]DomainCount, 0)
	for rows.Next() {
		var item DomainCount
		if err := rows.Scan(&item.Domain, &item.Count); err != nil {
			dbError(w, err)
			return
		}
		items = append(items, item)
	}
	writeJSON(w, items)
}

func (server api) topDomainGroups(w http.ResponseWriter, _ *http.Request) {
	counts, err := queryDomainCounts(server.db, server.cutoff())
	if err != nil {
		dbError(w, err)
		return
	}
	groups := groupDomainCounts(counts)
	if len(groups) > 20 {
		groups = groups[:20]
	}
	writeJSON(w, groups)
}

func (server api) domainGroupMembers(w http.ResponseWriter, request *http.Request) {
	group := registrableDomain(request.URL.Query().Get("group"))
	if group == "" {
		http.Error(w, "group query param required", http.StatusBadRequest)
		return
	}
	_, pageSize, offset := pagination(request, 20, 200)
	counts, err := queryDomainCounts(server.db, server.cutoff())
	if err != nil {
		dbError(w, err)
		return
	}
	members := make([]DomainCount, 0)
	for _, count := range counts {
		if registrableDomain(count.Domain) == group {
			members = append(members, count)
		}
	}
	sort.Slice(members, func(i, j int) bool {
		if members[i].Count == members[j].Count {
			return members[i].Domain < members[j].Domain
		}
		return members[i].Count > members[j].Count
	})
	if offset >= len(members) {
		members = members[:0]
	} else {
		members = members[offset:min(offset+pageSize, len(members))]
	}
	writeJSON(w, members)
}

func (server api) queryTypes(w http.ResponseWriter, _ *http.Request) {
	rows, err := server.db.Query(`SELECT type, COUNT(*) FROM queries WHERE timestamp >= ? GROUP BY type ORDER BY COUNT(*) DESC`, server.cutoff())
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()
	type item struct {
		Type  string `json:"type"`
		Count int    `json:"count"`
	}
	items := make([]item, 0)
	for rows.Next() {
		var value item
		if err := rows.Scan(&value.Type, &value.Count); err != nil {
			dbError(w, err)
			return
		}
		items = append(items, value)
	}
	writeJSON(w, items)
}

func (server api) clients(w http.ResponseWriter, _ *http.Request) {
	rows, err := server.db.Query(`SELECT client, COUNT(*) FROM queries WHERE timestamp >= ? GROUP BY client ORDER BY COUNT(*) DESC LIMIT 20`, server.cutoff())
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()
	type item struct {
		Client string `json:"client"`
		Count  int    `json:"count"`
	}
	items := make([]item, 0)
	for rows.Next() {
		var value item
		if err := rows.Scan(&value.Client, &value.Count); err != nil {
			dbError(w, err)
			return
		}
		items = append(items, value)
	}
	writeJSON(w, items)
}

func (server api) countDistinct(w http.ResponseWriter, column string) {
	var count int
	if err := server.db.QueryRow(`SELECT COUNT(DISTINCT `+column+`) FROM queries WHERE timestamp >= ?`, server.cutoff()).Scan(&count); err != nil {
		dbError(w, err)
		return
	}
	writeJSON(w, struct {
		Count int `json:"count"`
	}{count})
}

func (server api) uniqueClients(w http.ResponseWriter, _ *http.Request) {
	server.countDistinct(w, "client")
}

func (server api) uniqueDomains(w http.ResponseWriter, _ *http.Request) {
	server.countDistinct(w, "domain")
}

func (server api) queryRate(w http.ResponseWriter, _ *http.Request) {
	var count int
	if err := server.db.QueryRow(`SELECT COUNT(*) FROM queries WHERE timestamp >= ?`, server.cutoff()).Scan(&count); err != nil {
		dbError(w, err)
		return
	}
	minutes := int(server.retention / time.Minute)
	writeJSON(w, struct {
		QueriesPerMinute float64 `json:"queries_per_minute"`
		TotalQueries     int     `json:"total_queries"`
		TimeWindow       int     `json:"time_window_minutes"`
	}{float64(count) / float64(minutes), count, minutes})
}

func (server api) ipVersions(w http.ResponseWriter, _ *http.Request) {
	rows, err := server.db.Query(`
		SELECT CASE WHEN INSTR(client, ':') > 0 THEN 'IPv6' ELSE 'IPv4' END, COUNT(*)
		FROM queries WHERE timestamp >= ? AND client != 'router' GROUP BY 1`, server.cutoff())
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()
	type item struct {
		IPType string `json:"ip_type"`
		Count  int    `json:"count"`
	}
	items := make([]item, 0, 2)
	for rows.Next() {
		var value item
		if err := rows.Scan(&value.IPType, &value.Count); err != nil {
			dbError(w, err)
			return
		}
		items = append(items, value)
	}
	writeJSON(w, items)
}

func (server api) domainClients(w http.ResponseWriter, request *http.Request) {
	domain := normalizeDomain(request.URL.Query().Get("domain"))
	if domain == "" {
		http.Error(w, "domain query param required", http.StatusBadRequest)
		return
	}
	_, pageSize, offset := pagination(request, 20, 200)
	clients, err := queryDomainClients(server.db, domain, server.cutoff(), request.URL.Query().Get("suffix") == "true", pageSize, offset)
	if err != nil {
		dbError(w, err)
		return
	}
	writeJSON(w, clients)
}

func (server api) clientQueries(w http.ResponseWriter, request *http.Request) {
	client := strings.TrimSpace(request.URL.Query().Get("client"))
	if client == "" {
		http.Error(w, "client query param required", http.StatusBadRequest)
		return
	}
	_, pageSize, offset := pagination(request, 20, 200)
	rows, err := server.db.Query(`SELECT timestamp, domain, type FROM queries WHERE client = ? AND timestamp >= ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`, client, server.cutoff(), pageSize, offset)
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()
	type item struct {
		Timestamp int64  `json:"timestamp"`
		Domain    string `json:"domain"`
		Type      string `json:"type"`
	}
	items := make([]item, 0)
	for rows.Next() {
		var value item
		if err := rows.Scan(&value.Timestamp, &value.Domain, &value.Type); err != nil {
			dbError(w, err)
			return
		}
		items = append(items, value)
	}
	writeJSON(w, items)
}

func (server api) queries(w http.ResponseWriter, request *http.Request) {
	_, pageSize, offset := pagination(request, 50, 200)
	domainMode := request.URL.Query().Get("domain_mode")
	if domainMode == "" {
		domainMode = "contains"
	}
	if domainMode != "exact" && domainMode != "suffix" && domainMode != "contains" {
		http.Error(w, "domain_mode must be exact, suffix, or contains", http.StatusBadRequest)
		return
	}
	from := server.cutoff()
	if value, err := strconv.ParseInt(request.URL.Query().Get("from"), 10, 64); err == nil && value > from {
		from = value
	}
	to, _ := strconv.ParseInt(request.URL.Query().Get("to"), 10, 64)
	var queryID *int64
	if raw := request.URL.Query().Get("query_id"); raw != "" {
		value, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || value < 0 {
			http.Error(w, "query_id must be a non-negative integer", http.StatusBadRequest)
			return
		}
		queryID = &value
	}
	records, err := queryRecords(server.db, QueryFilter{
		Domain: request.URL.Query().Get("domain"), DomainMode: domainMode,
		Source: strings.TrimSpace(request.URL.Query().Get("source")), Client: strings.TrimSpace(request.URL.Query().Get("client")),
		Type: strings.TrimSpace(request.URL.Query().Get("type")), QueryID: queryID,
		From: from, To: to, PageSize: pageSize, Offset: offset,
	})
	if err != nil {
		dbError(w, err)
		return
	}
	writeJSON(w, records)
}

func (server api) resolveDomain(w http.ResponseWriter, request *http.Request) {
	domain := normalizeDomain(request.URL.Query().Get("domain"))
	if domain == "" {
		http.Error(w, "domain query param required", http.StatusBadRequest)
		return
	}
	queryType := strings.TrimSpace(request.URL.Query().Get("type"))
	if queryType == "" {
		queryType = "A"
	}
	writeJSON(w, resolveDNS(domain, queryType))
}

func (server api) rawLogs(w http.ResponseWriter, request *http.Request) {
	from := server.cutoff()
	if value, err := strconv.ParseInt(request.URL.Query().Get("from"), 10, 64); err == nil && value > from {
		from = value
	}
	to := time.Now().Unix()
	if value, err := strconv.ParseInt(request.URL.Query().Get("to"), 10, 64); err == nil && value > 0 {
		to = value
	}
	limit := -1
	if value, err := strconv.Atoi(request.URL.Query().Get("limit")); err == nil && value > 0 {
		limit = value
	}
	rows, err := server.db.Query(`
		SELECT received_at, source, message FROM (
			SELECT id, received_at, source, message FROM raw_logs
			WHERE received_at >= ? AND received_at <= ?
			ORDER BY received_at DESC, id DESC LIMIT ?
		) ORDER BY received_at, id`, from, to, limit)
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Content-Disposition", `attachment; filename="mikrotik-raw-logs.jsonl"`)
	encoder := json.NewEncoder(w)
	for rows.Next() {
		var item struct {
			ReceivedAt int64  `json:"received_at"`
			Source     string `json:"source"`
			Message    string `json:"message"`
		}
		if err := rows.Scan(&item.ReceivedAt, &item.Source, &item.Message); err != nil {
			return
		}
		if err := encoder.Encode(item); err != nil {
			return
		}
	}
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, request)
		log.Printf("%s %s %v", request.Method, request.URL.Path, time.Since(start))
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if request.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, request)
	})
}
