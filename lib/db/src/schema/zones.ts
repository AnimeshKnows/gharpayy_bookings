import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const zonesTable = pgTable("zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(),
  upiId: text("upi_id"),
  adminPhone: text("admin_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Zone = typeof zonesTable.$inferSelect;
