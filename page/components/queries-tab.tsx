"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { Copy, Download, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TabsContent } from "@/components/ui/tabs";
import { PaginationControls } from "@/components/pagination-controls";

interface QueryRecord {
  id: number;
  timestamp: number;
  completed_at: number | null;
  source: string;
  client: string;
  domain: string;
  registrable_domain: string;
  type: string;
  query_id: number;
  result: string | null;
}

interface DNSResolution {
  status: string;
  records: string[];
  error?: string;
  duration: number;
}

interface QueryFilters {
  domain: string;
  domainMode: "exact" | "suffix" | "contains";
  source: string;
  client: string;
  type: string;
  queryId: string;
  from: string;
  to: string;
}

interface QueriesTabProps {
  queryTypes: { type: string }[];
  refreshSeconds: number;
  copyToClipboard: (text: string) => void;
  formatTimestamp: (timestamp: number) => string;
}

const textFilters: Array<{
  key: "client" | "source" | "queryId";
  label: string;
  placeholder: string;
}> = [
  { key: "client", label: "Client", placeholder: "192.0.2.10 or router" },
  { key: "source", label: "Log source", placeholder: "Router IP address" },
  { key: "queryId", label: "RouterOS query ID", placeholder: "e.g. 22433118" },
];

const emptyFilters: QueryFilters = {
  domain: "",
  domainMode: "contains",
  source: "",
  client: "",
  type: "",
  queryId: "",
  from: "",
  to: "",
};

function appendTimeRange(params: URLSearchParams, filters: QueryFilters) {
  if (filters.from) params.set("from", String(Math.floor(new Date(filters.from).getTime() / 1000)));
  if (filters.to) params.set("to", String(Math.floor(new Date(filters.to).getTime() / 1000)));
}

function Detail({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-mono">{children}</dd>
    </div>
  );
}

export function QueriesTab({
  queryTypes,
  refreshSeconds,
  copyToClipboard,
  formatTimestamp,
}: QueriesTabProps) {
  const [queries, setQueries] = useState<QueryRecord[]>([]);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<QueryFilters>(emptyFilters);
  const [filters, setFilters] = useState<QueryFilters>(emptyFilters);
  const [advanced, setAdvanced] = useState(false);
  const [selected, setSelected] = useState<QueryRecord | null>(null);
  const [resolution, setResolution] = useState<DNSResolution | null>(null);
  const [resolving, setResolving] = useState(false);
  const [queryError, setQueryError] = useState("");
  const [filterError, setFilterError] = useState("");
  const latestRequest = useRef(0);
  const latestResolutionRequest = useRef(0);

  const fetchQueries = async () => {
    const request = ++latestRequest.current;
    const params = new URLSearchParams({
      page: String(page),
      page_size: "50",
      domain_mode: filters.domainMode,
    });
    for (const [key, value] of Object.entries({
      domain: filters.domain.trim(),
      source: filters.source.trim(),
      client: filters.client.trim(),
      type: filters.type,
      query_id: filters.queryId.trim(),
    })) {
      if (value) params.set(key, value);
    }
    appendTimeRange(params, filters);
    try {
      const response = await fetch(`/api/queries?${params}`);
      if (!response.ok) {
        throw new Error((await response.text()).trim() || `Query request failed (${response.status})`);
      }
      const data = await response.json();
      if (request === latestRequest.current) {
        setQueries(Array.isArray(data) ? data : []);
        setQueryError("");
      }
    } catch (error) {
      console.error("Failed to fetch queries:", error);
      if (request === latestRequest.current) {
        setQueries([]);
        setQueryError(error instanceof Error ? error.message : "Query request failed");
      }
    }
  };

  useEffect(() => {
    fetchQueries();
  }, [page, filters]);

  useEffect(() => {
    if (!refreshSeconds) return;
    const interval = setInterval(fetchQueries, refreshSeconds * 1000);
    return () => clearInterval(interval);
  }, [page, filters, refreshSeconds]);

  const resolveSelected = async () => {
    if (!selected) return;
    const request = ++latestResolutionRequest.current;
    setResolving(true);
    setResolution(null);
    try {
      const params = new URLSearchParams({ domain: selected.domain, type: selected.type });
      const response = await fetch(`/api/resolve-domain?${params}`);
      if (!response.ok) {
        throw new Error((await response.text()).trim() || `Resolution request failed (${response.status})`);
      }
      const data = await response.json();
      if (request === latestResolutionRequest.current) {
        setResolution({ ...data, records: Array.isArray(data.records) ? data.records : [] });
      }
    } catch (error) {
      if (request === latestResolutionRequest.current) {
        setResolution({ status: "error", records: [], error: error instanceof Error ? error.message : "Resolution request failed", duration: 0 });
      }
    } finally {
      if (request === latestResolutionRequest.current) {
        setResolving(false);
      }
    }
  };

  const selectQuery = (query: QueryRecord | null) => {
    latestResolutionRequest.current++;
    setSelected(query);
    setResolution(null);
    setResolving(false);
  };

  const downloadRawLogs = () => {
    const params = new URLSearchParams();
    appendTimeRange(params, draft);
    window.location.assign(`/api/raw-logs?${params}`);
  };

  const setFilter = <K extends keyof QueryFilters>(key: K, value: QueryFilters[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const visibleError = filterError || queryError;

  return (
    <TabsContent value="queries" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>DNS Queries</CardTitle>
          <CardDescription>Search query history, then select a row to inspect every captured field.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.queryId.trim() && !/^\d+$/.test(draft.queryId.trim())) {
                setFilterError("RouterOS query ID must be a non-negative integer");
                return;
              }
              setFilterError("");
              setPage(1);
              setFilters({ ...draft });
            }}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={draft.domain} onChange={(event) => setFilter("domain", event.target.value)} placeholder="Search domains" className="flex-1 font-mono" />
              <Button type="submit"><Search className="h-4 w-4" />Search</Button>
              <Button type="button" variant="outline" onClick={() => setAdvanced(!advanced)}><SlidersHorizontal className="h-4 w-4" />Advanced</Button>
              <Button type="button" variant="outline" onClick={downloadRawLogs} title="Download raw logs using the From and To filters"><Download className="h-4 w-4" />Raw logs</Button>
            </div>

            {advanced && (
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium">Domain match</span>
                  <Select value={draft.domainMode} onValueChange={(value: QueryFilters["domainMode"]) => setFilter("domainMode", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="suffix">Domain + subdomains</SelectItem>
                      <SelectItem value="exact">Exact domain</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {textFilters.map(({ key, label, placeholder }) => (
                  <label key={key} className="space-y-1.5 text-sm">
                    <span className="font-medium">{label}</span>
                    <Input value={draft[key]} onChange={(event) => setFilter(key, event.target.value)} placeholder={placeholder} className="font-mono" inputMode={key === "queryId" ? "numeric" : undefined} />
                  </label>
                ))}
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium">Query type</span>
                  <Select value={draft.type || "all"} onValueChange={(value) => setFilter("type", value === "all" ? "" : value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {queryTypes.map((item) => <SelectItem key={item.type} value={item.type}>{item.type}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                {(["from", "to"] as const).map((key) => (
                  <label key={key} className="space-y-1.5 text-sm">
                    <span className="font-medium">{key === "from" ? "From" : "To"}</span>
                    <Input type="datetime-local" value={draft[key]} onChange={(event) => setFilter(key, event.target.value)} />
                  </label>
                ))}
                <div className="flex items-end sm:col-span-2 lg:col-span-3">
                  <Button type="button" variant="ghost" onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); setFilterError(""); setQueryError(""); setPage(1); }}>Reset all filters</Button>
                </div>
              </div>
            )}
          </form>

          {visibleError && (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {visibleError}
            </div>
          )}

          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full whitespace-nowrap">
              <thead><tr className="border-b bg-muted/50">
                {[["Time", "text-left"], ["Client", "text-left"], ["Domain", "text-left"], ["Type", "text-right"], ["Status", "text-right"]].map(([label, align]) => <th key={label} className={`${align} p-3 text-sm font-medium text-muted-foreground`}>{label}</th>)}
              </tr></thead>
              <tbody>
                {!visibleError && queries.map((query) => (
                  <tr
                    key={query.id}
                    className="cursor-pointer border-b transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none"
                    tabIndex={0}
                    onClick={() => selectQuery(query)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault(); selectQuery(query);
                      }
                    }}
                  >
                    <td className="p-3 font-mono text-xs text-muted-foreground">{formatTimestamp(query.timestamp)}</td>
                    <td className="p-3 font-mono text-xs text-blue-600 dark:text-blue-400">{query.client}</td>
                    <td className="p-3 font-mono text-sm">{query.domain}</td>
                    <td className="p-3 text-right"><Badge variant="outline">{query.type}</Badge></td>
                    <td className="p-3 text-right"><Badge variant={query.completed_at ? "secondary" : "outline"}>{query.completed_at ? "Completed" : "Pending"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleError && !queries.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No queries match these filters.</div>
            ) : null}
          </div>
          <PaginationControls page={page} onPrevious={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(page + 1)} nextDisabled={Boolean(visibleError) || queries.length < 50} />
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) selectQuery(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {selected && <>
            <DialogHeader><DialogTitle>DNS query details</DialogTitle><DialogDescription>Captured RouterOS fields and the correlated completion message.</DialogDescription></DialogHeader>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Started">{formatTimestamp(selected.timestamp)}</Detail>
              <Detail label="Completed">{selected.completed_at ? formatTimestamp(selected.completed_at) : "Not captured"}</Detail>
              <Detail label="Client">{selected.client}</Detail>
              <Detail label="Log source">{selected.source}</Detail>
              <Detail label="RouterOS query ID">{selected.query_id}</Detail>
              <Detail label="Query type"><Badge variant="outline">{selected.type}</Badge></Detail>
              <Detail label="Full domain" wide>{selected.domain}</Detail>
              <Detail label="Registrable domain (PSL)" wide>{selected.registrable_domain}</Detail>
              <Detail label="RouterOS completion result" wide><span className="mt-1 block rounded-md bg-muted p-3 text-xs">{selected.result ?? "No done query message captured"}</span></Detail>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => copyToClipboard(selected.domain)}><Copy className="h-4 w-4" />Copy domain</Button>
              <Button variant="outline" onClick={() => { const next = { ...emptyFilters, client: selected.client }; setDraft(next); setFilters(next); setPage(1); selectQuery(null); }}>Filter by client</Button>
              <Button onClick={resolveSelected} disabled={resolving}><RefreshCw className={`h-4 w-4 ${resolving ? "animate-spin" : ""}`} />{resolving ? "Resolving..." : "Resolve now"}</Button>
            </div>
            {resolution && <div className="rounded-lg border p-4 text-sm">
              <div className="mb-2 flex items-center gap-2"><span className="font-medium">Live resolution</span><Badge variant="outline">{resolution.status} · {resolution.duration}ms</Badge></div>
              {resolution.records?.length ? <div className="space-y-1 font-mono text-xs">{resolution.records.map((record) => <div key={record}>{record}</div>)}</div> : <div className="text-muted-foreground">{resolution.error || "No records returned"}</div>}
            </div>}
          </>}
        </DialogContent>
      </Dialog>
    </TabsContent>
  );
}
