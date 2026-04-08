import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "zones" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "slug" text NOT NULL,
        "upi_id" text,
        "admin_phone" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "zones_slug_unique" UNIQUE("slug")
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "teammates" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "phone" text NOT NULL,
        "email" text,
        "role" text DEFAULT 'agent' NOT NULL,
        "pin_hash" text NOT NULL,
        "upi_id" text,
        "zone_id" integer REFERENCES "zones"("id"),
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "teammates_phone_unique" UNIQUE("phone")
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "bookings" (
        "id" serial PRIMARY KEY NOT NULL,
        "tenant_name" text NOT NULL,
        "tenant_phone" text NOT NULL,
        "tenant_email" text,
        "tenant_message" text,
        "property_name" text NOT NULL,
        "room_number" text,
        "actual_rent" integer DEFAULT 0 NOT NULL,
        "discounted_rent" integer DEFAULT 0 NOT NULL,
        "deposit" integer DEFAULT 0 NOT NULL,
        "maintenance_fee" integer DEFAULT 0 NOT NULL,
        "token_amount" integer DEFAULT 0 NOT NULL,
        "stay_duration_months" integer DEFAULT 11 NOT NULL,
        "notice_period_months" integer DEFAULT 1 NOT NULL,
        "upi_id" text,
        "admin_phone" text,
        "source" text DEFAULT 'admin' NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "zone_id" integer REFERENCES "zones"("id"),
        "assigned_to_id" integer REFERENCES "teammates"("id"),
        "notes" text,
        "viewed_at" timestamp with time zone,
        "approved_at" timestamp with time zone,
        "offer_expires_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    // Add Razorpay payment tracking columns (idempotent — safe to re-run)
    await client.query(`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "razorpay_order_id" text`);
    await client.query(`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "razorpay_payment_id" text`);
    // Add admin notification tracking column
    await client.query(`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "admin_unread" boolean NOT NULL DEFAULT false`);
    logger.info("Database migration complete");
  } catch (err) {
    logger.error({ err }, "Migration failed");
    throw err;
  } finally {
    client.release();
  }
}

// Bind port FIRST so Render's health check passes immediately.
// Migration runs in the background after the server is up.
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  migrate().catch((err) => {
    logger.warn({ err }, "Migration skipped — DB may be unavailable or already migrated");
  });
});