import { Router } from "express";
import { db, teammatesTable, zonesTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { signToken, hashPin, verifyPin, requireAuth, type AuthedRequest } from "../middleware/auth";

const router = Router();

// Check if any teammates exist (first-run detection)
router.get("/auth/setup-needed", async (_req, res) => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(teammatesTable);
  res.json({ setupNeeded: Number(total) === 0 });
});

// Bootstrap first superadmin (only when no teammates exist)
router.post("/auth/setup", async (req, res) => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(teammatesTable);
  if (Number(total) > 0) {
    res.status(409).json({ error: "Setup already completed" });
    return;
  }

  const { name, phone, pin } = req.body as { name: string; phone: string; pin: string };
  if (!name || !phone || !pin || pin.length < 4) {
    res.status(400).json({ error: "name, phone, and a 4+ digit pin are required" });
    return;
  }

  const [teammate] = await db
    .insert(teammatesTable)
    .values({ name, phone, role: "superadmin", pinHash: hashPin(pin) })
    .returning();

  const token = signToken(teammate.id);
  res.json({
    token,
    teammate: {
      id: teammate.id,
      name: teammate.name,
      phone: teammate.phone,
      role: teammate.role,
      zoneId: null,
      zoneName: null,
      zoneSlug: null,
      zoneUpiId: null,
      zoneAdminPhone: null,
    },
  });
});

// Login
router.post("/auth/login", async (req, res) => {
  const { phone, pin } = req.body as { phone: string; pin: string };
  if (!phone || !pin) {
    res.status(400).json({ error: "phone and pin are required" });
    return;
  }

  const [row] = await db
    .select({
      id: teammatesTable.id,
      name: teammatesTable.name,
      phone: teammatesTable.phone,
      role: teammatesTable.role,
      zoneId: teammatesTable.zoneId,
      pinHash: teammatesTable.pinHash,
      isActive: teammatesTable.isActive,
      zoneName: zonesTable.name,
      zoneSlug: zonesTable.slug,
      zoneUpiId: zonesTable.upiId,
      zoneAdminPhone: zonesTable.adminPhone,
    })
    .from(teammatesTable)
    .leftJoin(zonesTable, eq(teammatesTable.zoneId, zonesTable.id))
    .where(eq(teammatesTable.phone, phone))
    .limit(1);

  if (!row || !row.isActive || !verifyPin(pin, row.pinHash)) {
    res.status(401).json({ error: "Invalid phone or PIN" });
    return;
  }

  const token = signToken(row.id);
  res.json({
    token,
    teammate: {
      id: row.id,
      name: row.name,
      phone: row.phone,
      role: row.role,
      zoneId: row.zoneId ?? null,
      zoneName: row.zoneName ?? null,
      zoneSlug: row.zoneSlug ?? null,
      zoneUpiId: row.zoneUpiId ?? null,
      zoneAdminPhone: row.zoneAdminPhone ?? null,
    },
  });
});

// Me — also joins zone for fresh data
router.get("/auth/me", requireAuth, async (req: AuthedRequest, res) => {
  const tm = req.teammate!;
  if (!tm.zoneId) {
    res.json({
      teammate: {
        ...tm,
        zoneUpiId: null,
        zoneAdminPhone: null,
      },
    });
    return;
  }
  const [zone] = await db.select().from(zonesTable).where(eq(zonesTable.id, tm.zoneId));
  res.json({
    teammate: {
      ...tm,
      zoneUpiId: zone?.upiId ?? null,
      zoneAdminPhone: zone?.adminPhone ?? null,
    },
  });
});

// Reset a teammate PIN (zone_admin can reset agents in their zone; superadmin can reset anyone)
router.post("/auth/reset-pin", requireAuth, async (req: AuthedRequest, res) => {
  const { teammateId, newPin } = req.body as { teammateId: number; newPin: string };
  const me = req.teammate!;

  if (!teammateId || !newPin || newPin.length < 4) {
    res.status(400).json({ error: "teammateId and a 4+ digit newPin are required" });
    return;
  }

  const [target] = await db.select().from(teammatesTable).where(eq(teammatesTable.id, teammateId));
  if (!target) { res.status(404).json({ error: "Teammate not found" }); return; }

  // Superadmin can reset anyone; zone_admin can only reset agents in their own zone
  if (me.role !== "superadmin") {
    if (me.role !== "zone_admin" || target.zoneId !== me.zoneId || target.role === "superadmin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  await db
    .update(teammatesTable)
    .set({ pinHash: hashPin(newPin) })
    .where(eq(teammatesTable.id, teammateId));

  res.json({ ok: true });
});

export default router;
