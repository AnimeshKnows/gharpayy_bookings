import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import {
  useGetBooking,
  getGetBookingQueryKey,
  useApproveBooking,
  useUpdateBooking,
  useDeleteBooking,
  useGetWhatsappMessage,
  getGetWhatsappMessageQueryKey,
  getGetBookingReminderQueryKey,
  getListBookingsQueryKey,
  getGetBookingStatsQueryKey,
  useReactivateBooking,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  MessageCircle,
  Link as LinkIcon,
  Trash2,
  IndianRupee,
  Building,
  User,
  Calendar,
  RefreshCw,
  Copy,
  Phone,
  QrCode,
  Inbox,
  Zap,
  BellRing,
  Eye,
  FileText,
  Save,
} from "lucide-react";
import { StatusBadge } from "@/components/booking-status-badge";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// ── Notes Card ────────────────────────────────────────────────────────────────
function NotesCard({ booking, onSave }: { booking: { id: number; notes: string | null }; onSave: (notes: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(booking.notes ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleEdit = () => { setDraft(booking.notes ?? ""); setEditing(true); setTimeout(() => ref.current?.focus(), 50); };
  const handleSave = () => { onSave(draft); setEditing(false); };
  const handleCancel = () => { setDraft(booking.notes ?? ""); setEditing(false); };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-5 border-b bg-muted/20">
        <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" /> Internal Notes</CardTitle>
        {!editing && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleEdit}>Edit</Button>
        )}
      </CardHeader>
      <CardContent className="p-4">
        {editing ? (
          <div className="space-y-2">
            <Textarea ref={ref} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add notes visible only to your team…" className="min-h-[80px] text-sm" />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleCancel}>Cancel</Button>
              <Button size="sm" className="gap-1" onClick={handleSave}><Save className="w-3.5 h-3.5" /> Save</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{booking.notes?.trim() || <span className="italic opacity-60">No notes yet. Click Edit to add internal comments.</span>}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface PricingForm {
  propertyName: string;
  roomNumber: string;
  actualRent: string;
  discountedRent: string;
  deposit: string;
  maintenanceFee: string;
  tokenAmount: string;
  stayDurationMonths: string;
  noticePeriodMonths: string;
  upiId: string;
  adminPhone: string;
}

export default function AdminBookingDetail() {
  const { id } = useParams();
  const bookingId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: booking, isLoading } = useGetBooking(bookingId, {
    query: { enabled: !!bookingId, queryKey: getGetBookingQueryKey(bookingId) },
  });

  const { data: whatsappData, refetch: refetchWhatsapp } = useGetWhatsappMessage(bookingId, {
    query: { enabled: !!bookingId, queryKey: getGetWhatsappMessageQueryKey(bookingId) },
  });

  const approveBooking = useApproveBooking();
  const reactivateBooking = useReactivateBooking();
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();

  // Pricing form state (for tenant-source requests)
  const [pricingForm, setPricingForm] = useState<PricingForm>({
    propertyName: "",
    roomNumber: "",
    actualRent: "",
    discountedRent: "",
    deposit: "",
    maintenanceFee: "",
    tokenAmount: "",
    stayDurationMonths: "11",
    noticePeriodMonths: "1",
    upiId: "",
    adminPhone: "",
  });
  const [pricingReady, setPricingReady] = useState(false);

  // Auto-clear admin notification when this booking is opened
  useEffect(() => {
    if (booking?.adminUnread) {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      fetch(`${base}/api/bookings/${bookingId}/mark-read`, { method: "POST" })
        .then(() => queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() }))
        .catch(() => {});
    }
  }, [booking?.id, booking?.adminUnread]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetBookingQueryKey(bookingId) });
    queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBookingStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetWhatsappMessageQueryKey(bookingId) });
  };

  // Standard approve (admin-created bookings, pricing already set)
  const handleApprove = () => {
    approveBooking.mutate({ id: bookingId }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetBookingQueryKey(bookingId), data);
        invalidate();
        refetchWhatsapp();
        toast({ title: "Offer activated", description: "15-minute countdown started. Share the link with tenant now." });
      },
      onError: () => toast({ title: "Error", description: "Failed to approve booking.", variant: "destructive" }),
    });
  };

  // Activate with pricing (tenant-source requests): PATCH pricing → POST approve
  const handleActivateWithPricing = async () => {
    const pricing = {
      propertyName: pricingForm.propertyName.trim() || booking?.propertyName || "",
      roomNumber: pricingForm.roomNumber.trim() || null,
      actualRent: Number(pricingForm.actualRent) || 0,
      discountedRent: Number(pricingForm.discountedRent) || 0,
      deposit: Number(pricingForm.deposit) || 0,
      maintenanceFee: Number(pricingForm.maintenanceFee) || 0,
      tokenAmount: Number(pricingForm.tokenAmount) || 0,
      stayDurationMonths: Number(pricingForm.stayDurationMonths) || 11,
      noticePeriodMonths: Number(pricingForm.noticePeriodMonths) || 1,
      upiId: pricingForm.upiId.trim() || null,
      adminPhone: pricingForm.adminPhone.trim() || null,
    };

    if (!pricing.discountedRent || !pricing.tokenAmount) {
      toast({ title: "Missing fields", description: "Please set at least Offer Rent and Token Amount.", variant: "destructive" });
      return;
    }

    // Step 1: Update pricing
    updateBooking.mutate({ id: bookingId, data: pricing }, {
      onSuccess: () => {
        // Step 2: Approve (start timer)
        approveBooking.mutate({ id: bookingId }, {
          onSuccess: (data) => {
            queryClient.setQueryData(getGetBookingQueryKey(bookingId), data);
            invalidate();
            refetchWhatsapp();
            toast({ title: "Offer activated!", description: "Pricing set and 15-minute timer started. Share the link now." });
          },
          onError: () => toast({ title: "Error", description: "Pricing saved but failed to start timer.", variant: "destructive" }),
        });
      },
      onError: () => toast({ title: "Error", description: "Failed to save pricing.", variant: "destructive" }),
    });
  };

  const handleReactivate = () => {
    reactivateBooking.mutate({ id: bookingId }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetBookingQueryKey(bookingId), data);
        invalidate();
        refetchWhatsapp();
        toast({ title: "Offer reactivated", description: "Fresh 15-minute window started. Send the link now." });
      },
      onError: () => toast({ title: "Error", description: "Failed to reactivate.", variant: "destructive" }),
    });
  };

  const handleStatusChange = (status: "paid" | "cancelled") => {
    updateBooking.mutate({ id: bookingId, data: { status } }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetBookingQueryKey(bookingId), data);
        invalidate();
        toast({ title: status === "paid" ? "Payment confirmed" : "Offer cancelled" });
      },
      onError: () => toast({ title: "Error", description: "Failed to update status.", variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    deleteBooking.mutate({ id: bookingId }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Booking deleted" });
        window.location.href = import.meta.env.BASE_URL;
      },
      onError: () => toast({ title: "Error", description: "Failed to delete.", variant: "destructive" }),
    });
  };

  const copyLink = () => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}bookings/${bookingId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Tenant link copied", description: "Paste it in WhatsApp or SMS." });
  };

  const openWhatsApp = async () => {
    let data = whatsappData;
    if (!data) {
      const result = await refetchWhatsapp();
      data = result.data;
    }
    if (data?.url) window.open(data.url, "_blank");
  };

  const sendReminder = async () => {
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/bookings/${bookingId}/reminder`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      window.open(data.url, "_blank");
    } catch {
      toast({ title: "Error", description: "Could not load reminder message.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-12">
        <header className="bg-card border-b sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
            <Skeleton className="w-8 h-8 rounded-md" />
            <Skeleton className="h-6 w-48" />
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  if (!booking) return null;

  const isTenantRequest = booking.source === "tenant";
  const savings = booking.actualRent - booking.discountedRent;
  const tenantLink = `${window.location.origin}${import.meta.env.BASE_URL}bookings/${bookingId}`;

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="shrink-0 -ml-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-base font-semibold text-foreground leading-tight flex items-center gap-2">
                {booking.tenantName}
                {isTenantRequest && (
                  <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5 font-medium">
                    <Inbox className="w-3 h-3" /> Self-Request
                  </span>
                )}
              </h1>
              <p className="text-xs text-muted-foreground">{booking.propertyName}{booking.roomNumber ? ` · Room ${booking.roomNumber}` : ""}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={booking.status} />
            {booking.viewedAt && (
              <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-medium">
                <Eye className="w-3 h-3" /> Tenant viewed {new Date(booking.viewedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Tenant Self-Request: show request details + pricing form ────── */}
        {isTenantRequest && booking.status === "pending" && (
          <Card className="border-blue-200 shadow-md overflow-hidden">
            <div className="bg-blue-50 border-b border-blue-100 px-5 py-3 flex items-center gap-2">
              <Inbox className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">New Room Request from Tenant</span>
            </div>
            <CardContent className="p-5 space-y-6">

              {/* Request details */}
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Name</p>
                    <p className="font-semibold">{booking.tenantName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Phone / WhatsApp</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{booking.tenantPhone}</p>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(`tel:${booking.tenantPhone}`, "_self")}>
                        <Phone className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  {booking.tenantEmail && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Email</p>
                      <p className="font-medium">{booking.tenantEmail}</p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Property Preference</p>
                  <p className="font-semibold mb-3">{booking.propertyName}</p>
                  {booking.tenantMessage && (
                    <div className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm text-muted-foreground leading-relaxed">
                      "{booking.tenantMessage}"
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Pricing form */}
              {!pricingReady ? (
                <div className="text-center py-2">
                  <p className="text-sm text-muted-foreground mb-4">
                    Review the request above, then set your offer pricing to activate the 15-minute timer for this tenant.
                  </p>
                  <Button onClick={() => {
                    setPricingForm(f => ({ ...f, propertyName: booking.propertyName }));
                    setPricingReady(true);
                  }} className="gap-2">
                    <Zap className="w-4 h-4" /> Set Pricing & Activate Offer
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" /> Set Offer Pricing
                  </h3>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Property Name</Label>
                      <Input className="mt-1" value={pricingForm.propertyName} onChange={e => setPricingForm(f => ({ ...f, propertyName: e.target.value }))} placeholder="Sunrise PG" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Room Number</Label>
                      <Input className="mt-1" value={pricingForm.roomNumber} onChange={e => setPricingForm(f => ({ ...f, roomNumber: e.target.value }))} placeholder="101" />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Standard Rent (₹)</Label>
                      <Input className="mt-1" type="number" value={pricingForm.actualRent} onChange={e => setPricingForm(f => ({ ...f, actualRent: e.target.value }))} placeholder="15000" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Offer Rent (₹) *</Label>
                      <Input className="mt-1" type="number" value={pricingForm.discountedRent} onChange={e => setPricingForm(f => ({ ...f, discountedRent: e.target.value }))} placeholder="12000" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Token Amount (₹) *</Label>
                      <Input className="mt-1" type="number" value={pricingForm.tokenAmount} onChange={e => setPricingForm(f => ({ ...f, tokenAmount: e.target.value }))} placeholder="10000" />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Security Deposit (₹)</Label>
                      <Input className="mt-1" type="number" value={pricingForm.deposit} onChange={e => setPricingForm(f => ({ ...f, deposit: e.target.value }))} placeholder="30000" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Maintenance (₹)</Label>
                      <Input className="mt-1" type="number" value={pricingForm.maintenanceFee} onChange={e => setPricingForm(f => ({ ...f, maintenanceFee: e.target.value }))} placeholder="5000" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Stay Duration (mo)</Label>
                      <Input className="mt-1" type="number" value={pricingForm.stayDurationMonths} onChange={e => setPricingForm(f => ({ ...f, stayDurationMonths: e.target.value }))} placeholder="11" />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">UPI ID (for QR code)</Label>
                      <Input className="mt-1" value={pricingForm.upiId} onChange={e => setPricingForm(f => ({ ...f, upiId: e.target.value }))} placeholder="gharpayy@upi" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Your WhatsApp Number</Label>
                      <Input className="mt-1" value={pricingForm.adminPhone} onChange={e => setPricingForm(f => ({ ...f, adminPhone: e.target.value }))} placeholder="+91 98765 43210" />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      size="lg"
                      onClick={handleActivateWithPricing}
                      disabled={updateBooking.isPending || approveBooking.isPending}
                      className="flex-1 gap-2"
                    >
                      <Zap className="w-4 h-4" />
                      {updateBooking.isPending || approveBooking.isPending ? "Activating…" : "Activate Offer & Start 15-min Timer"}
                    </Button>
                    <Button variant="outline" onClick={() => setPricingReady(false)}>Back</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Admin Action Panel (standard flow or post-pending) ────────── */}
        <Card className="border-primary/20 shadow-md overflow-hidden">
          <div className="bg-muted/40 border-b px-5 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Admin Controls</span>
          </div>
          <CardContent className="p-5 space-y-5">

            {/* Standard pending (admin-created) */}
            {booking.status === "pending" && !isTenantRequest && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                <div>
                  <h3 className="font-semibold mb-1">Ready to send offer?</h3>
                  <p className="text-sm text-muted-foreground">Approve to start the 15-minute countdown. Then share the link with tenant.</p>
                </div>
                <Button size="lg" onClick={handleApprove} disabled={approveBooking.isPending} className="w-full sm:w-auto gap-2 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                  Activate Offer & Start Timer
                </Button>
              </div>
            )}

            {/* Tenant-request pending (handled above with pricing form) */}
            {booking.status === "pending" && isTenantRequest && (
              <div className="text-sm text-muted-foreground">
                Fill in the pricing form above and click "Activate Offer" to send the live 15-minute offer to this tenant.
              </div>
            )}

            {booking.status === "approved" && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-green-600" />
                  <h4 className="font-semibold text-green-800 text-sm">Offer is Live — Share with tenant now</h4>
                </div>
                <p className="text-xs text-green-700/80">
                  Expires: {booking.offerExpiresAt ? new Date(booking.offerExpiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5 bg-white border-green-200 hover:bg-green-50">
                    <Copy className="w-3.5 h-3.5" /> Copy Link
                  </Button>
                  <Button size="sm" onClick={openWhatsApp} className="gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white">
                    <MessageCircle className="w-3.5 h-3.5" /> Send on WhatsApp
                  </Button>
                </div>
              </div>
            )}

            {(booking.status === "expired" || booking.status === "cancelled") && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                <div>
                  <h3 className="font-semibold mb-1">
                    {booking.status === "expired" ? "Offer expired — tenant still interested?" : "Offer cancelled"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Reactivate to give them a fresh 15-minute window.
                  </p>
                </div>
                <Button size="lg" onClick={handleReactivate} disabled={reactivateBooking.isPending} className="w-full sm:w-auto gap-2 shrink-0">
                  <RefreshCw className="w-4 h-4" />
                  Reactivate Offer
                </Button>
              </div>
            )}

            {booking.status === "paid" && (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="font-semibold text-green-800 text-sm">Token payment received</p>
                  <p className="text-xs text-green-700/80">Room is locked. Tenant can see their receipt.</p>
                </div>
              </div>
            )}

            {booking.status !== "paid" && <Separator />}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5">
                <LinkIcon className="w-3.5 h-3.5" /> Copy Tenant Link
              </Button>
              <Button size="sm" onClick={openWhatsApp} className="gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp Quotation
              </Button>
              {booking.tokenAmount > 0 && (booking.status === "approved" || booking.status === "expired" || booking.status === "pending") && (
                <Button variant="outline" size="sm" onClick={sendReminder} className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50">
                  <BellRing className="w-3.5 h-3.5" /> Send Reminder
                </Button>
              )}
              {booking.tenantPhone && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`tel:${booking.tenantPhone}`, "_self")}>
                  <Phone className="w-3.5 h-3.5" /> Call Tenant
                </Button>
              )}
              {booking.status === "approved" && (
                <Button size="sm" onClick={() => handleStatusChange("paid")} disabled={updateBooking.isPending} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                  <IndianRupee className="w-3.5 h-3.5" /> Mark Paid
                </Button>
              )}
              {(booking.status === "pending" || booking.status === "approved") && (
                <Button variant="outline" size="sm" onClick={() => handleStatusChange("cancelled")} disabled={updateBooking.isPending}>
                  Cancel Offer
                </Button>
              )}
            </div>

          </CardContent>
        </Card>

        {/* Tenant link */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Tenant Payment Link</p>
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-xs font-mono text-foreground truncate flex-1">{tenantLink}</p>
              <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={copyLink}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quotation Details */}
        <Card className="shadow-sm">
          <CardHeader className="border-b bg-muted/20 py-4">
            <CardTitle className="text-base flex items-center gap-2">
              {isTenantRequest ? (
                <><Inbox className="w-4 h-4 text-blue-500" /> Request Details</>
              ) : "Quotation Details"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x">
              <div className="p-5 space-y-5">
                <div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <User className="w-3.5 h-3.5" />
                    <h3 className="text-xs font-medium uppercase tracking-wider">Tenant</h3>
                  </div>
                  <p className="font-semibold">{booking.tenantName}</p>
                  <p className="text-sm text-muted-foreground">{booking.tenantPhone}</p>
                  {booking.tenantEmail && <p className="text-sm text-muted-foreground">{booking.tenantEmail}</p>}
                </div>

                <Separator />

                <div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Building className="w-3.5 h-3.5" />
                    <h3 className="text-xs font-medium uppercase tracking-wider">
                      {isTenantRequest ? "Property Preference" : "Property"}
                    </h3>
                  </div>
                  <p className="font-semibold">{booking.propertyName}</p>
                  {booking.roomNumber && <p className="text-sm text-muted-foreground">Room {booking.roomNumber}</p>}
                  {isTenantRequest && booking.tenantMessage && (
                    <div className="mt-2 bg-muted/40 rounded-lg px-3 py-2 text-sm text-muted-foreground leading-relaxed">
                      "{booking.tenantMessage}"
                    </div>
                  )}
                </div>

                <Separator />

                {booking.upiId && (
                  <>
                    <div>
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <QrCode className="w-3.5 h-3.5" />
                        <h3 className="text-xs font-medium uppercase tracking-wider">Payment UPI ID</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-medium truncate flex-1">{booking.upiId}</p>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                          onClick={() => { navigator.clipboard.writeText(booking.upiId!); toast({ title: "UPI ID copied" }); }}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                <div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <h3 className="text-xs font-medium uppercase tracking-wider">Terms</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Lock-in</p>
                      <p className="font-semibold text-sm">{booking.stayDurationMonths} Months</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Notice</p>
                      <p className="font-semibold text-sm">{booking.noticePeriodMonths} Month{booking.noticePeriodMonths !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-slate-50/50">
                <div className="flex items-center gap-2 text-muted-foreground mb-4">
                  <IndianRupee className="w-3.5 h-3.5" />
                  <h3 className="text-xs font-medium uppercase tracking-wider">Financials</h3>
                </div>

                {isTenantRequest && booking.tokenAmount === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8 space-y-2">
                    <p>Pricing not set yet.</p>
                    <p className="text-xs">Click "Set Pricing & Activate Offer" above to fill in the details.</p>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Standard Rent</span>
                      <span className="line-through">{formatCurrency(booking.actualRent)}/mo</span>
                    </div>
                    <div className="flex justify-between font-semibold text-primary text-base">
                      <span>Offer Rent</span>
                      <span>{formatCurrency(booking.discountedRent)}/mo</span>
                    </div>
                    {savings > 0 && (
                      <div className="flex justify-between text-green-600 bg-green-50 px-2 py-1.5 rounded-md">
                        <span>Tenant saves</span>
                        <span className="font-semibold">{formatCurrency(savings)}/mo</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Maintenance</span>
                      <span className="font-medium">{formatCurrency(booking.maintenanceFee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Security Deposit</span>
                      <span className="font-medium">{formatCurrency(booking.deposit)}</span>
                    </div>
                    <div className="mt-4 p-4 bg-primary/5 rounded-xl border border-primary/20">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-primary">Token to Collect</span>
                        <span className="text-xl font-bold text-primary">{formatCurrency(booking.tokenAmount)}</span>
                      </div>
                      <p className="text-xs text-primary/60">Deducted from first month's rent</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Internal Notes */}
        <NotesCard booking={booking} onSave={(notes) => {
          updateBooking.mutate({ id: bookingId, data: { notes } }, { onSuccess: invalidate });
        }} />

        {/* Delete */}
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="w-4 h-4" />
                Delete Booking
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone. The tenant's link will stop working.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

      </main>
    </div>
  );
}
