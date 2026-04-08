import { useParams } from "wouter";
import { useGetBooking, getGetBookingQueryKey } from "@workspace/api-client-react";
import { useState, useEffect, useCallback } from "react";
import "@/styles/tenant-luxury.css";

function formatINR(n: number) {
  return "₹" + new Intl.NumberFormat("en-IN").format(n);
}

function buildUpiUrl(upiId: string, name: string, amount: number, note: string) {
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
}

function buildQrUrl(upiUrl: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=184x184&data=${encodeURIComponent(upiUrl)}&bgcolor=ffffff&color=0a0906&margin=6`;
}

// ─── SVG Ring Countdown Timer ─────────────────────────────────────────────────
const DURATION = 15 * 60;
const RADIUS = 52;
const CIRC = 2 * Math.PI * RADIUS;

function LuxuryTimer({
  expiresAt,
  tokenAmount,
  onExpire,
}: {
  expiresAt: string | null;
  tokenAmount: number;
  onExpire: () => void;
}) {
  const [left, setLeft] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) { setDone(true); onExpire(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  if (done || !expiresAt) {
    return (
      <div className="gp-timer-wrap">
        <div className="gp-timer-expired">
          <div className="gp-timer-expired-title">Offer Window Closed</div>
          <div className="gp-timer-expired-sub">
            The 15-minute exclusive window has ended. Scroll down to request a fresh offer.
          </div>
        </div>
      </div>
    );
  }

  const isUrgent = left <= 120;
  const isWarning = left <= 300;
  const pct = left / DURATION;
  const dashOffset = CIRC * (1 - pct);
  const m = String(Math.floor(left / 60)).padStart(2, "0");
  const s = String(left % 60).padStart(2, "0");
  const ringClass = isUrgent ? "urgent" : "";
  const blockClass = isUrgent ? "urgent" : isWarning ? "warning" : "";

  return (
    <div className="gp-timer-wrap">
      <div className={`gp-timer-block ${blockClass}`}>
        <div className="gp-timer-label">
          {isUrgent ? "Pay now — offer closing" : isWarning ? "Hurry — almost out of time" : "Offer expires in"}
        </div>
        <div className="gp-timer-ring-wrap">
          <svg className="gp-timer-ring-svg" viewBox="0 0 120 120" width="120" height="120">
            <circle className="gp-timer-ring-track" cx="60" cy="60" r={RADIUS} />
            <circle
              className={`gp-timer-ring-fill ${ringClass}`}
              cx="60" cy="60" r={RADIUS}
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="gp-timer-digits-center">
            <span className={`gp-timer-digits ${ringClass}`}>{m}:{s}</span>
          </div>
        </div>
        <div className="gp-timer-sub">
          {isUrgent
            ? `Pay ${formatINR(tokenAmount)} now — room will be released at 00:00`
            : isWarning
            ? "Discounted price closing soon — don't wait"
            : "Discounted price valid only until timer ends"}
        </div>
      </div>
    </div>
  );
}

// ─── Card Hero (property header inside the card) ──────────────────────────────
function CardHero({ booking, label }: { booking: { propertyName: string; roomNumber?: string | null; tenantName: string }; label?: string }) {
  return (
    <div className="gp-hero">
      <div className="gp-hero-logo">
        <div className="gp-logo-mark">G</div>
        <div>
          <div className="gp-logo-name">GHARPAYY</div>
          <div className="gp-logo-sub">Room Lock-In</div>
        </div>
        {label && (
          <div style={{ marginLeft: "auto", background: "var(--gold-dim)", border: "1px solid var(--gold-border)", borderRadius: 20, padding: "3px 10px", fontSize: 10, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
            {label}
          </div>
        )}
      </div>
      <div className="gp-hero-property">
        <div className="gp-hero-exclusive">
          <div className="gp-hero-dot" />
          Exclusive Offer
        </div>
        <div className="gp-hero-name">{booking.propertyName}</div>
        <div className="gp-hero-room">{booking.roomNumber ? `Room ${booking.roomNumber}` : "Room"}</div>
        <div className="gp-hero-tenant" style={{ position: "absolute", top: 0, right: 0 }}>
          <div className="gp-hero-tenant-label">Reserved for</div>
          <div className="gp-hero-tenant-name">{booking.tenantName.split(" ")[0]}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Load Razorpay checkout.js script ────────────────────────────────────────
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TenantBookingDetail() {
  const { id } = useParams();
  const bookingId = Number(id);
  const [timerDone, setTimerDone] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [paidNotified, setPaidNotified] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const { data: booking, isLoading, refetch } = useGetBooking(bookingId, {
    query: {
      enabled: !!bookingId,
      queryKey: getGetBookingQueryKey(bookingId),
      refetchInterval: 10000,
    },
  });

  const handleExpire = useCallback(() => {
    setTimerDone(true);
    refetch();
  }, [refetch]);

  const copyUpi = () => {
    if (booking?.upiId) {
      navigator.clipboard.writeText(booking.upiId).catch(() => {});
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

  const payWithRazorpay = async () => {
    if (paymentLoading || paidNotified) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");

      // Step 1: Create order on backend
      const orderRes = await fetch(`${base}/api/bookings/${bookingId}/create-payment-order`, { method: "POST" });
      if (!orderRes.ok) {
        const err = await orderRes.json().catch(() => ({}));
        if (err.error === "payment_gateway_unavailable") {
          setPaymentError("Online payment is temporarily unavailable. Please use the UPI QR below and tap "I\'ve Paid" once done.");
        } else {
          throw new Error(err.error ?? "Could not initiate payment");
        }
        setPaymentLoading(false);
        return;
      }
      const order = await orderRes.json() as {
        orderId: string; keyId: string; amount: number; currency: string;
        tenantName: string; tenantPhone: string; tenantEmail: string; description: string;
      };

      // Step 2: Load Razorpay checkout.js
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Could not load payment interface. Check your internet connection.");

      // Step 3: Open Razorpay checkout popup
      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: "Gharpayy",
          description: order.description,
          prefill: { name: order.tenantName, contact: order.tenantPhone, email: order.tenantEmail },
          theme: { color: "#c9a84c" },
          modal: { ondismiss: () => { setPaymentLoading(false); resolve(); } },
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              // Step 4: Verify signature on backend and mark booking paid
              const verifyRes = await fetch(`${base}/api/bookings/${bookingId}/claim-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              if (!verifyRes.ok) {
                const err = await verifyRes.json().catch(() => ({}));
                throw new Error(err.error ?? "Payment verification failed");
              }
              setPaidNotified(true);
              await refetch();
              resolve();
            } catch (e: unknown) {
              reject(e);
            }
          },
        });
        rzp.open();
      });
    } catch (e: unknown) {
      setPaymentError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setPaymentLoading(false);
    }
  };

  // Fallback: if gateway unavailable, allow UPI self-report after user sees the error
  const [showFallbackClaim, setShowFallbackClaim] = useState(false);
  const [claimingFallback, setClaimingFallback] = useState(false);

  const claimFallback = async () => {
    if (claimingFallback || paidNotified) return;
    setClaimingFallback(true);
    setPaymentError(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/bookings/${bookingId}/claim-payment-fallback`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Could not confirm payment");
      }
      setPaidNotified(true);
      await refetch();
    } catch (e: unknown) {
      setPaymentError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setClaimingFallback(false);
    }
  };

  const adminPhone = booking?.adminPhone?.replace(/\D/g, "") || "";
  const waBase = adminPhone ? `https://wa.me/${adminPhone}` : null;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="gp">
        <div className="gp-page">
          <div className="gp-card">
            <div className="gp-hero">
              <div className="gp-hero-logo">
                <div className="gp-logo-mark">G</div>
                <div>
                  <div className="gp-logo-name">GHARPAYY</div>
                  <div className="gp-logo-sub">Room Lock-In</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="gp-skeleton" style={{ height: 10, width: 80 }} />
                <div className="gp-skeleton" style={{ height: 24, width: 200 }} />
                <div className="gp-skeleton" style={{ height: 12, width: 100 }} />
              </div>
            </div>
            <div className="gp-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="gp-skeleton" style={{ height: 50 }} />
              <div className="gp-skeleton" style={{ height: 160 }} />
              <div className="gp-skeleton" style={{ height: 200 }} />
              <div className="gp-skeleton" style={{ height: 48 }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (!booking) {
    return (
      <div className="gp">
        <div className="gp-page">
          <div className="gp-card">
            <div className="gp-hero">
              <div className="gp-hero-logo">
                <div className="gp-logo-mark">G</div>
                <div><div className="gp-logo-name">GHARPAYY</div><div className="gp-logo-sub">Room Lock-In</div></div>
              </div>
            </div>
            <div className="gp-body" style={{ textAlign: "center", padding: "32px 22px" }}>
              <div className="gp-state-icon info" style={{ margin: "0 auto 20px" }}>🔍</div>
              <div className="gp-state-title">Link Not Found</div>
              <div className="gp-state-sub">This quotation link is invalid or has been removed. Please contact the property owner for a new link.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const savings = booking.actualRent - booking.discountedRent;
  const upiNote = `Room token – ${booking.propertyName}${booking.roomNumber ? ` Rm ${booking.roomNumber}` : ""}`;
  const upiUrl = booking.upiId ? buildUpiUrl(booking.upiId, booking.propertyName, booking.tokenAmount, upiNote) : null;
  const qrUrl = upiUrl ? buildQrUrl(upiUrl) : null;
  const checkInTotal = booking.discountedRent + booking.deposit + booking.maintenanceFee - booking.tokenAmount;

  // ── PAID — Receipt ────────────────────────────────────────────────────────
  if (booking.status === "paid") {
    const paidDate = new Date(booking.updatedAt);
    const receiptNo = `GHR-${String(booking.id).padStart(4, "0")}`;
    const shareText = `*Payment Receipt — ${booking.propertyName}*\n\nReceipt: ${receiptNo}\nTenant: ${booking.tenantName}\n${booking.roomNumber ? `Room: Room ${booking.roomNumber}\n` : ""}Token Paid: ${formatINR(booking.tokenAmount)}\nDate: ${paidDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}\n\nYour room is locked. Welcome home!`;

    const handleShare = () => {
      if (navigator.share) navigator.share({ title: "Payment Receipt", text: shareText }).catch(() => {});
      else navigator.clipboard.writeText(shareText).catch(() => {});
    };

    return (
      <div className="gp">
        <div className="gp-page">
          <div className="gp-card">
            <CardHero booking={booking} label="Confirmed" />
            <div className="gp-body">
              <div style={{ textAlign: "center", marginBottom: 22 }}>
                <div className="gp-state-icon success" style={{ margin: "0 auto 16px" }}>✓</div>
                <div className="gp-state-title">Room Successfully Locked!</div>
                <div className="gp-state-sub" style={{ marginBottom: 0 }}>Pre-booking received. Your Gharpayy advisor will contact you shortly to confirm your allocation.</div>
              </div>

              <div className="gp-info-card success">
                <div className="gp-info-row">
                  <span className="gp-info-dot success">✓</span>
                  <span>Room is now hard-locked to <strong style={{ color: "var(--text2)" }}>{booking.tenantName.split(" ")[0]}'s</strong> name</span>
                </div>
                <div className="gp-info-row">
                  <span className="gp-info-dot success">✓</span>
                  <span>{formatINR(booking.tokenAmount)} pre-booking adjusts against your first month's rent</span>
                </div>
                <div className="gp-info-row">
                  <span className="gp-info-dot success">✓</span>
                  <span>Balance due at move-in: <strong style={{ color: "var(--text2)" }}>{formatINR(Math.max(0, checkInTotal))}</strong> (rent + deposit + maintenance − token)</span>
                </div>
              </div>

              <div className="gp-receipt">
                <div className="gp-receipt-head">
                  <div>
                    <div className="gp-receipt-head-title">Payment Receipt</div>
                    <div className="gp-receipt-head-no">{receiptNo}</div>
                  </div>
                  <div style={{ fontSize: 20, opacity: 0.6 }}>◈</div>
                </div>
                <div className="gp-receipt-grid">
                  <div className="gp-receipt-cell">
                    <div className="gp-receipt-key">Tenant</div>
                    <div className="gp-receipt-val">{booking.tenantName}</div>
                  </div>
                  <div className="gp-receipt-cell">
                    <div className="gp-receipt-key">Date</div>
                    <div className="gp-receipt-val">{paidDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                  </div>
                  <div className="gp-receipt-cell" style={{ borderBottom: "none" }}>
                    <div className="gp-receipt-key">Property</div>
                    <div className="gp-receipt-val">{booking.propertyName}</div>
                  </div>
                  <div className="gp-receipt-cell" style={{ borderBottom: "none" }}>
                    <div className="gp-receipt-key">Room</div>
                    <div className="gp-receipt-val">{booking.roomNumber ? `Room ${booking.roomNumber}` : "—"}</div>
                  </div>
                </div>
                <div className="gp-receipt-amount-wrap">
                  <div className="gp-receipt-amount-label">Token Amount Paid</div>
                  <div className="gp-receipt-amount">{formatINR(booking.tokenAmount)}</div>
                  <div className="gp-receipt-amount-sub">Adjusted against first month's rent of {formatINR(booking.discountedRent)}</div>
                </div>
              </div>

              {waBase ? (
                <button className="gp-btn gp-btn-wa" onClick={() => window.open(`${waBase}?text=${encodeURIComponent(`Hi! I'm ${booking.tenantName}. I've paid the room token for ${booking.propertyName}${booking.roomNumber ? ` Room ${booking.roomNumber}` : ""}. Sending payment screenshot now.`)}`, "_blank")}>
                  💬 Send Payment Screenshot to Team
                </button>
              ) : null}
              <button className="gp-btn gp-btn-outline" onClick={handleShare}>↗ Share Receipt</button>
              <p className="gp-footnote" style={{ marginTop: 14 }}>Need help? Reach us at <strong style={{ color: "var(--gold)" }}>gharpayy.com</strong></p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── EXPIRED / CANCELLED ───────────────────────────────────────────────────
  if (booking.status === "expired" || booking.status === "cancelled") {
    const reqMsg = encodeURIComponent(
      `Hi! I'm ${booking.tenantName}. My offer for ${booking.propertyName}${booking.roomNumber ? ` Room ${booking.roomNumber}` : ""} has expired. I'm still very interested — can you please send me a fresh offer?`
    );
    return (
      <div className="gp">
        <div className="gp-page">
          <div className="gp-card">
            <CardHero booking={booking} label="Expired" />
            <div className="gp-body" style={{ textAlign: "center" }}>
              <div className="gp-state-icon danger" style={{ margin: "12px auto 16px" }}>⌛</div>
              <div className="gp-state-title">Offer Has Expired</div>
              <div className="gp-state-sub">The 15-minute exclusive window has closed. Act fast — the room may still be available.</div>

              <div className="gp-info-card warn" style={{ textAlign: "left" }}>
                <div className="gp-info-row">
                  <span className="gp-info-dot danger">›</span>
                  <span>Standard rate {formatINR(booking.actualRent)}/mo still applies — but you'll need a fresh offer for the discounted price</span>
                </div>
                {savings > 0 && (
                  <div className="gp-info-row">
                    <span className="gp-info-dot danger">›</span>
                    <span>You could save {formatINR(savings)}/mo — reach out immediately</span>
                  </div>
                )}
                <div className="gp-info-row">
                  <span className="gp-info-dot danger">›</span>
                  <span>Advisors occasionally re-open offers — contact us now for the best chance</span>
                </div>
              </div>

              {waBase ? (
                <button className="gp-btn gp-btn-wa" onClick={() => window.open(`${waBase}?text=${reqMsg}`, "_blank")}>
                  💬 Request a Fresh Offer on WhatsApp
                </button>
              ) : (
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 10, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
                  Please contact the property owner directly to request a new offer.
                </div>
              )}
              {adminPhone && (
                <button className="gp-btn gp-btn-outline" onClick={() => window.open(`tel:${adminPhone}`, "_self")}>
                  📞 Call Owner
                </button>
              )}
              <p className="gp-footnote" style={{ marginTop: 14 }}>
                Rooms go fast. Reaching out immediately gives you the best chance.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── PENDING ───────────────────────────────────────────────────────────────
  if (booking.status === "pending") {
    return (
      <div className="gp">
        <div className="gp-page">
          <div className="gp-card">
            <CardHero booking={booking} label="Pending" />
            <div className="gp-body" style={{ textAlign: "center" }}>
              <div style={{ marginBottom: 20, marginTop: 10 }}>
                <div className="gp-spinner" />
                <div className="gp-state-title">Offer Being Prepared</div>
                <div className="gp-state-sub">
                  Hey {booking.tenantName.split(" ")[0]}! Your advisor is reviewing your details and will activate your personalised 15-minute offer shortly.
                </div>
              </div>

              <div className="gp-info-card gold" style={{ textAlign: "left" }}>
                <div className="gp-info-row">
                  <span className="gp-info-dot gold">›</span>
                  <span>Room is being held for you right now</span>
                </div>
                <div className="gp-info-row">
                  <span className="gp-info-dot gold">›</span>
                  <span>Your offer will be time-limited once activated</span>
                </div>
                <div className="gp-info-row">
                  <span className="gp-info-dot gold">›</span>
                  <span>Offer rent: <strong style={{ color: "var(--gold-light)" }}>{formatINR(booking.discountedRent)}/mo</strong>{savings > 0 ? ` — saves you ${formatINR(savings)}/mo` : ""}</span>
                </div>
              </div>

              {waBase && (
                <button
                  className="gp-btn gp-btn-wa"
                  onClick={() => window.open(`${waBase}?text=${encodeURIComponent(`Hi! I'm ${booking.tenantName}, waiting for my offer for ${booking.propertyName}${booking.roomNumber ? ` Room ${booking.roomNumber}` : ""}. Can you activate it?`)}`, "_blank")}
                >
                  💬 Ping Advisor on WhatsApp
                </button>
              )}
              <p className="gp-footnote" style={{ marginTop: 14 }}>This page updates automatically. No need to refresh.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── APPROVED — Live Offer ─────────────────────────────────────────────────
  const notifyMsg = waBase
    ? `${waBase}?text=${encodeURIComponent(`Hi! I'm ${booking.tenantName}. I've just paid ${formatINR(booking.tokenAmount)} as the room token for ${booking.propertyName}${booking.roomNumber ? ` Room ${booking.roomNumber}` : ""}. Please confirm my lock-in. Link: ${window.location.href}`)}`
    : null;
  const moreTimeMsg = waBase
    ? `${waBase}?text=${encodeURIComponent(`Hi! I need a couple more minutes to complete the payment for ${booking.propertyName}${booking.roomNumber ? ` Room ${booking.roomNumber}` : ""}. Please hold the room for me.`)}`
    : null;
  const requestMsg = waBase
    ? `${waBase}?text=${encodeURIComponent(`Hi! I'm ${booking.tenantName}. My 15-minute offer for ${booking.propertyName}${booking.roomNumber ? ` Room ${booking.roomNumber}` : ""} has just expired. I'm still very interested — can you send me a fresh offer?`)}`
    : null;

  return (
    <div className="gp">
      <div className="gp-page">
        <div className="gp-card">
          <CardHero booking={booking} />
          <div className="gp-body">

            {/* Scarcity */}
            <div className="gp-scarcity">
              <div className="gp-pulse-dot" />
              <span>This room is in high demand. This offer is exclusively reserved for you.</span>
            </div>

            {/* Timer */}
            <LuxuryTimer
              expiresAt={booking.offerExpiresAt}
              tokenAmount={booking.tokenAmount}
              onExpire={handleExpire}
            />

            {/* Pricing */}
            <div className="gp-section-label">Your Exclusive Monthly Rent</div>
            <div className="gp-pricing">
              <div className="gp-price-row">
                <div className="gp-price-strike">{formatINR(booking.actualRent)}</div>
                <div className="gp-price-offer">{formatINR(booking.discountedRent)}</div>
                <div className="gp-price-per">/mo</div>
              </div>
              {savings > 0 && (
                <div className="gp-save-tag">✓ You save {formatINR(savings)} every month</div>
              )}
            </div>

            {/* Breakdown */}
            <div className="gp-section-label">Move-In Cost Breakdown</div>
            <div className="gp-breakdown">
              <div className="gp-breakdown-row">
                <span className="gp-breakdown-key">Monthly Rent</span>
                <span className="gp-breakdown-val">{formatINR(booking.discountedRent)} <span className="gp-tag-pill">OFFER</span></span>
              </div>
              <div className="gp-breakdown-row">
                <span className="gp-breakdown-key">Security Deposit <span className="gp-tag-pill">REFUNDABLE</span></span>
                <span className="gp-breakdown-val">{formatINR(booking.deposit)}</span>
              </div>
              <div className="gp-breakdown-row">
                <span className="gp-breakdown-key">Maintenance <span className="gp-tag-pill">ONE-TIME</span></span>
                <span className="gp-breakdown-val">{formatINR(booking.maintenanceFee)}</span>
              </div>
              <div className="gp-breakdown-row">
                <span className="gp-breakdown-key">Lock-in Period</span>
                <span className="gp-breakdown-val">{booking.stayDurationMonths} Months</span>
              </div>
              <div className="gp-breakdown-row">
                <span className="gp-breakdown-key">Notice Period</span>
                <span className="gp-breakdown-val">{booking.noticePeriodMonths} Month{booking.noticePeriodMonths !== 1 ? "s" : ""}</span>
              </div>
              <div className="gp-breakdown-row total">
                <span className="gp-breakdown-key">Pay at Check-In</span>
                <span className="gp-breakdown-val">{formatINR(Math.max(0, checkInTotal))}</span>
              </div>
            </div>

            {/* Payment block */}
            <div className="gp-payment">
              <div className="gp-payment-head">
                <div>
                  <div className="gp-payment-head-label">Lock It Now — Pre-Booking</div>
                </div>
                <div className="gp-payment-head-amount">{formatINR(booking.tokenAmount)}</div>
              </div>
              <div className="gp-payment-body">
                {qrUrl ? (
                  <>
                    <div className="gp-payment-flex">
                      <div className="gp-qr-wrap">
                        <img src={qrUrl} alt="Scan to Pay" />
                      </div>
                      <div className="gp-payment-right">
                        <div className="gp-payment-hint">Scan with any UPI app to pay {formatINR(booking.tokenAmount)} instantly.</div>
                        <div className="gp-upi-id">
                          <span className="gp-upi-id-text">{booking.upiId}</span>
                          <button className="gp-copy-btn" onClick={copyUpi}>
                            {copiedUpi ? "✓ Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="gp-upi-apps">
                      <button className="gp-upi-app-btn" onClick={() => window.open(upiUrl!.replace("upi://", "phonepe://"), "_blank")}>
                        PhonePe <span className="gp-upi-app-arrow">→</span>
                      </button>
                      <button className="gp-upi-app-btn" onClick={() => window.open(upiUrl!.replace("upi://", "tez://"), "_blank")}>
                        Google Pay <span className="gp-upi-app-arrow">→</span>
                      </button>
                      <button className="gp-upi-app-btn" onClick={() => window.open(upiUrl!.replace("upi://", "paytmmp://"), "_blank")}>
                        Paytm <span className="gp-upi-app-arrow">→</span>
                      </button>
                      <button className="gp-upi-app-btn" onClick={() => window.open(upiUrl!, "_blank")}>
                        Other UPI <span className="gp-upi-app-arrow">→</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="gp-no-upi">
                    Pay {formatINR(booking.tokenAmount)} via UPI or bank transfer using the details shared by your advisor. Then tap "I've Paid" below to notify the team.
                  </div>
                )}
              </div>
            </div>

            {/* CTA buttons */}
            {paymentError && (
              <div style={{ background: "rgba(209,79,79,0.10)", border: "1px solid rgba(209,79,79,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#e08080", marginBottom: 8 }}>
                {paymentError}
                {paymentError.includes("temporarily unavailable") && !showFallbackClaim && (
                  <button
                    style={{ display: "block", marginTop: 8, fontSize: 12, color: "#c9a84c", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                    onClick={() => setShowFallbackClaim(true)}
                  >
                    I've paid via UPI — notify team manually
                  </button>
                )}
              </div>
            )}
            {!paidNotified && !showFallbackClaim && (
              <button
                className={`gp-btn gp-btn-gold`}
                onClick={payWithRazorpay}
                disabled={paymentLoading}
              >
                {paymentLoading ? "Opening payment…" : "⚡ Pay Now — Lock This Room"}
              </button>
            )}
            {!paidNotified && showFallbackClaim && (
              <button
                className="gp-btn gp-btn-gold"
                onClick={claimFallback}
                disabled={claimingFallback}
              >
                {claimingFallback ? "Notifying team…" : "⚡ I've Paid via UPI — Notify Team"}
              </button>
            )}
            {paidNotified && (
              <button className="gp-btn gp-btn-green" disabled>
                ✓ Room Locked — Payment Confirmed
              </button>
            )}
            {notifyMsg && !paidNotified && (
              <button
                className="gp-btn gp-btn-wa"
                style={{ marginTop: 6 }}
                onClick={() => window.open(notifyMsg, "_blank")}
              >
                💬 Notify Team on WhatsApp Instead
              </button>
            )}

            {!timerDone && !paidNotified && moreTimeMsg && (
              <button className="gp-btn gp-btn-wa" onClick={() => window.open(moreTimeMsg, "_blank")}>
                💬 Need a Few More Minutes?
              </button>
            )}

            {/* Show reactivate section if timer expired while status is approved */}
            {timerDone && (
              <div className="gp-reactivate-section">
                <div className="gp-reactivate-title">Offer window closed</div>
                <div className="gp-reactivate-sub">
                  The 15 minutes have passed, but you can still get this room. Reach out to your advisor immediately — they can reopen the offer in seconds.
                </div>
                {requestMsg && (
                  <button className="gp-btn gp-btn-wa" onClick={() => window.open(requestMsg, "_blank")}>
                    💬 Request a Fresh Offer
                  </button>
                )}
              </div>
            )}

            <div className="gp-divider" />
            <p className="gp-footnote">
              Pre-booking is fully adjustable against your move-in balance.<br />
              Your room stays locked until check-in is complete.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
