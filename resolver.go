package main

import (
	"context"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

type DNSResolution struct {
	Status   string   `json:"status"`
	Records  []string `json:"records"`
	Error    string   `json:"error,omitempty"`
	Duration int64    `json:"duration"`
}

func resolveDNS(domain, queryType string) DNSResolution {
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	resolver := &net.Resolver{}
	if server := os.Getenv("DNS_SERVER"); server != "" {
		resolver = &net.Resolver{PreferGo: true, Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, network, server+":53")
		}}
	}

	var records []string
	var err error
	queryType = strings.ToUpper(queryType)
	switch queryType {
	case "A", "AAAA":
		var values []net.IPAddr
		values, err = resolver.LookupIPAddr(ctx, domain)
		for _, value := range values {
			isIPv4 := value.IP.To4() != nil
			if (queryType == "A" && isIPv4) || (queryType == "AAAA" && !isIPv4) {
				records = append(records, value.IP.String())
			}
		}
	case "CNAME":
		var value string
		value, err = resolver.LookupCNAME(ctx, domain)
		if value != domain && value != domain+"." {
			records = append(records, value)
		}
	case "TXT":
		records, err = resolver.LookupTXT(ctx, domain)
		for index, value := range records {
			if len(value) > 200 {
				records[index] = value[:200] + "..."
			}
		}
	case "MX":
		var values []*net.MX
		values, err = resolver.LookupMX(ctx, domain)
		for _, value := range values {
			records = append(records, strconv.Itoa(int(value.Pref))+" "+value.Host)
		}
	case "NS":
		var values []*net.NS
		values, err = resolver.LookupNS(ctx, domain)
		for _, value := range values {
			records = append(records, value.Host)
		}
	case "PTR":
		records, err = resolver.LookupAddr(ctx, domain)
	default:
		var values []net.IPAddr
		values, err = resolver.LookupIPAddr(ctx, domain)
		for _, value := range values {
			records = append(records, value.IP.String())
		}
	}

	if records == nil {
		records = []string{}
	}
	result := DNSResolution{Records: records, Duration: time.Since(start).Milliseconds()}
	if err != nil {
		result.Status = "error"
		if strings.Contains(err.Error(), "no such host") || strings.Contains(err.Error(), "connection refused") {
			result.Status = "blocked"
		}
		result.Error = err.Error()
		return result
	}
	for _, record := range records {
		if record == "0.0.0.0" || record == "::" {
			result.Status = "blocked"
			result.Error = "Domain blocked (" + record + " response)"
			return result
		}
	}
	if len(records) == 0 {
		result.Status = "blocked"
		result.Error = "No records returned"
	} else {
		result.Status = "success"
	}
	return result
}
