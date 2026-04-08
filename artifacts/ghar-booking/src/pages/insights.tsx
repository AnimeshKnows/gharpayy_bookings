import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, Trophy, Clock, BarChart3, Zap, Inbox, Users } from "lucide-react";
import type { BookingInsights, InsightsBySource } from "@workspace/api-client-react";

function pct(n: number) { return `${n}%`; }
function fmt(n: number) { return new Intl.NumberFormat("en-IN").format(n); }
function relTime(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SOURCE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  admin: { icon: <Users className="w-3.5 h-3.5" />, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  tenant: { icon: <Inbox className="w-3.5 h-3.5" />, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
  walkin: { icon: <Zap className="w-3.5 h-3.5" />, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
};

function ConversionBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pctVal = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pctVal}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums w-10 text-right">{value}%</span>
    </div>
  );
}

function SourceRow({ s }: { s: InsightsBySource }) {
  const cfg = SOURCE_CONFIG[s.source] ?? SOURCE_CONFIG.admin;
  const isGood = s.conversionRate >= 50;
  const isMid = s.conversionRate >= 25;

  return (
    <div className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center gap-2 text-sm font-semibold ${cfg.color}`}>
          {cfg.icon} {s.label}
        </div>
        <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${isGood ? "bg-green-100 text-green-700" : isMid ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
          {s.conversionRate}% converted
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center mb-3">
        {[
          { label: "Total", val: s.total, cls: "" },
          { label: "Paid", val: s.paid, cls: "text-green-700 font-bold" },
          { label: "Expired", val: s.expired, cls: "text-orange-600" },
          { label: "Pending", val: s.pending + s.approved, cls: "text-muted-foreground" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white/60 rounded-lg py-2">
            <div className={`text-lg font-bold leading-none ${stat.cls}`}>{stat.val}</div>
            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <ConversionBar value={s.conversionRate} color={isGood ? "bg-green-500" : isMid ? "bg-yellow-500" : "bg-red-400"} />

      {s.avgTokenAmount > 0 && (
        <p className="text-xs text-muted-foreground mt-2">Avg token collected: ₹{fmt(s.avgTokenAmount)}</p>
      )}

      {/* Insight verdict */}
      <div className={`mt-3 text-xs flex items-start gap-1.5 ${isGood ? "text-green-700" : isMid ? "text-yellow-700" : "text-red-600"}`}>
        {isGood ? <TrendingUp className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : isMid ? <TrendingUp className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
        <span>
          {s.source === "admin" && isGood && "Strong — keep pushing quotations proactively."}
          {s.source === "admin" && isMid && !isGood && "Decent — try sending reminders earlier, within the first 10 minutes."}
          {s.source === "admin" && !isMid && "Low close rate — tighten your follow-up window. Send reminder before you activate."}
          {s.source === "tenant" && isGood && "Strong inbound intent — these tenants research before deciding."}
          {s.source === "tenant" && isMid && !isGood && "Moderate — many requests have weak pricing fit. Price more competitively."}
          {s.source === "tenant" && !isMid && "High drop-off — requests are coming in but not converting. Review why."}
          {s.source === "walkin" && isGood && "Best flow — highest urgency. Push more walk-in closings."}
          {s.source === "walkin" && isMid && !isGood && "Walk-ins should convert higher. Reduce friction at payment step."}
          {s.source === "walkin" && !isMid && "Walk-in not converting — check if UPI ID is set so they can pay on the spot."}
        </span>
      </div>
    </div>
  );
}

export default function Insights() {
  const [data, setData] = useState<BookingInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/bookings/insights`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="shrink-0 -ml-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Conversion Insights
            </h1>
            <p className="text-xs text-muted-foreground">What's working, what's collapsing, what to fix</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-48 rounded-xl" />
            <div className="grid sm:grid-cols-3 gap-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-20 text-muted-foreground">
            <p>Could not load insights. Check the API server.</p>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Top KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: "Total Bookings",
                  value: data.funnel.total,
                  sub: "across all flows",
                  icon: <BarChart3 className="w-4 h-4" />,
                  color: "text-primary bg-primary/10",
                },
                {
                  label: "Conversion Rate",
                  value: pct(data.funnel.conversionRate),
                  sub: data.funnel.conversionRate >= 40 ? "healthy" : data.funnel.conversionRate >= 20 ? "needs work" : "critical — act now",
                  icon: data.funnel.conversionRate >= 40 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />,
                  color: data.funnel.conversionRate >= 40 ? "text-green-700 bg-green-100" : data.funnel.conversionRate >= 20 ? "text-yellow-700 bg-yellow-100" : "text-red-700 bg-red-100",
                },
                {
                  label: "Expiry Rate",
                  value: pct(data.funnel.expiryRate),
                  sub: data.funnel.expiryRate > 60 ? "too many offers dying" : data.funnel.expiryRate > 30 ? "moderate — send reminders" : "low — good closing speed",
                  icon: <Clock className="w-4 h-4" />,
                  color: data.funnel.expiryRate > 60 ? "text-red-700 bg-red-100" : data.funnel.expiryRate > 30 ? "text-yellow-700 bg-yellow-100" : "text-green-700 bg-green-100",
                },
                {
                  label: "Revenue Collected",
                  value: `₹${fmt(data.totalRevenue)}`,
                  sub: data.avgTimeToPayHours != null ? `avg ${data.avgTimeToPayHours}h to close` : "from tokens",
                  icon: <Trophy className="w-4 h-4" />,
                  color: "text-amber-700 bg-amber-100",
                },
              ].map((k) => (
                <Card key={k.label} className="shadow-sm">
                  <CardContent className="p-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 ${k.color}`}>{k.icon}</div>
                    <div className="text-2xl font-bold tracking-tight">{k.value}</div>
                    <div className="text-xs text-muted-foreground font-medium mt-0.5">{k.label}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-tight">{k.sub}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Conversion funnel visual */}
            <Card className="shadow-sm">
              <CardHeader className="border-b py-3 px-5">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Overall Conversion Funnel
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {[
                  { label: "Total created", val: data.funnel.total, pct: 100, color: "bg-slate-400" },
                  { label: "Activation rate (offer sent)", val: Math.round(data.funnel.total * data.funnel.activationRate / 100), pct: data.funnel.activationRate, color: "bg-blue-500" },
                  { label: "Conversion rate (token paid)", val: Math.round(data.funnel.total * data.funnel.conversionRate / 100), pct: data.funnel.conversionRate, color: "bg-green-500" },
                ].map((stage) => (
                  <div key={stage.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{stage.label}</span>
                      <span className="font-semibold">{stage.val} ({stage.pct}%)</span>
                    </div>
                    <div className="h-4 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${stage.color}`} style={{ width: `${stage.pct}%` }} />
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  {data.funnel.expiryRate > 50
                    ? `${data.funnel.expiryRate}% of activated offers expire without payment — your biggest leak. Send reminders within 5 minutes of activating.`
                    : data.funnel.activationRate < 50
                    ? `Only ${data.funnel.activationRate}% of bookings ever get activated — many are sitting as pending. Review and activate or delete stale ones.`
                    : `Funnel looks healthy. Keep activating promptly and following up.`}
                </p>
              </CardContent>
            </Card>

            {/* Source breakdown */}
            {data.bySource.length > 0 ? (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Performance by Flow</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.bySource.map((s) => (
                    <SourceRow key={s.source} s={s} />
                  ))}
                </div>
              </div>
            ) : (
              <Card className="shadow-sm">
                <CardContent className="p-8 text-center text-muted-foreground text-sm">
                  No data yet — create some bookings to see per-flow insights.
                </CardContent>
              </Card>
            )}

            {/* At risk + Recent wins */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Card className="shadow-sm border-orange-200">
                <CardHeader className="border-b border-orange-100 bg-orange-50/50 py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2 text-orange-800">
                    <AlertTriangle className="w-4 h-4" /> At-Risk ({data.atRisk.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.atRisk.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">All bookings are moving — nothing stuck.</p>
                  ) : (
                    <div className="divide-y">
                      {data.atRisk.map((r) => {
                        const cfg = SOURCE_CONFIG[r.source] ?? SOURCE_CONFIG.admin;
                        return (
                          <Link key={r.id} href={`/bookings/${r.id}/admin`}>
                            <div className="px-4 py-3 hover:bg-muted/40 cursor-pointer flex items-start gap-3">
                              <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.color}`}>
                                {cfg.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{r.tenantName}</p>
                                <p className="text-xs text-muted-foreground truncate">{r.propertyName}</p>
                                <p className="text-xs text-orange-600 mt-0.5 font-medium">
                                  {r.status === "pending" ? "Not activated" : "Expired"} · {r.hoursAgo}h ago
                                </p>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-green-200">
                <CardHeader className="border-b border-green-100 bg-green-50/50 py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2 text-green-800">
                    <Trophy className="w-4 h-4" /> Recent Wins ({data.recentWins.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.recentWins.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No paid bookings yet — your first win is coming.</p>
                  ) : (
                    <div className="divide-y">
                      {data.recentWins.map((w) => {
                        const cfg = SOURCE_CONFIG[w.source] ?? SOURCE_CONFIG.admin;
                        return (
                          <Link key={w.id} href={`/bookings/${w.id}/admin`}>
                            <div className="px-4 py-3 hover:bg-muted/40 cursor-pointer flex items-start gap-3">
                              <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.color}`}>
                                {cfg.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{w.tenantName}</p>
                                <p className="text-xs text-muted-foreground truncate">{w.propertyName}</p>
                                <p className="text-xs text-green-700 mt-0.5 font-semibold">₹{fmt(w.tokenAmount)} · {relTime(w.updatedAt)}</p>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
