"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  Users,
  Globe,
  Search,
  RefreshCw,
  Github,
  Play,
  Pause,
  Clock,
  TrendingUp,
  Shield,
  AlertTriangle,
  Zap,
  Network,
  BarChart3,
} from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { DarkModeSwitch } from "@/components/dark-mode-switch";
import { useToast } from "@/hooks/use-toast";

interface DomainData {
  domain: string;
  count: number;
}

interface QueryTypeData {
  type: string;
  count: number;
}

interface ClientData {
  client: string;
  count: number;
}

interface ClientQuery {
  timestamp: number;
  domain: string;
  type: string;
}

interface DomainClient {
  client: string;
  query_count: number;
  last_query: number;
}

interface AllQuery {
  timestamp: number;
  client: string;
  domain: string;
  type: string;
}

interface DNSResolution {
  status: string;
  records: string[];
  error?: string;
  duration: number;
}

interface DomainWithResolution {
  domain: string;
  type: string;
  resolution: DNSResolution;
}

const resolutionStatusStyles: Record<string, [string, string]> = {
  success: ["bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300", "✓"],
  blocked: ["bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300", "✗"],
  error: ["bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300", "⚠"],
  default: ["bg-muted text-muted-foreground", "?"],
};

export default function DNSDashboard() {
  const { toast } = useToast();
  const [topDomains, setTopDomains] = useState<DomainData[]>([]);
  const [queryTypes, setQueryTypes] = useState<QueryTypeData[]>([]);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [clientQueries, setClientQueries] = useState<ClientQuery[]>([]);
  const [allQueries, setAllQueries] = useState<AllQuery[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [uniqueClientsCount, setUniqueClientsCount] = useState(0);
  const [uniqueDomainsCount, setUniqueDomainsCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<DomainWithResolution[]>(
    [],
  );
  const [searchPage, setSearchPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [queriesPerMinute, setQueriesPerMinute] = useState(0);
  const [ipv4Count, setIpv4Count] = useState(0);
  const [ipv6Count, setIpv6Count] = useState(0);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [domainClients, setDomainClients] = useState<DomainClient[]>([]);
  const [domainPage, setDomainPage] = useState(1);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        domainsRes,
        typesRes,
        clientsRes,
        uniqueClientsRes,
        uniqueDomainsRes,
        qpsRes,
        ipvRes,
      ] = await Promise.all([
        fetch("/api/top-domains"),
        fetch("/api/query-types"),
        fetch("/api/clients"),
        fetch("/api/unique-clients-count"),
        fetch("/api/unique-domains-count"),
        fetch("/api/queries-per-minute"),
        fetch("/api/ipv4-vs-ipv6"),
      ]);

      const domainsData = await domainsRes.json();
      const typesData = await typesRes.json();
      const clientsData = await clientsRes.json();

      setTopDomains(Array.isArray(domainsData) ? domainsData : []);
      setQueryTypes(Array.isArray(typesData) ? typesData : []);
      setClients(Array.isArray(clientsData) ? clientsData : []);

      const uniqueClientsData = await uniqueClientsRes.json();
      setUniqueClientsCount(uniqueClientsData?.count || 0);

      const uniqueDomainsData = await uniqueDomainsRes.json();
      setUniqueDomainsCount(uniqueDomainsData?.count || 0);

      const qpmData = await qpsRes.json();
      setQueriesPerMinute(qpmData?.queries_per_minute || 0);

      const ipvData = await ipvRes.json();
      const ipv4 =
        ipvData?.find((item: any) => item.ip_type === "IPv4")?.count || 0;
      const ipv6 =
        ipvData?.find((item: any) => item.ip_type === "IPv6")?.count || 0;
      setIpv4Count(ipv4);
      setIpv6Count(ipv6);

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClientQueries = async (client: string, page = 1) => {
    try {
      const res = await fetch(
        `/api/client-queries?client=${client}&page=${page}&page_size=20`,
      );
      const data = await res.json();
      setClientQueries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch client queries:", error);
    }
  };

  const fetchAllQueries = async (page = 1) => {
    try {
      const res = await fetch(
        `/api/all-queries?page=${page}&page_size=50`,
      );
      const data = await res.json();
      setAllQueries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch all queries:", error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchAllQueries(1);
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetchClientQueries(selectedClient, currentPage);
    }
  }, [selectedClient, currentPage]);

  useEffect(() => {
    if (selectedDomain) {
      fetchDomainClients(selectedDomain, domainPage);
    }
  }, [selectedDomain, domainPage]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (autoRefresh && refreshInterval > 0) {
      interval = setInterval(() => {
        fetchData();
        if (!selectedClient) {
          fetchAllQueries(currentPage);
        }
      }, refreshInterval * 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, refreshInterval, selectedClient, currentPage]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const copyToClipboard = async (text: string) => {
    try {
      // Try modern Clipboard API first (works on HTTPS, localhost, 127.0.0.1)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast({
          title: "Copied to clipboard",
          description: text,
        });
        return;
      }

      // Fallback for non-HTTPS environments
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        const result = document.execCommand("copy");
        if (result) {
          toast({
            title: "Copied to clipboard",
            description: text,
          });
        } else {
          throw new Error("execCommand failed");
        }
      } finally {
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error("Failed to copy text: ", err);
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const searchDomains = async (term: string, page = 1) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        domain: term.trim(),
        partial: "true",
        page: page.toString(),
        page_size: "20",
      });
      const res = await fetch(`/api/domain-queries?${params}`);
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to search domains:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchDomainClients = async (domain: string, page = 1) => {
    try {
      const res = await fetch(
        `/api/domain-clients?domain=${domain}&page=${page}&page_size=20`,
      );
      const data = await res.json();
      setDomainClients(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch domain clients:", error);
      setDomainClients([]);
    }
  };

  const totalQueries = queryTypes.reduce((sum, item) => sum + item.count, 0);
  const unknownQueries =
    queryTypes.find((type) => type.type === "UNKNOWN")?.count || 0;
  const resolutionRate = totalQueries
    ? ((totalQueries - unknownQueries) / totalQueries) * 100
    : 0;

  return (
    <main className="min-h-screen bg-background px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <Network className="h-4 w-4" />
              MikroTik DNS
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              DNS Analytics
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Network query activity from the last 24 hours
            </p>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <DarkModeSwitch />
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  window.open(
                    "https://github.com/publi0/mikrotik-dns",
                    "_blank",
                  )
                }
                aria-label="Open GitHub repository"
              >
                <Github className="h-4 w-4" />
              </Button>

              <div className="flex h-10 items-center gap-2 rounded-md border bg-card px-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  aria-label={autoRefresh ? "Pause auto refresh" : "Start auto refresh"}
                  className={`h-7 w-7 ${
                    autoRefresh
                      ? "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {autoRefresh ? (
                    <Pause className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                </Button>

                <div className="flex items-center">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={refreshInterval.toString()}
                    onValueChange={(value) => setRefreshInterval(Number(value))}
                    disabled={!autoRefresh}
                  >
                    <SelectTrigger
                      aria-label="Auto refresh interval"
                      className={`h-8 w-16 border-0 bg-transparent px-2 text-xs shadow-none focus:ring-0 ${
                        autoRefresh
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5s</SelectItem>
                      <SelectItem value="10">10s</SelectItem>
                      <SelectItem value="30">30s</SelectItem>
                      <SelectItem value="60">1m</SelectItem>
                      <SelectItem value="300">5m</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={fetchData}
                disabled={loading}
                className="flex-1 sm:flex-none"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>
        </header>

        {/* Stats Cards */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Total Queries */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground sm:text-sm">
                    Total queries
                  </div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">
                    <AnimatedNumber value={totalQueries} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Last 24 hours
                  </div>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <Activity className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Failed Queries */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground sm:text-sm">
                    Failed queries
                  </div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">
                    <AnimatedNumber value={unknownQueries} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {totalQueries > 0
                      ? ((unknownQueries / totalQueries) * 100).toFixed(1)
                      : "0"}
                    % of total
                  </div>
                </div>
                <div className="rounded-lg bg-red-50 p-2 text-red-600 dark:bg-red-950 dark:text-red-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Clients */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground sm:text-sm">
                    Active clients
                  </div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">
                    <AnimatedNumber value={uniqueClientsCount} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Unique IP addresses
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Unique Domains */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground sm:text-sm">
                    Unique domains
                  </div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">
                    <AnimatedNumber value={uniqueDomainsCount} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Different domains
                  </div>
                </div>
                <div className="rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                  <Globe className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Main Content */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-5"
        >
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-muted p-1 sm:inline-flex sm:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="domains">Domains</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="queries">All Queries</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Overview Grid */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {/* Query Types - Modern Design */}
              <Card className="col-span-1">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-600" />
                    <CardTitle>Query Types</CardTitle>
                  </div>
                  <CardDescription>DNS query distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {queryTypes.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No query data yet
                      </p>
                    )}
                    {queryTypes.slice(0, 6).map((item) => {
                        const percentage =
                          totalQueries > 0
                            ? (item.count / totalQueries) * 100
                            : 0;
                        const isUnknown = item.type === "UNKNOWN";
                        return (
                          <div key={item.type} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`h-2 w-2 rounded-full ${isUnknown ? "bg-red-500" : "bg-primary"}`}
                                />
                                <span
                                  className={`text-sm font-medium ${isUnknown ? "text-red-600 dark:text-red-400" : ""}`}
                                >
                                  {item.type}
                                </span>
                                {isUnknown && (
                                  <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
                                )}
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-sm">
                                  {item.count.toLocaleString()}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {percentage.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                            <Progress
                              value={percentage}
                              className={`h-1.5 ${isUnknown ? "[&>div]:bg-red-500" : ""}`}
                            />
                          </div>
                        );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Top Domains - Enhanced */}
              <Card className="col-span-1">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-green-600" />
                    <CardTitle>Top Domains</CardTitle>
                  </div>
                  <CardDescription>Most requested domains</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topDomains.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No domain activity yet
                      </p>
                    )}
                    {topDomains.slice(0, 8).map((item, index) => {
                        const maxCount = topDomains[0]?.count || 1;
                        const percentage = (item.count / maxCount) * 100;
                        const isTopThree = index < 3;

                        return (
                          <button
                            type="button"
                            key={item.domain}
                            className="w-full rounded-lg border p-3 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => {
                              setSelectedDomain(item.domain);
                              setActiveTab("domains");
                            }}
                          >
                            <div className="mb-3 flex items-center justify-between">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span
                                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                                    isTopThree
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <span
                                    className="block truncate text-sm font-medium"
                                    title={item.domain}
                                  >
                                    {item.domain}
                                  </span>
                                </div>
                              </div>
                              <Badge
                                variant={isTopThree ? "default" : "secondary"}
                                className={`ml-2 flex-shrink-0 text-xs font-medium ${
                                  isTopThree
                                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                    : ""
                                }`}
                              >
                                {item.count.toLocaleString()}
                              </Badge>
                            </div>
                            <Progress value={percentage} className="h-1.5" />
                          </button>
                        );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Activity Overview - New */}
              <Card className="col-span-1">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-purple-600" />
                    <CardTitle>Activity Summary</CardTitle>
                  </div>
                  <CardDescription>Network insights</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Query Rate */}
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-muted p-2 text-primary">
                          <Zap className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">
                            Query Rate
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Avg. per minute
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold tabular-nums">
                          {queriesPerMinute.toFixed(1)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          /min
                        </div>
                      </div>
                    </div>

                    {/* Network Health */}
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-muted p-2 text-emerald-600 dark:text-emerald-400">
                          <Shield className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">
                            Resolution Rate
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Successful queries
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold tabular-nums">
                          {resolutionRate.toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          success
                        </div>
                      </div>
                    </div>

                    {/* Client Distribution */}
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-muted p-2 text-primary">
                          <Network className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">
                            Avg. per Client
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Queries per device
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold tabular-nums">
                          {uniqueClientsCount > 0
                            ? Math.round(
                                totalQueries / uniqueClientsCount,
                              ).toLocaleString()
                            : "0"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          per device
                        </div>
                      </div>
                    </div>

                    {/* IPv4 vs IPv6 Distribution */}
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-md bg-muted p-2 text-primary">
                            <TrendingUp className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">
                              IP Version Usage
                            </div>
                            <div className="text-xs text-muted-foreground">
                              IPv4 vs IPv6 adoption
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums">
                            {(
                              (ipv6Count / (ipv4Count + ipv6Count || 1)) *
                              100
                            ).toFixed(1)}
                            %
                          </div>
                          <div className="text-xs text-muted-foreground">
                            IPv6 adoption
                          </div>
                        </div>
                      </div>

                      {/* IPv4 and IPv6 Bars */}
                      <div className="space-y-3">
                        {/* IPv4 Bar */}
                        <div>
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="flex items-center gap-2 font-medium text-muted-foreground">
                              <div className="h-2 w-2 rounded-full bg-primary" />
                              IPv4
                            </span>
                            <span className="font-medium tabular-nums">
                              {ipv4Count.toLocaleString()} (
                              {(
                                (ipv4Count / (ipv4Count + ipv6Count || 1)) *
                                100
                              ).toFixed(1)}
                              %)
                            </span>
                          </div>
                          <Progress
                            value={(ipv4Count / (ipv4Count + ipv6Count || 1)) * 100}
                            className="h-1.5"
                          />
                        </div>

                        {/* IPv6 Bar */}
                        <div>
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="flex items-center gap-2 font-medium text-muted-foreground">
                              <div className="h-2 w-2 rounded-full bg-emerald-500" />
                              IPv6
                            </span>
                            <span className="font-medium tabular-nums">
                              {ipv6Count.toLocaleString()} (
                              {(
                                (ipv6Count / (ipv4Count + ipv6Count || 1)) *
                                100
                              ).toFixed(1)}
                              %)
                            </span>
                          </div>
                          <Progress
                            value={(ipv6Count / (ipv4Count + ipv6Count || 1)) * 100}
                            className="h-1.5 [&>div]:bg-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="domains" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top 20 Domains</CardTitle>
                  <CardDescription>
                    Most frequently queried domains
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {topDomains.map((item, index) => (
                      <button
                        type="button"
                        key={item.domain}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left ${
                          selectedDomain === item.domain
                            ? "border-primary/40 bg-blue-50 dark:bg-blue-950/50"
                            : "hover:bg-muted/60"
                        }`}
                        onClick={() => setSelectedDomain(item.domain)}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-sm font-mono text-slate-500 dark:text-slate-400 w-8 flex-shrink-0">
                            #{index + 1}
                          </span>
                          <span
                            className="font-semibold truncate text-slate-900 dark:text-slate-100"
                            title={item.domain}
                          >
                            {item.domain}
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <Badge
                            variant={
                              selectedDomain === item.domain
                                ? "default"
                                : "outline"
                            }
                          >
                            {item.count} queries
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Domain Client Details</CardTitle>
                  <CardDescription>
                    {selectedDomain
                      ? `Clients querying ${selectedDomain}`
                      : "Select a domain to view client details"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedDomain ? (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={selectedDomain}
                          onChange={(e) => setSelectedDomain(e.target.value)}
                          placeholder="Enter domain name"
                          className="font-mono"
                        />
                        <Button
                          onClick={() => fetchDomainClients(selectedDomain, 1)}
                          size="sm"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                        <table className="w-full whitespace-nowrap">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="text-left p-3 font-medium text-sm text-muted-foreground w-40">
                                Client IP
                              </th>
                              <th className="text-left p-3 font-medium text-sm text-muted-foreground w-32">
                                Queries
                              </th>
                              <th className="text-left p-3 font-medium text-sm text-muted-foreground">
                                Last Query
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {domainClients.map((client, index) => (
                              <tr
                                key={index}
                                className="border-b border-border hover:bg-accent/50 transition-colors"
                              >
                                <td className="p-3 font-mono text-primary text-sm">
                                  <span
                                    className="cursor-pointer hover:text-primary/80 transition-colors"
                                    title={`${client.client} (click to navigate, right-click to copy)`}
                                    onClick={() => {
                                      setSelectedClient(client.client);
                                      setActiveTab("clients");
                                      fetchClientQueries(client.client, 1);
                                    }}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      copyToClipboard(client.client);
                                    }}
                                  >
                                    {client.client}
                                  </span>
                                </td>
                                <td className="p-3 text-sm">
                                  <Badge
                                    variant="secondary"
                                    className="font-mono"
                                  >
                                    {client.query_count}
                                  </Badge>
                                </td>
                                <td className="p-3 font-mono text-gray-500 text-xs">
                                  {formatTimestamp(client.last_query)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newPage = Math.max(1, domainPage - 1);
                            setDomainPage(newPage);
                            fetchDomainClients(selectedDomain, newPage);
                          }}
                          disabled={domainPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="px-3 py-1 text-sm">
                          Page {domainPage}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newPage = domainPage + 1;
                            setDomainPage(newPage);
                            fetchDomainClients(selectedDomain, newPage);
                          }}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      Click on a domain to view which clients are querying it
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="clients" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Clients</CardTitle>
                  <CardDescription>Most active IP addresses</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {clients.map((item, index) => (
                      <button
                        type="button"
                        key={item.client}
                        className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-muted/60 ${selectedClient === item.client ? "border-primary/40 bg-blue-50 dark:bg-blue-950/50" : ""}`}
                        onClick={() => setSelectedClient(item.client)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          copyToClipboard(item.client);
                        }}
                        title={`${item.client} (click to select, right-click to copy)`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono text-slate-500 dark:text-slate-400 w-8">
                            #{index + 1}
                          </span>
                          <span className="font-mono text-slate-900 dark:text-slate-100">
                            {item.client}
                          </span>
                        </div>
                        <Badge
                          variant={
                            selectedClient === item.client
                              ? "default"
                              : "outline"
                          }
                        >
                          {item.count} queries
                        </Badge>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Client Query Details</CardTitle>
                  <CardDescription>
                    {selectedClient
                      ? `Queries from ${selectedClient}`
                      : "Select a client to view details"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedClient ? (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={selectedClient}
                          onChange={(e) => setSelectedClient(e.target.value)}
                          placeholder="Enter IP address"
                          className="font-mono"
                        />
                        <Button
                          onClick={() => fetchClientQueries(selectedClient, 1)}
                          size="sm"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                        <table className="w-full whitespace-nowrap">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="text-left p-3 font-medium text-sm text-muted-foreground w-48">
                                Time
                              </th>
                              <th className="text-left p-3 font-medium text-sm text-muted-foreground w-80">
                                Domain
                              </th>
                              <th className="text-right p-3 font-medium text-sm text-muted-foreground w-20">
                                Type
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {clientQueries.map((query, index) => (
                              <tr
                                key={index}
                                className="border-b border-border hover:bg-accent/50 transition-colors"
                              >
                                <td className="p-3 font-mono text-slate-500 dark:text-slate-400 text-xs">
                                  {formatTimestamp(query.timestamp)}
                                </td>
                                <td className="p-3 font-medium text-sm">
                                  <span
                                    className="truncate block cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-slate-900 dark:text-slate-100"
                                    title={`${query.domain} (click to copy)`}
                                    onClick={() =>
                                      copyToClipboard(query.domain)
                                    }
                                  >
                                    {query.domain}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex justify-end items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {query.type}
                                    </Badge>
                                    {query.type === "UNKNOWN" && (
                                      <Badge
                                        variant="destructive"
                                        className="text-xs"
                                      >
                                        UNKNOWN
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCurrentPage(Math.max(1, currentPage - 1))
                          }
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="px-3 py-1 text-sm">
                          Page {currentPage}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      Click on a client IP address to view their query history
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="queries" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All DNS Queries</CardTitle>
                <CardDescription>
                  Recent DNS queries from all clients
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <table className="w-full whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left p-3 font-medium text-sm text-muted-foreground w-48">
                          Time
                        </th>
                        <th className="text-left p-3 font-medium text-sm text-muted-foreground w-32">
                          Client
                        </th>
                        <th className="text-left p-3 font-medium text-sm text-muted-foreground w-80">
                          Domain
                        </th>
                        <th className="text-right p-3 font-medium text-sm text-muted-foreground w-20">
                          Type
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allQueries.map((query, index) => (
                        <tr
                          key={index}
                          className="border-b border-border hover:bg-accent/50 transition-colors"
                        >
                          <td className="p-3 font-mono text-slate-500 dark:text-slate-400 text-xs">
                            {formatTimestamp(query.timestamp)}
                          </td>
                          <td className="p-3 font-mono text-blue-600 dark:text-blue-400 text-xs">
                            <span
                              className="cursor-pointer hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                              title={`${query.client} (click to navigate, right-click to copy)`}
                              onClick={() => {
                                setSelectedClient(query.client);
                                setActiveTab("clients");
                                fetchClientQueries(query.client, 1);
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                copyToClipboard(query.client);
                              }}
                            >
                              {query.client}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-sm">
                            <span
                              className="truncate block cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-slate-900 dark:text-slate-100"
                              title={`${query.domain} (click to copy)`}
                              onClick={() => copyToClipboard(query.domain)}
                            >
                              {query.domain}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {query.type}
                              </Badge>
                              {query.type === "UNKNOWN" && (
                                <Badge
                                  variant="destructive"
                                  className="text-xs"
                                >
                                  UNKNOWN
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newPage = Math.max(1, currentPage - 1);
                      setCurrentPage(newPage);
                      fetchAllQueries(newPage);
                    }}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="px-3 py-1 text-sm">Page {currentPage}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newPage = currentPage + 1;
                      setCurrentPage(newPage);
                      fetchAllQueries(newPage);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Domain Search with DNS Resolution</CardTitle>
                <CardDescription>
                  Search for domains and see live DNS resolution status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="flex-1">
                      <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Enter domain name (e.g., google.com or just google)"
                        className="w-full"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setSearchPage(1);
                            searchDomains(searchTerm, 1);
                          }
                        }}
                      />
                    </div>
                    <Button
                      onClick={() => {
                        setSearchPage(1);
                        searchDomains(searchTerm, 1);
                      }}
                      disabled={isSearching || !searchTerm.trim()}
                      className="flex items-center gap-2"
                    >
                      <Search
                        className={`h-4 w-4 ${isSearching ? "animate-spin" : ""}`}
                      />
                      {isSearching ? "Resolving..." : "Search"}
                    </Button>
                  </div>

                  {isSearching && (
                    <div className="flex items-center justify-center py-8 text-blue-600 dark:text-blue-400">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-medium">
                          Searching domains and resolving DNS...
                        </span>
                      </div>
                    </div>
                  )}

                  {searchResults.length > 0 && (
                    <div className="space-y-3">
                      {searchResults.map((result, index) => {
                        const { domain, type, resolution } = result;
                        const [statusClassName, statusIcon] =
                          resolutionStatusStyles[resolution.status] ??
                          resolutionStatusStyles.default;

                        return (
                          <div
                            key={index}
                            className="rounded-lg border p-3 hover:bg-muted/50 sm:p-4"
                          >
                            <div className="flex items-start gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
                                  <span
                                    className="font-mono font-semibold cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate text-slate-900 dark:text-slate-100"
                                    title={`${domain} (click to copy)`}
                                    onClick={() => copyToClipboard(domain)}
                                  >
                                    {domain}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {type}
                                  </Badge>
                                  <div
                                    className={`flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium ${statusClassName}`}
                                  >
                                    <span>{statusIcon}</span>
                                    <span className="capitalize">
                                      {resolution.status}
                                    </span>
                                    <span className="text-slate-500 dark:text-slate-400">
                                      ({resolution.duration}ms)
                                    </span>
                                  </div>
                                </div>

                                {resolution.status === "success" &&
                                  resolution.records.length > 0 && (
                                    <div className="space-y-1">
                                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                                        {type} Records:
                                      </div>
                                      {resolution.records.map(
                                        (record, recordIndex) => (
                                          <div
                                            key={recordIndex}
                                            className="flex items-center gap-2"
                                          >
                                            <Badge
                                              variant="outline"
                                              className="text-xs font-mono"
                                            >
                                              {record}
                                            </Badge>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-5 w-5 p-0 hover:bg-accent"
                                              onClick={() =>
                                                copyToClipboard(record)
                                              }
                                              title="Copy record"
                                            >
                                              <span className="text-xs">
                                                📋
                                              </span>
                                            </Button>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}

                                {resolution.status === "blocked" && (
                                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs">
                                    <Shield className="h-3 w-3" />
                                    <span>
                                      Domain appears to be blocked or
                                      non-existent
                                    </span>
                                  </div>
                                )}

                                {resolution.status === "error" &&
                                  resolution.error && (
                                    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 text-xs">
                                      <AlertTriangle className="h-3 w-3" />
                                      <span>{resolution.error}</span>
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {searchTerm &&
                    searchResults.length === 0 &&
                    !isSearching && (
                      <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                        No results found for "{searchTerm}"
                      </div>
                    )}

                  {!searchTerm && (
                    <div className="space-y-2 py-8 text-center text-muted-foreground">
                      <Search className="mx-auto h-5 w-5" />
                      <div>Enter a domain name to search and resolve it.</div>
                      <div className="text-xs">
                        This will show if domains are blocked, their IP
                        addresses, and resolution status
                      </div>
                    </div>
                  )}

                  {searchResults.length > 0 && (
                    <div className="flex justify-center gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newPage = Math.max(1, searchPage - 1);
                          setSearchPage(newPage);
                          searchDomains(searchTerm, newPage);
                        }}
                        disabled={searchPage === 1 || isSearching}
                      >
                        Previous
                      </Button>
                      <span className="px-3 py-1 text-sm">
                        Page {searchPage}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newPage = searchPage + 1;
                          setSearchPage(newPage);
                          searchDomains(searchTerm, newPage);
                        }}
                        disabled={isSearching}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
