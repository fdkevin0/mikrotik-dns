"use client";

import { useState, useEffect, useRef } from "react";
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
  Code2,
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
import { PaginationControls } from "@/components/pagination-controls";
import { QueriesTab } from "@/components/queries-tab";
import { useToast } from "@/hooks/use-toast";

interface DomainData {
  domain: string;
  count: number;
}

interface DomainGroupData extends DomainData {
  domain_count: number;
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

export default function DNSDashboard() {
  const { toast } = useToast();
  const [topDomains, setTopDomains] = useState<DomainData[]>([]);
  const [topDomainGroups, setTopDomainGroups] = useState<DomainGroupData[]>([]);
  const [queryTypes, setQueryTypes] = useState<QueryTypeData[]>([]);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [clientQueries, setClientQueries] = useState<ClientQuery[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [uniqueClientsCount, setUniqueClientsCount] = useState(0);
  const [uniqueDomainsCount, setUniqueDomainsCount] = useState(0);
  const [queriesPerMinute, setQueriesPerMinute] = useState(0);
  const [retentionHours, setRetentionHours] = useState(24);
  const [ipv4Count, setIpv4Count] = useState(0);
  const [ipv6Count, setIpv6Count] = useState(0);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [domainClients, setDomainClients] = useState<DomainClient[]>([]);
  const [domainPage, setDomainPage] = useState(1);
  const [domainSuffixMatch, setDomainSuffixMatch] = useState(false);
  const [domainView, setDomainView] = useState<"exact" | "grouped">("exact");
  const [selectedDomainGroup, setSelectedDomainGroup] = useState("");
  const [domainGroupMembers, setDomainGroupMembers] = useState<DomainData[]>([]);
  const [domainGroupPage, setDomainGroupPage] = useState(1);
  const [activeTab, setActiveTab] = useState("overview");
  const latestDomainGroupRequest = useRef(0);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        domainsRes,
        domainGroupsRes,
        typesRes,
        clientsRes,
        uniqueClientsRes,
        uniqueDomainsRes,
        qpsRes,
        ipvRes,
      ] = await Promise.all([
        fetch("/api/top-domains"),
        fetch("/api/top-domain-groups"),
        fetch("/api/query-types"),
        fetch("/api/clients"),
        fetch("/api/unique-clients-count"),
        fetch("/api/unique-domains-count"),
        fetch("/api/queries-per-minute"),
        fetch("/api/ipv4-vs-ipv6"),
      ]);

      const domainsData = await domainsRes.json();
      const domainGroupsData = await domainGroupsRes.json();
      const typesData = await typesRes.json();
      const clientsData = await clientsRes.json();

      setTopDomains(Array.isArray(domainsData) ? domainsData : []);
      setTopDomainGroups(
        Array.isArray(domainGroupsData) ? domainGroupsData : [],
      );
      setQueryTypes(Array.isArray(typesData) ? typesData : []);
      setClients(Array.isArray(clientsData) ? clientsData : []);

      const uniqueClientsData = await uniqueClientsRes.json();
      setUniqueClientsCount(uniqueClientsData?.count || 0);

      const uniqueDomainsData = await uniqueDomainsRes.json();
      setUniqueDomainsCount(uniqueDomainsData?.count || 0);

      const qpmData = await qpsRes.json();
      setQueriesPerMinute(qpmData?.queries_per_minute || 0);
      setRetentionHours((qpmData?.time_window_minutes || 1440) / 60);

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

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetchClientQueries(selectedClient, currentPage);
    }
  }, [selectedClient, currentPage]);

  useEffect(() => {
    if (selectedDomain) {
      fetchDomainClients(selectedDomain, domainPage, domainSuffixMatch);
    }
  }, [selectedDomain, domainPage, domainSuffixMatch]);

  useEffect(() => {
    if (domainView === "grouped" && selectedDomainGroup) {
      fetchDomainGroupMembers(selectedDomainGroup, domainGroupPage);
    } else {
      latestDomainGroupRequest.current++;
    }
  }, [domainView, selectedDomainGroup, domainGroupPage]);

  useEffect(() => {
    if (
      domainView === "grouped" &&
      !selectedDomainGroup &&
      topDomainGroups.length > 0
    ) {
      setSelectedDomainGroup(topDomainGroups[0].domain);
      setDomainGroupPage(1);
    }
  }, [domainView, selectedDomainGroup, topDomainGroups]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (autoRefresh && refreshInterval > 0) {
      interval = setInterval(fetchData, refreshInterval * 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, refreshInterval]);

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

  const fetchDomainClients = async (
    domain: string,
    page = 1,
    suffix = false,
  ) => {
    try {
      const params = new URLSearchParams({
        domain,
        suffix: suffix.toString(),
        page: page.toString(),
        page_size: "20",
      });
      const res = await fetch(`/api/domain-clients?${params}`);
      const data = await res.json();
      setDomainClients(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch domain clients:", error);
      setDomainClients([]);
    }
  };

  const fetchDomainGroupMembers = async (group: string, page = 1) => {
    const request = ++latestDomainGroupRequest.current;
    try {
      const params = new URLSearchParams({
        group,
        page: page.toString(),
        page_size: "20",
      });
      const res = await fetch(`/api/domain-group-members?${params}`);
      const data = await res.json();
      if (request === latestDomainGroupRequest.current) {
        setDomainGroupMembers(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Failed to fetch domain group members:", error);
      if (request === latestDomainGroupRequest.current) {
        setDomainGroupMembers([]);
      }
    }
  };

  const changeDomainView = (view: "exact" | "grouped") => {
    latestDomainGroupRequest.current++;
    setDomainView(view);
  };

  const totalQueries = queryTypes.reduce((sum, item) => sum + item.count, 0);
  const unknownQueries =
    queryTypes.find((type) => type.type === "UNKNOWN")?.count || 0;
  const resolutionRate = totalQueries
    ? ((totalQueries - unknownQueries) / totalQueries) * 100
    : 0;
  const retentionLabel =
    retentionHours % 24 === 0
      ? `${retentionHours / 24} ${retentionHours === 24 ? "day" : "days"}`
      : `${retentionHours} ${retentionHours === 1 ? "hour" : "hours"}`;

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
              Network query activity from the last {retentionLabel}
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
                <Code2 className="h-4 w-4" />
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
                    Last {retentionLabel}
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
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted p-1 sm:inline-flex sm:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="domains">Domains</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="queries">Queries</TabsTrigger>
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
                              setDomainSuffixMatch(false);
                              setDomainPage(1);
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
                <CardHeader className="gap-4">
                  <div>
                    <CardTitle>
                      {domainView === "exact"
                        ? "Top 20 Domains"
                        : "Top 20 Domain Groups"}
                    </CardTitle>
                    <CardDescription>
                      {domainView === "exact"
                        ? "Most frequently queried domains"
                        : "Queries grouped by registrable domain using the Public Suffix List"}
                    </CardDescription>
                  </div>
                  <div
                    className="flex w-fit rounded-md border p-1"
                    role="group"
                    aria-label="Domain ranking mode"
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant={domainView === "exact" ? "secondary" : "ghost"}
                      aria-pressed={domainView === "exact"}
                      onClick={() => changeDomainView("exact")}
                    >
                      Full domains
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={domainView === "grouped" ? "secondary" : "ghost"}
                      aria-pressed={domainView === "grouped"}
                      onClick={() => changeDomainView("grouped")}
                    >
                      PSL groups
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(domainView === "exact" ? topDomains : topDomainGroups).map(
                      (item, index) => {
                        const selected =
                          domainView === "exact"
                            ? selectedDomain === item.domain
                            : selectedDomainGroup === item.domain;
                        const domainCount =
                          "domain_count" in item
                            ? (item as DomainGroupData).domain_count
                            : undefined;
                        return (
                          <button
                            type="button"
                            key={item.domain}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left ${
                              selected
                                ? "border-primary/40 bg-blue-50 dark:bg-blue-950/50"
                                : "hover:bg-muted/60"
                            }`}
                            onClick={() => {
                              if (domainView === "exact") {
                                setSelectedDomain(item.domain);
                                setDomainSuffixMatch(false);
                                setDomainPage(1);
                              } else {
                                if (
                                  selectedDomainGroup !== item.domain ||
                                  domainGroupPage !== 1
                                ) {
                                  latestDomainGroupRequest.current++;
                                  setDomainGroupMembers([]);
                                  setSelectedDomainGroup(item.domain);
                                  setDomainGroupPage(1);
                                }
                              }
                            }}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <span className="w-8 flex-shrink-0 font-mono text-sm text-slate-500 dark:text-slate-400">
                                #{index + 1}
                              </span>
                              <div className="min-w-0">
                                <span
                                  className="block truncate font-semibold text-slate-900 dark:text-slate-100"
                                  title={item.domain}
                                >
                                  {item.domain}
                                </span>
                                {domainCount !== undefined && (
                                  <span className="text-xs text-muted-foreground">
                                    {domainCount} full {domainCount === 1 ? "domain" : "domains"}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Badge variant={selected ? "default" : "outline"}>
                              {item.count} queries
                            </Badge>
                          </button>
                        );
                      },
                    )}
                  </div>
                </CardContent>
              </Card>

              {domainView === "grouped" ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Domains in Group</CardTitle>
                    <CardDescription>
                      {selectedDomainGroup
                        ? `Full domains grouped under ${selectedDomainGroup}`
                        : "Select a domain group to view its members"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedDomainGroup ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          {domainGroupMembers.map((item) => (
                            <button
                              type="button"
                              key={item.domain}
                              className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-muted/60"
                              onClick={() => {
                                setSelectedDomain(item.domain);
                                setDomainSuffixMatch(false);
                                setDomainPage(1);
                                changeDomainView("exact");
                              }}
                            >
                              <span
                                className="truncate font-mono text-sm font-medium"
                                title={item.domain}
                              >
                                {item.domain}
                              </span>
                              <Badge variant="outline">{item.count} queries</Badge>
                            </button>
                          ))}
                          {domainGroupMembers.length === 0 && (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                              No domains found in this group
                            </p>
                          )}
                        </div>
                        <PaginationControls
                          page={domainGroupPage}
                          onPrevious={() =>
                            setDomainGroupPage((page) => Math.max(1, page - 1))
                          }
                          onNext={() => setDomainGroupPage((page) => page + 1)}
                          nextDisabled={domainGroupMembers.length < 20}
                        />
                      </div>
                    ) : (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Select a domain group to view its members
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Domain Client Details</CardTitle>
                    <CardDescription>
                      {selectedDomain
                        ? domainSuffixMatch
                          ? `Clients querying ${selectedDomain} or any subdomain`
                          : `Clients querying ${selectedDomain}`
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
                            type="button"
                            variant={domainSuffixMatch ? "default" : "outline"}
                            size="sm"
                            aria-pressed={domainSuffixMatch}
                            onClick={() => {
                              setDomainPage(1);
                              setDomainSuffixMatch((enabled) => !enabled);
                            }}
                            className="whitespace-nowrap"
                          >
                            {domainSuffixMatch
                              ? "Subdomains included"
                              : "Include subdomains"}
                          </Button>
                          <Button
                            onClick={() => {
                              setDomainPage(1);
                              fetchDomainClients(
                                selectedDomain,
                                1,
                                domainSuffixMatch,
                              );
                            }}
                            size="sm"
                            aria-label="Search domain clients"
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

                        <PaginationControls
                          page={domainPage}
                          onPrevious={() =>
                            setDomainPage((page) => Math.max(1, page - 1))
                          }
                          onNext={() => setDomainPage((page) => page + 1)}
                          nextDisabled={domainClients.length < 20}
                        />
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        Click on a domain to view which clients are querying it
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
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

                      <PaginationControls
                        page={currentPage}
                        onPrevious={() =>
                          setCurrentPage((page) => Math.max(1, page - 1))
                        }
                        onNext={() => setCurrentPage((page) => page + 1)}
                        nextDisabled={clientQueries.length < 20}
                      />
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

          <QueriesTab
            queryTypes={queryTypes}
            refreshSeconds={autoRefresh ? refreshInterval : 0}
            copyToClipboard={copyToClipboard}
            formatTimestamp={formatTimestamp}
          />

        </Tabs>
      </div>
    </main>
  );
}
