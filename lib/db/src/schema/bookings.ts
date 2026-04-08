import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { zonesTable } from "./zones";
import { teammatesTable } from "./teammates";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  tenantName: text("tenant_name").notNull(),
  tenantPhone: text("tenant_phone").notNull(),
  tenantEmail: text("tenant_email"),
  tenantMessage: text("tenant_message"),
  propertyName: text("property_name").notNull(),
  roomNumber: text("room_number"),
  actualRent: integer("actual_rent").notNull().default(0),
  discountedRent: integer("discounted_rent").notNull().default(0),
  deposit: integer("deposit").notNull().default(0),
  maintenanceFee: integer("maintenance_fee").notNull().default(0),
  tokenAmount: integer("token_amount").notNull().default(0),
  stayDurationMonths: integer("stay_duration_months").notNull().default(11),
  noticePeriodMonths: integer("notice_period_months").notNull().default(1),
  upiId: text("upi_id"),
  adminPhone: text("admin_phone"),
  source: text("source").notNull().default("admin"),
  status: text("status").notNull().default("pending"),
  zoneId: integer("zone_id").references(() => zonesTable.id),
  assignedToId: integer("assigned_to_id").references(() => teammatesTable.id),
  notes: text("notes"),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  offerExpiresAt: true,
  status: true,
});

export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
