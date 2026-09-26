package main

import (
	"database/sql"
	"errors"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	queryLineRE       = regexp.MustCompile(`^(?:(?:query from (.+?))|local query): #(\d+) ([^ ]+)\. (\w+(?: \(\d+\))?)$`)
	doneLineRE        = regexp.MustCompile(`^done query: #(\d+) (.+)$`)
	syslogPriorityRE  = regexp.MustCompile(`^<\d{1,3}>`)
	iso8601TimeRE     = regexp.MustCompile(`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})`)
	bsdSyslogTimeRE   = regexp.MustCompile(`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+[ 0-9]\d \d{2}:\d{2}:\d{2}`)
	dnsMessageMarkers = []string{" query from ", " local query: ", " done query: "}
)

func handleLineFrom(db *sql.DB, source, line string) {
	timestamp, message, ok := parseSyslogLine(line)
	if !ok {
		log.Printf("Unparsed line: %s", line)
		return
	}
	if match := doneLineRE.FindStringSubmatch(message); match != nil {
		queryID, _ := strconv.ParseInt(match[1], 10, 64)
		result, err := db.Exec(`
			UPDATE queries SET result = ?, completed_at = ?
			WHERE id = (
				SELECT id FROM queries
				WHERE source = ? AND query_id = ? AND result IS NULL AND timestamp <= ?
				ORDER BY timestamp DESC, id DESC LIMIT 1
			)`, match[2], timestamp.Unix(), source, queryID, timestamp.Unix())
		if err != nil {
			log.Printf("DB update error: %v", err)
		} else if affected, _ := result.RowsAffected(); affected == 0 {
			log.Printf("Unmatched completed query: %s", line)
		}
		return
	}

	match := queryLineRE.FindStringSubmatch(message)
	if match == nil {
		log.Printf("Unparsed line: %s", line)
		return
	}
	client := match[1]
	if client == "" {
		client = "router"
	}
	queryID, _ := strconv.ParseInt(match[2], 10, 64)
	domain := normalizeDomain(match[3])
	queryType := match[4]
	if strings.HasPrefix(queryType, "UNKNOWN") {
		queryType = resolveUnknownType(queryType)
	}
	if queryType == "UNKNOWN" {
		log.Printf("Unknown type: [%s]", line)
	}
	if _, err := db.Exec(`INSERT INTO queries(timestamp, client, domain, type, query_id, source, reverse_domain) VALUES(?,?,?,?,?,?,?)`,
		timestamp.Unix(), client, domain, queryType, queryID, source, reverseDomain(domain)); err != nil {
		log.Printf("DB insert error: %v", err)
	}
}

func parseSyslogLine(line string) (time.Time, string, bool) {
	if !syslogPriorityRE.MatchString(line) {
		return time.Time{}, "", false
	}
	messageIndex := -1
	for _, marker := range dnsMessageMarkers {
		if index := strings.Index(line, marker); index >= 0 && (messageIndex == -1 || index+1 < messageIndex) {
			messageIndex = index + 1
		}
	}
	if messageIndex == -1 {
		return time.Time{}, "", false
	}
	prefix := line[:messageIndex]
	if value := iso8601TimeRE.FindString(prefix); value != "" {
		normalized := value
		if value[len(value)-3] != ':' && value[len(value)-1] != 'Z' {
			normalized = value[:len(value)-2] + ":" + value[len(value)-2:]
		}
		if timestamp, err := time.Parse(time.RFC3339Nano, normalized); err == nil {
			return timestamp, line[messageIndex:], true
		}
	}
	if value := bsdSyslogTimeRE.FindString(prefix); value != "" {
		if timestamp, err := time.ParseInLocation("Jan _2 15:04:05", value, time.Local); err == nil {
			now := time.Now()
			timestamp = timestamp.AddDate(now.Year(), 0, 0)
			if timestamp.After(now.Add(24 * time.Hour)) {
				timestamp = timestamp.AddDate(-1, 0, 0)
			}
			return timestamp, line[messageIndex:], true
		}
	}
	return time.Time{}, "", false
}

func resolveUnknownType(queryType string) string {
	number, err := extractDNSTypeNumber(queryType)
	if err != nil {
		return "UNKNOWN"
	}
	if name, ok := dnsTypes[number]; ok {
		return name
	}
	return "UNKNOWN"
}

func extractDNSTypeNumber(queryType string) (int, error) {
	start, end := strings.Index(queryType, "("), strings.Index(queryType, ")")
	if start == -1 || end <= start+1 {
		return 0, errors.New("invalid DNS type format")
	}
	number, err := strconv.Atoi(queryType[start+1 : end])
	if err != nil {
		return 0, errors.New("invalid DNS type number")
	}
	return number, nil
}

var dnsTypes = map[int]string{
	1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 15: "MX", 16: "TXT", 28: "AAAA",
	33: "SRV", 35: "NAPTR", 39: "DNAME", 41: "OPT", 43: "DS", 46: "RRSIG", 47: "NSEC",
	48: "DNSKEY", 50: "NSEC3", 51: "NSEC3PARAM", 52: "TLSA", 53: "SMIMEA", 55: "HIP",
	59: "CDS", 60: "CDNSKEY", 61: "OPENPGPKEY", 62: "CSYNC", 63: "ZONEMD", 64: "SVCB",
	65: "HTTPS", 99: "SPF", 108: "EUI48", 109: "EUI64", 257: "CAA",
}
