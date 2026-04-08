import { Link } from "wouter";
import { useListBookings, useGetBookingStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PlusCircle,
  IndianRupee,
  Clock,
  CheckCircle,
  AlertCircle,
  Inbox,
  Share2,
  Copy,
  BarChart3,
  Settings,
  Eye,
} from "lucide-react";
import { StatusBadge } from "@/components/booking-status-badge";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetBookingStats();
  const { data: bookings, isLoading: bookingsLoading } = useListBookings();
  const { toast } = useToast();
  const { teammate } = useAuth();

  const tenantRequestCount = bookings?.filter(
    (b) => b.source === "tenant" && b.status === "pending"
  ).length ?? 0;

  const requestFormUrl = `${window.location.origin}${import.meta.env.BASE_URL}request`;

  const copyRequestLink = () => {
    navigator.clipboard.writeText(requestFormUrl);
    toast({ title: "Request link copied", description: "Share this with prospective tenants." });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg leading-none">G</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground tracking-tight leading-none">Gharpayy</h1>
              {teammate?.zoneName && (
                <p className="text-xs text-muted-foreground leading-none mt-0.5">{teammate.zoneName}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/insights">
              <Button variant="ghost" size="sm" className="gap-1.5 hidden sm:flex text-muted-foreground">
                <BarChart3 className="w-3.5 h-3.5" /> Insights
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="gap-1.5 hidden sm:flex" onClick={copyRequestLink}>
              <Share2 className="w-3.5 h-3.5" /> Share Request Form
            </Button>
            <Button variant="outline" size="icon" className="sm:hidden h-8 w-8" onClick={copyRequestLink}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Link href="/settings">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/bookings/new">
              <Button size="sm" className="gap-2 shadow-sm hover-elevate">
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">New Quotation</span>
                <span className="sm:hidden">New</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* New self-requests banner */}
        {tenantRequestCount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Inbox className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-blue-900 text-sm">
                  {tenantRequestCount} new room request{tenantRequestCount > 1 ? "s" : ""} waiting
                </p>
                <p className="text-xs text-blue-700/80">
                  Review the requests below and activate personalised offers.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="shadow-sm border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                <div className="p-2 bg-primary/10 rounded-full text-primary">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">{formatCurrency(stats?.totalRevenue || 0)}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">From paid tokens</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Offers</CardTitle>
                <div className="p-2 bg-yellow-100 rounded-full text-yellow-600">
                  <Clock className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats?.approved || 0}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Countdown running</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Rooms Locked</CardTitle>
                <div className="p-2 bg-green-100 rounded-full text-green-600">
                  <CheckCircle className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats?.paid || 0}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Tokens received</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending / Requests</CardTitle>
                <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                  <Inbox className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats?.pending || 0}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Awaiting activation</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Tenant Request Link */}
        <section className="bg-gradient-to-br from-slate-50 to-slate-100 border rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
                <Inbox className="w-4 h-4 text-blue-600" /> Tenant Self-Request Form
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Share this link anywhere — website, WhatsApp, Instagram. Tenants fill in their requirements and you set the price when you're ready.
              </p>
              <p className="text-xs font-mono text-muted-foreground mt-1 truncate">{requestFormUrl}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyRequestLink}>
                <Copy className="w-3.5 h-3.5" /> Copy Link
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white"
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Book your perfect room — zero brokerage!\n\nTell us what you need and we'll send you a personalised offer:\n${requestFormUrl}`)}`, "_blank")}
              >
                <Share2 className="w-3.5 h-3.5" /> Share on WhatsApp
              </Button>
            </div>
          </div>
        </section>

        {/* Bookings List */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">All Bookings & Requests</h2>
          </div>

          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            {bookingsLoading ? (
              <div className="divide-y">
                {[1, 2, 3].map(i => (
                  <div key={i} className="p-4 sm:p-6 flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            ) : bookings?.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-medium mb-1">No bookings yet</h3>
                <p className="text-muted-foreground mb-6 max-w-sm">
                  Create a quotation yourself, or share the request form link above so tenants can submit enquiries directly.
                </p>
                <Link href="/bookings/new">
                  <Button className="hover-elevate">Create Quotation</Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y">
                {bookings?.map((booking, i) => {
                  const isTenantReq = booking.source === "tenant";
                  const pricingPending = isTenantReq && booking.tokenAmount === 0;

                  return (
                    <Link key={booking.id} href={`/bookings/${booking.id}/admin`}>
                      <div
                        className="p-4 sm:p-6 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer animate-in fade-in slide-in-from-bottom-2"
                        style={{ animationDelay: `${i * 50}ms`, animationFillMode: "both" }}
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-base font-medium text-foreground truncate">{booking.tenantName}</h3>
                            <StatusBadge status={booking.status} />
                            {isTenantReq && (
                              <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5 font-medium shrink-0">
                                <Inbox className="w-3 h-3" /> Self-Request
                              </span>
                            )}
                            {booking.viewedAt && booking.status === "approved" && (
                              <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-medium shrink-0">
                                <Eye className="w-3 h-3" /> Viewed
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {booking.propertyName}{booking.roomNumber ? ` · Room ${booking.roomNumber}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {pricingPending
                              ? <span className="text-blue-600 font-medium">Pricing not set — activate offer to proceed</span>
                              : <>Token: {formatCurrency(booking.tokenAmount)} · Rent: {formatCurrency(booking.discountedRent)}/mo</>
                            }
                          </p>
                        </div>
                        <div className="shrink-0 text-muted-foreground">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
