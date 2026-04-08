import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { zonesTable } from "./zones";

export const teammatesTable = pgTable("teammates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email"),
  role: text("role").notNull().default("agent"), // 'superadmin' | 'zone_admin' | 'agent'
  pinHash: text("pin_hash").notNull(),
  upiId: text("upi_id"),
  zoneId: integer("zone_id").references(() => zonesTable.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Teammate = typeof teammatesTable.$inferSelect;
