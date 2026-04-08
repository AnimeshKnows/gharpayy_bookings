import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db, teammatesTable, zonesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SECRET = process.env.SESSION_SECRET ?? "gharpayy-dev-secret";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function signToken(teammateId: number): string {
  const ts = Date.now();
  const payload = `${teammateId}:${ts}`;
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyToken(token: string): { teammateId: number } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;
    const [idStr, tsStr, sig] = parts;
    const payload = `${idStr}:${tsStr}`;
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(payload)
      .digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
      return null;
    const ts = parseInt(tsStr, 10);
    if (Date.now() - ts > TOKEN_TTL_MS) return null;
    return { teammateId: parseInt(idStr, 10) };
  } catch {
    return null;
  }
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    const derived = crypto.scryptSync(pin, salt, 32).toString("hex");
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(derived, "hex"),
    );
  } catch {
    return false;
  }
}

export interface AuthedRequest extends Request {
  teammate?: {
    id: number;
    name: string;
    phone: string;
    role: string;
    zoneId: number | null;
    zoneName: string | null;
    zoneSlug: string | null;
  };
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers["authorization"];
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const [row] = await db
    .select({
      id: teammatesTable.id,
      name: teammatesTable.name,
      phone: teammatesTable.phone,
      role: teammatesTable.role,
      zoneId: teammatesTable.zoneId,
      isActive: teammatesTable.isActive,
      zoneName: zonesTable.name,
      zoneSlug: zonesTable.slug,
    })
    .from(teammatesTable)
    .leftJoin(zonesTable, eq(teammatesTable.zoneId, zonesTable.id))
    .where(eq(teammatesTable.id, payload.teammateId))
    .limit(1);

  if (!row || !row.isActive) {
    res.status(401).json({ error: "Account inactive or not found" });
    return;
  }

  req.teammate = {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    zoneId: row.zoneId ?? null,
    zoneName: row.zoneName ?? null,
    zoneSlug: row.zoneSlug ?? null,
  };
  next();
}

export async function optionalAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers["authorization"];
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }
  await requireAuth(req, res, next);
}
