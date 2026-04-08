import { Router, type IRouter } from "express";
import { eq, sql, inArray, lt, and, isNull, or } from "drizzle-orm";
import crypto from "crypto";
import { db, bookingsTable, zonesTable } from "@workspace/db";
import { optionalAuth, requireAuth, type AuthedRequest } from "../middleware/auth";
import {
  CreateBookingBody,
  CreateBookingRequestBody,
  CreateBookingRequestResponse,
  GetBookingParams,
  UpdateBookingBody,
  UpdateBookingParams,
  DeleteBookingParams,
  ApproveBookingParams,
  ReactivateBookingParams,
  GetWhatsappMessageParams,
  ListBookingsResponse,
  GetBookingResponse,
  UpdateBookingResponse,
  ApproveBookingResponse,
  ReactivateBookingResponse,
  GetWhatsappMessageResponse,
  GetBookingStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-IN").format(n);
}

function toResponse(b: typeof bookingsTable.$inferSelect) {
  return {
    ...b,
    notes: b.notes ?? null,
    viewedAt: b.viewedAt?.toISOString() ?? null,
    approvedAt: b.approvedAt?.toISOString() ?? null,
    offerExpiresAt: b.offerExpiresAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

// Single-query bulk expire: UPDATE ... WHERE status='approved' AND offer_expires_at < now
async function bulkExpire(bookings: (typeof bookingsTable.$inferSelect)[]) {
  const now = new Date();
  const toExpire = bookings
    .filter((b) => b.status === "approved" && b.offerExpiresAt && b.offerExpiresAt < now)
    .map((b) => b.id);

  if (toExpire.length > 0) {
    await db
      .update(bookingsTable)
      .set({ status: "expired" })
      .where(inArray(bookingsTable.id, toExpire));
    bookings.forEach((b) => {
      if (toExpire.includes(b.id)) b.status = "expired";
    });
  }
}

async function autoExpireOne(b: typeof bookingsTable.$inferSelect) {
  if (b.status === "approved" && b.offerExpiresAt && b.offerExpiresAt < new Date()) {
    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "expired" })
      .where(eq(bookingsTable.id, b.id))
      .returning();
    return updated ?? b;
  }
  return b;
}

// ── List ────────────────────────────────────────────────────────────────────

router.get("/bookings", optionalAuth, async (req: AuthedRequest, res): Promise<void> => {
  const tm = req.teammate;
  const query = db.select().from(bookingsTable);
  const bookings = await (
    tm && tm.role !== "superadmin" && tm.zoneId
      ? query.where(eq(bookingsTable.zoneId, tm.zoneId))
      : query
  ).orderBy(sql`${bookingsTable.createdAt} DESC`);
  await bulkExpire(bookings);
  res.json(ListBookingsResponse.parse(bookings.map(toResponse)));
});

// ── Stats ───────────────────────────────────────────────────────────────────

router.get("/bookings/stats", optionalAuth, async (req: AuthedRequest, res): Promise<void> => {
  const tm = req.teammate;
  const query = db.select().from(bookingsTable);
  const bookings = await (
    tm && tm.role !== "superadmin" && tm.zoneId
      ? query.where(eq(bookingsTable.zoneId, tm.zoneId))
      : query
  );
  const now = new Date();
  // apply in-memory expire for stats accuracy
  bookings.forEach((b) => {
    if (b.status === "approved" && b.offerExpiresAt && b.offerExpiresAt < now) {
      b.status = "expired";
    }
  });
  res.json(
    GetBookingStatsResponse.parse({
      total: bookings.length,
      pending: bookings.filter((b) => b.status === "pending").length,
      approved: bookings.filter((b) => b.status === "approved").length,
      paid: bookings.filter((b) => b.status === "paid").length,
      expired: bookings.filter((b) => b.status === "expired").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
      totalRevenue: bookings
        .filter((b) => b.status === "paid")
        .reduce((s, b) => s + b.tokenAmount, 0),
    })
  );
});

// ── Insights ────────────────────────────────────────────────────────────────

router.get("/bookings/insights", async (req, res): Promise<void> => {
  const all = await db.select().from(bookingsTable);
  const now = new Date();

  // Apply in-memory auto-expire for accurate numbers
  all.forEach((b) => {
    if (b.status === "approved" && b.offerExpiresAt && b.offerExpiresAt < now) {
      b.status = "expired";
    }
  });

  // Funnel
  const total = all.length;
  const activated = all.filter((b) => ["approved", "paid", "expired"].includes(b.status)).length;
  const paid = all.filter((b) => b.status === "paid").length;
  const expired = all.filter((b) => b.status === "expired").length;

  const funnel = {
    total,
    activationRate: total > 0 ? Math.round((activated / total) * 100) : 0,
    conversionRate: total > 0 ? Math.round((paid / total) * 100) : 0,
    expiryRate: activated > 0 ? Math.round((expired / activated) * 100) : 0,
  };

  // By source
  const sources = ["admin", "tenant", "walkin"] as const;
  const sourceLabels = { admin: "Admin Push", tenant: "Self-Request", walkin: "Walk-in" };
  const bySource = sources
    .map((source) => {
      const group = all.filter((b) => b.source === source);
      if (group.length === 0) return null;
      const gpaid = group.filter((b) => b.status === "paid");
      return {
        source,
        label: sourceLabels[source],
        total: group.length,
        paid: gpaid.length,
        expired: group.filter((b) => b.status === "expired").length,
        cancelled: group.filter((b) => b.status === "cancelled").length,
        pending: group.filter((b) => b.status === "pending").length,
        approved: group.filter((b) => b.status === "approved").length,
        conversionRate: group.length > 0 ? Math.round((gpaid.length / group.length) * 100) : 0,
        avgTokenAmount:
          gpaid.length > 0
            ? Math.round(gpaid.reduce((s, b) => s + b.tokenAmount, 0) / gpaid.length)
            : 0,
      };
    })
    .filter(Boolean);

  // At-risk: pending > 24h OR expired not reactivated > 48h
  const atRisk = all
    .filter((b) => {
      const ageH = (now.getTime() - b.createdAt.getTime()) / 3600000;
      if (b.status === "pending" && ageH > 24) return true;
      if (b.status === "expired" && ageH > 48) return true;
      return false;
    })
    .map((b) => ({
      id: b.id,
      tenantName: b.tenantName,
      propertyName: b.propertyName,
      source: b.source as "admin" | "tenant" | "walkin",
      status: b.status as "pending" | "approved" | "paid" | "expired" | "cancelled",
      hoursAgo: Math.round((now.getTime() - b.createdAt.getTime()) / 3600000),
    }))
    .sort((a, b) => b.hoursAgo - a.hoursAgo)
    .slice(0, 5);

  // Recent wins
  const recentWins = all
    .filter((b) => b.status === "paid")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5)
    .map((b) => ({
      id: b.id,
      tenantName: b.tenantName,
      propertyName: b.propertyName,
      tokenAmount: b.tokenAmount,
      source: b.source as "admin" | "tenant" | "walkin",
      updatedAt: b.updatedAt.toISOString(),
    }));

  // Avg time to pay (creation → updatedAt for paid bookings)
  const paidBookings = all.filter((b) => b.status === "paid");
  const avgTimeToPayHours =
    paidBookings.length > 0
      ? Math.round(
          paidBookings.reduce(
            (s, b) => s + (b.updatedAt.getTime() - b.createdAt.getTime()) / 3600000,
            0
          ) / paidBookings.length
        )
      : null;

  res.json({
    funnel,
    bySource,
    atRisk,
    recentWins,
    avgTimeToPayHours,
    totalRevenue: paidBookings.reduce((s, b) => s + b.tokenAmount, 0),
  });
});

// ── Admin: Create booking quotation ────────────────────────────────────────

router.post("/bookings", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const tm = req.teammate!;
  const source = parsed.data.source ?? "admin";

  // Zone-level defaults for upiId / adminPhone if not supplied in body
  let zoneUpiId: string | null = null;
  let zoneAdminPhone: string | null = null;
  if (tm.zoneId) {
    const [zone] = await db.select().from(zonesTable).where(eq(zonesTable.id, tm.zoneId));
    if (zone) {
      zoneUpiId = zone.upiId ?? null;
      zoneAdminPhone = zone.adminPhone ?? null;
    }
  }

  const [booking] = await db
    .insert(bookingsTable)
    .values({
      ...parsed.data,
      status: "pending",
      source,
      zoneId: tm.role === "superadmin" ? (parsed.data as any).zoneId ?? null : tm.zoneId ?? null,
      assignedToId: tm.id,
      upiId: parsed.data.upiId ?? zoneUpiId,
      adminPhone: parsed.data.adminPhone ?? zoneAdminPhone,
    })
    .returning();

  res.status(201).json(GetBookingResponse.parse(toResponse(booking)));
});

// ── Tenant: Self-request ────────────────────────────────────────────────────

router.post("/booking-requests", async (req, res): Promise<void> => {
  const parsed = CreateBookingRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Look up zone by slug if provided
  let zoneId: number | null = null;
  let zoneUpiId: string | null = null;
  let zoneAdminPhone: string | null = null;
  if (parsed.data.zoneSlug) {
    const [zone] = await db.select().from(zonesTable).where(eq(zonesTable.slug, parsed.data.zoneSlug));
    if (zone) {
      zoneId = zone.id;
      zoneUpiId = zone.upiId ?? null;
      zoneAdminPhone = zone.adminPhone ?? null;
    }
  }

  const [booking] = await db
    .insert(bookingsTable)
    .values({
      tenantName: parsed.data.tenantName,
      tenantPhone: parsed.data.tenantPhone,
      tenantEmail: parsed.data.tenantEmail ?? null,
      propertyName: parsed.data.propertyName,
      tenantMessage: parsed.data.tenantMessage ?? null,
      actualRent: 0,
      discountedRent: 0,
      deposit: 0,
      maintenanceFee: 0,
      tokenAmount: 0,
      stayDurationMonths: 11,
      noticePeriodMonths: 1,
      status: "pending",
      source: "tenant",
      zoneId,
      upiId: zoneUpiId,
      adminPhone: zoneAdminPhone,
    })
    .returning();

  res.status(201).json(CreateBookingRequestResponse.parse(toResponse(booking)));
});

// ── Tenant history by phone (must be before /:id) ────────────────────────────

router.get("/bookings/history/:phone", optionalAuth, async (req: AuthedRequest, res): Promise<void> => {
  const phone = decodeURIComponent(req.params.phone as string);
  if (!phone) { res.status(400).json({ error: "Phone required" }); return; }

  const all = await db.select().from(bookingsTable).where(eq(bookingsTable.tenantPhone, phone));
  const tm = req.teammate;
  const filtered = tm && tm.role !== "superadmin" && tm.zoneId
    ? all.filter(b => b.zoneId === tm.zoneId)
    : all;

  res.json(filtered.map(b => ({
    id: b.id,
    propertyName: b.propertyName,
    status: b.status,
    tokenAmount: b.tokenAmount,
    source: b.source,
    createdAt: b.createdAt.toISOString(),
  })));
});

// ── Get single (with auto-expire) ──────────────────────────────────────────

router.get("/bookings/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetBookingParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [raw] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!raw) { res.status(404).json({ error: "Booking not found" }); return; }

  const booking = await autoExpireOne(raw);

  // Track first tenant view and flag admin unread (fire and forget)
  if (!booking.viewedAt) {
    db.update(bookingsTable)
      .set({ viewedAt: new Date(), adminUnread: true })
      .where(eq(bookingsTable.id, booking.id))
      .execute()
      .catch(() => {});
  }

  res.json(GetBookingResponse.parse(toResponse(booking)));
});

// ── Update ──────────────────────────────────────────────────────────────────

router.patch("/bookings/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateBookingParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [booking] = await db
    .update(bookingsTable)
    .set(parsed.data)
    .where(eq(bookingsTable.id, params.data.id))
    .returning();
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  res.json(UpdateBookingResponse.parse(toResponse(booking)));
});

// ── Delete ──────────────────────────────────────────────────────────────────

router.delete("/bookings/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteBookingParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [booking] = await db
    .delete(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id))
    .returning();
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  res.sendStatus(204);
});

// ── Approve / start timer ──────────────────────────────────────────────────

router.post("/bookings/:id/approve", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ApproveBookingParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  const pricingOverride = UpdateBookingBody.safeParse(req.body);
  const extra = pricingOverride.success ? pricingOverride.data : {};

  const [booking] = await db
    .update(bookingsTable)
    .set({ ...extra, status: "approved", approvedAt: now, offerExpiresAt: expiresAt })
    .where(eq(bookingsTable.id, params.data.id))
    .returning();
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  res.json(ApproveBookingResponse.parse(toResponse(booking)));
});

// ── Tenant: create Razorpay payment order ──────────────────────────────────

router.post("/bookings/:id/create-payment-order", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (booking.status !== "approved") { res.status(400).json({ error: "Offer is no longer active" }); return; }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    res.status(503).json({ error: "payment_gateway_unavailable" }); return;
  }

  const amountPaise = booking.tokenAmount * 100;
  const receipt = `booking-${booking.id}-${Date.now()}`;

  const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt }),
  });

  if (!orderRes.ok) {
    const err = await orderRes.json().catch(() => ({}));
    res.status(502).json({ error: "Failed to create payment order", detail: err }); return;
  }

  const order = (await orderRes.json()) as { id: string };
  await db.update(bookingsTable).set({ razorpayOrderId: order.id }).where(eq(bookingsTable.id, id));

  res.json({
    orderId: order.id,
    keyId,
    amount: amountPaise,
    currency: "INR",
    bookingId: booking.id,
    tenantName: booking.tenantName,
    tenantPhone: booking.tenantPhone,
    tenantEmail: booking.tenantEmail ?? "",
    description: `Room token — ${booking.propertyName}${booking.roomNumber ? ` Rm ${booking.roomNumber}` : ""}`,
  });
});

// ── Tenant: confirm payment (verifies Razorpay signature) ──────────────────

router.post("/bookings/:id/claim-payment", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (booking.status !== "approved") { res.status(400).json({ error: "Offer is no longer active" }); return; }

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body as {
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  };

  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  // Gateway path: verify Razorpay HMAC signature
  if (razorpay_payment_id && razorpay_order_id && razorpay_signature && keySecret) {
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      res.status(400).json({ error: "Payment signature verification failed" }); return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "paid", razorpayPaymentId: razorpay_payment_id, adminUnread: true })
      .where(eq(bookingsTable.id, id))
      .returning();

    res.json({ success: true, id: updated.id, status: updated.status, verified: true }); return;
  }

  // No gateway configured — reject unverified self-reports
  res.status(400).json({
    error: "Payment verification required. Please complete payment via the payment gateway.",
  });
});

// ── Tenant: UPI fallback claim (only when gateway not configured) ───────────

router.post("/bookings/:id/claim-payment-fallback", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    res.status(400).json({ error: "Please use the payment gateway to complete payment." }); return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (booking.status !== "approved") { res.status(400).json({ error: "Offer is no longer active" }); return; }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "paid", adminUnread: true })
    .where(eq(bookingsTable.id, id))
    .returning();

  res.json({ success: true, id: updated.id, status: updated.status, verified: false });
});

// ── Admin: mark booking as read (clears notification) ──────────────────────

router.post("/bookings/:id/mark-read", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

  await db.update(bookingsTable).set({ adminUnread: false }).where(eq(bookingsTable.id, id));
  res.json({ success: true });
});

// ── Reactivate ──────────────────────────────────────────────────────────────

router.post("/bookings/:id/reactivate", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ReactivateBookingParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  const [booking] = await db
    .update(bookingsTable)
    .set({ status: "approved", approvedAt: now, offerExpiresAt: expiresAt })
    .where(eq(bookingsTable.id, params.data.id))
    .returning();
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  res.json(ReactivateBookingResponse.parse(toResponse(booking)));
});

// ── WhatsApp: quotation message ────────────────────────────────────────────

router.get("/bookings/:id/whatsapp", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetWhatsappMessageParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost:80";
  const url = `https://${domain}/bookings/${booking.id}`;
  const roomInfo = booking.roomNumber ? ` (Room ${booking.roomNumber})` : "";
  const savings = booking.actualRent - booking.discountedRent;

  const message = `Hi ${booking.tenantName}! 🏠

Here is your *exclusive offer* for *${booking.propertyName}*${roomInfo}:

💰 *Rent:* ~~₹${formatCurrency(booking.actualRent)}/mo~~ → *₹${formatCurrency(booking.discountedRent)}/mo*${savings > 0 ? ` _(Save ₹${formatCurrency(savings)}/mo!)_` : ""}
🔒 *Security Deposit:* ₹${formatCurrency(booking.deposit)}
🔧 *One-time Maintenance:* ₹${formatCurrency(booking.maintenanceFee)}
🕐 *Stay Duration:* ${booking.stayDurationMonths} months
📅 *Notice Period:* ${booking.noticePeriodMonths} month${booking.noticePeriodMonths !== 1 ? "s" : ""}

*To lock this room, pay a token of ₹${formatCurrency(booking.tokenAmount)}* (adjusted in first rent).

⏰ *This offer is valid for only 15 minutes* after I activate it.

👉 ${url}

Once you pay, reply with your screenshot — I'll send the receipt immediately.`;

  const phone = booking.tenantPhone.replace(/\D/g, "");
  res.json(GetWhatsappMessageResponse.parse({ message, url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`, phone: booking.tenantPhone }));
});

// ── WhatsApp: follow-up reminder ───────────────────────────────────────────

router.get("/bookings/:id/reminder", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetWhatsappMessageParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost:80";
  const url = `https://${domain}/bookings/${booking.id}`;
  const firstName = booking.tenantName.split(" ")[0];
  const roomInfo = booking.roomNumber ? ` (Room ${booking.roomNumber})` : "";

  // Guard: don't show ₹0 if pricing not set
  const tokenText =
    booking.tokenAmount > 0
      ? `Pay just ₹${formatCurrency(booking.tokenAmount)} to lock it in.`
      : "I'll set your personalised price as soon as we talk.";

  const message = `Hi ${firstName}! 👋

Just checking in — the room at *${booking.propertyName}*${roomInfo} is still available for you.

${tokenText} Takes less than 2 minutes.

We're getting enquiries from others too, so I can't hold it for long. If you're still interested:
👉 ${url}

Any questions? Just reply here — happy to chat. 😊`;

  const phone = booking.tenantPhone.replace(/\D/g, "");
  res.json(GetWhatsappMessageResponse.parse({ message, url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`, phone: booking.tenantPhone }));
});

export default router;
