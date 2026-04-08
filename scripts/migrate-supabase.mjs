import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("Connected to Supabase");

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
  );
`);
console.log("zones table OK");

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
  );
`);
console.log("teammates table OK");

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
  );
`);
console.log("bookings table OK");

await client.end();
console.log("Migration complete!");
