import { db, packagesTable, trackingEventsTable, type Package } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  getDemoHistory,
  getDemoPackage,
  getDemoPackages,
  isKnownTrackingId,
} from "./demo-packages.js";
import { getComputedLocation } from "./simulation.js";
import { logger } from "./logger.js";

function withLiveLocation<T extends Package>(pkg: T): T {
  const live = getComputedLocation(pkg.trackingId);
  if (!live) return pkg;

  return {
    ...pkg,
    currentLat: live.lat,
    currentLng: live.lng,
    progressPct: live.progressPct,
    currentLocationName: live.currentLocationName,
  };
}

export async function listPackages(): Promise<Package[]> {
  try {
    const packages = await db.select().from(packagesTable);
    if (packages.length > 0) {
      return packages.map(withLiveLocation);
    }
  } catch (err) {
    logger.warn({ err }, "Database unavailable for listPackages, using demo data");
  }

  return getDemoPackages();
}

export async function getPackageByTrackingId(
  trackingId: string,
): Promise<Package | null> {
  try {
    const [pkg] = await db
      .select()
      .from(packagesTable)
      .where(eq(packagesTable.trackingId, trackingId));

    if (pkg) {
      return withLiveLocation(pkg);
    }
  } catch (err) {
    logger.warn({ err, trackingId }, "Database unavailable for getPackage, using demo data");
  }

  return getDemoPackage(trackingId);
}

export async function getPackageHistory(trackingId: string) {
  if (!isKnownTrackingId(trackingId)) {
    return null;
  }

  try {
    const events = await db
      .select()
      .from(trackingEventsTable)
      .where(eq(trackingEventsTable.trackingId, trackingId))
      .orderBy(desc(trackingEventsTable.timestamp))
      .limit(50);

    if (events.length > 0) {
      return events.map((event) => ({
        ...event,
        timestamp: event.timestamp.toISOString(),
      }));
    }
  } catch (err) {
    logger.warn({ err, trackingId }, "Database unavailable for history, using demo data");
  }

  return getDemoHistory(trackingId);
}
