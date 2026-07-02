import { pgTable, text, serial, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const packagesTable = pgTable("packages", {
  trackingId: text("tracking_id").primaryKey(),
  status: text("status").notNull().default("In Transit"),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  carrier: text("carrier").notNull(),
  estimatedDelivery: text("estimated_delivery").notNull(),
  currentLat: real("current_lat").notNull(),
  currentLng: real("current_lng").notNull(),
  progressPct: real("progress_pct").notNull().default(0),
  currentLocationName: text("current_location_name").notNull().default(""),
  weightLbs: real("weight_lbs").notNull().default(1.0),
  signatureRequired: boolean("signature_required").notNull().default(false),
});

export const trackingEventsTable = pgTable("tracking_events", {
  id: serial("id").primaryKey(),
  trackingId: text("tracking_id").notNull(),
  message: text("message").notNull(),
  location: text("location").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertPackageSchema = createInsertSchema(packagesTable);
export const insertTrackingEventSchema = createInsertSchema(trackingEventsTable).omit({ id: true });

export type Package = typeof packagesTable.$inferSelect;
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type TrackingEvent = typeof trackingEventsTable.$inferSelect;
export type InsertTrackingEvent = z.infer<typeof insertTrackingEventSchema>;
