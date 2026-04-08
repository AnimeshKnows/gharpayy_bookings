import { Router } from "express";
import { db, zonesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/zones", requireAuth, async (req: AuthedRequest, res) => {
  const rows = await db.select().from(zonesTable).orderBy(zonesTable.name);
  res.json(rows);
});

router.post("/zones", requireAuth, async (req: AuthedRequest, res) => {
  if (req.teammate?.role !== "superadmin") {
    res.status(403).json({ error: "Superadmin only" });
    return;
  }
  const { name, description, slug } = req.body as {
    name: string;
    description?: string;
    slug: string;
  };
  if (!name || !slug) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }
  const [zone] = await db
    .insert(zonesTable)
    .values({ name, description, slug: slug.toLowerCase().replace(/\s+/g, "-") })
    .returning();
  res.status(201).json(zone);
});

router.patch("/zones/:id", requireAuth, async (req: AuthedRequest, res) => {
  if (req.teammate?.role !== "superadmin") {
    res.status(403).json({ error: "Superadmin only" });
    return;
  }
  const { name, description } = req.body as { name?: string; description?: string };
  const [zone] = await db
    .update(zonesTable)
    .set({ name, description })
    .where(eq(zonesTable.id, parseInt(req.params.id)))
    .returning();
  if (!zone) {
    res.status(404).json({ error: "Zone not found" });
    return;
  }
  res.json(zone);
});

router.delete("/zones/:id", requireAuth, async (req: AuthedRequest, res) => {
  if (req.teammate?.role !== "superadmin") {
    res.status(403).json({ error: "Superadmin only" });
    return;
  }
  await db.delete(zonesTable).where(eq(zonesTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

export default router;
