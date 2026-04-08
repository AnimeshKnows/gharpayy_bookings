import { Router } from "express";
import { db, teammatesTable, zonesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, hashPin, type AuthedRequest } from "../middleware/auth";

const router = Router();

const teammateSafe = {
  id: teammatesTable.id,
  name: teammatesTable.name,
  phone: teammatesTable.phone,
  email: teammatesTable.email,
  role: teammatesTable.role,
  zoneId: teammatesTable.zoneId,
  isActive: teammatesTable.isActive,
  createdAt: teammatesTable.createdAt,
  zoneName: zonesTable.name,
  zoneSlug: zonesTable.slug,
};

router.get("/teammates", requireAuth, async (req: AuthedRequest, res) => {
  const tm = req.teammate!;
  const rows = await db
    .select(teammateSafe)
    .from(teammatesTable)
    .leftJoin(zonesTable, eq(teammatesTable.zoneId, zonesTable.id))
    .orderBy(teammatesTable.name);

  // Zone admins and agents only see their own zone
  if (tm.role !== "superadmin") {
    res.json(rows.filter((r) => r.zoneId === tm.zoneId));
    return;
  }
  res.json(rows);
});

router.post("/teammates", requireAuth, async (req: AuthedRequest, res) => {
  const tm = req.teammate!;
  if (tm.role === "agent") {
    res.status(403).json({ error: "Not allowed" });
    return;
  }

  const { name, phone, email, role, pin, zoneId } = req.body as {
    name: string;
    phone: string;
    email?: string;
    role?: string;
    pin: string;
    zoneId?: number;
  };

  if (!name || !phone || !pin || pin.length < 4) {
    res.status(400).json({ error: "name, phone, and a 4+ digit pin are required" });
    return;
  }

  // Zone admin can only create agents in their own zone
  const effectiveZoneId =
    tm.role === "zone_admin" ? tm.zoneId : (zoneId ?? null);
  const effectiveRole =
    tm.role === "zone_admin" ? "agent" : (role ?? "agent");

  if (effectiveRole === "superadmin" && tm.role !== "superadmin") {
    res.status(403).json({ error: "Only superadmin can create superadmins" });
    return;
  }

  const [teammate] = await db
    .insert(teammatesTable)
    .values({
      name,
      phone,
      email,
      role: effectiveRole,
      pinHash: hashPin(pin),
      zoneId: effectiveZoneId,
    })
    .returning({
      id: teammatesTable.id,
      name: teammatesTable.name,
      phone: teammatesTable.phone,
      email: teammatesTable.email,
      role: teammatesTable.role,
      zoneId: teammatesTable.zoneId,
      isActive: teammatesTable.isActive,
      createdAt: teammatesTable.createdAt,
    });

  res.status(201).json(teammate);
});

router.patch("/teammates/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tm = req.teammate!;
  const targetId = parseInt(req.params.id);

  const { name, email, pin, isActive, zoneId, role } = req.body as {
    name?: string;
    email?: string;
    pin?: string;
    isActive?: boolean;
    zoneId?: number;
    role?: string;
  };

  const updatePayload: Partial<typeof teammatesTable.$inferInsert> = {};
  if (name !== undefined) updatePayload.name = name;
  if (email !== undefined) updatePayload.email = email;
  if (pin && pin.length >= 4) updatePayload.pinHash = hashPin(pin);
  if (isActive !== undefined && tm.role !== "agent") updatePayload.isActive = isActive;
  if (zoneId !== undefined && tm.role === "superadmin") updatePayload.zoneId = zoneId;
  if (role !== undefined && tm.role === "superadmin") updatePayload.role = role;

  const [updated] = await db
    .update(teammatesTable)
    .set(updatePayload)
    .where(
      tm.role === "superadmin"
        ? eq(teammatesTable.id, targetId)
        : and(eq(teammatesTable.id, targetId), eq(teammatesTable.zoneId, tm.zoneId!)),
    )
    .returning({
      id: teammatesTable.id,
      name: teammatesTable.name,
      phone: teammatesTable.phone,
      email: teammatesTable.email,
      role: teammatesTable.role,
      zoneId: teammatesTable.zoneId,
      isActive: teammatesTable.isActive,
    });

  if (!updated) {
    res.status(404).json({ error: "Teammate not found or access denied" });
    return;
  }
  res.json(updated);
});

router.delete("/teammates/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tm = req.teammate!;
  if (tm.role !== "superadmin" && tm.role !== "zone_admin") {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  await db
    .delete(teammatesTable)
    .where(eq(teammatesTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

export default router;
