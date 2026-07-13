import { db, packagesTable } from "@workspace/db";
import { getComputedLocation, getAllTrackingIds } from "./simulation.js";
import { logger } from "./logger.js";

const SEED_PACKAGES = [
  {
    trackingId: "LT-2024-881923",
    status: "In Transit",
    origin: "Los Angeles, CA",
    destination: "Chicago, IL",
    carrier: "LiveTrack Express",
    estimatedDelivery: "2024-07-05T18:00:00.000Z",
    weightLbs: 42.5,
    signatureRequired: true,
  },
  {
    trackingId: "LT-2024-443712",
    status: "In Transit",
    origin: "New York, NY",
    destination: "Richmond, VA",
    carrier: "LiveTrack Express",
    estimatedDelivery: "2024-07-04T14:00:00.000Z",
    weightLbs: 18.2,
    signatureRequired: false,
  },
  {
    trackingId: "LT-2024-991047",
    status: "In Transit",
    origin: "Seattle, WA",
    destination: "Sacramento, CA",
    carrier: "LiveTrack Express",
    estimatedDelivery: "2024-07-06T12:00:00.000Z",
    weightLbs: 27.0,
    signatureRequired: true,
  },
] as const;

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedPackages().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function seedPackages(): Promise<void> {
  const existing = await db.select({ trackingId: packagesTable.trackingId }).from(packagesTable);
  const existingIds = new Set(existing.map((row) => row.trackingId));

  for (const pkg of SEED_PACKAGES) {
    if (existingIds.has(pkg.trackingId)) continue;

    const location = getComputedLocation(pkg.trackingId);
    if (!location) continue;

    await db.insert(packagesTable).values({
      ...pkg,
      currentLat: location.lat,
      currentLng: location.lng,
      progressPct: location.progressPct,
      currentLocationName: location.currentLocationName,
    });
  }

  logger.info({ count: getAllTrackingIds().length }, "Package seed data ensured");
}
