import { getAllTrackingIds } from "./simulation.js";
import { getDemoPackages } from "./demo-packages.js";
import { logger } from "./logger.js";

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedPackages().catch((err) => {
      seedPromise = null;
      logger.warn({ err }, "Database seed skipped");
    });
  }
  return seedPromise;
}

async function seedPackages(): Promise<void> {
  const { db, packagesTable } = await import("@workspace/db");

  const existing = await db.select({ trackingId: packagesTable.trackingId }).from(packagesTable);
  const existingIds = new Set(existing.map((row) => row.trackingId));

  for (const pkg of getDemoPackages()) {
    if (existingIds.has(pkg.trackingId)) continue;

    await db.insert(packagesTable).values({
      trackingId: pkg.trackingId,
      status: pkg.status,
      origin: pkg.origin,
      destination: pkg.destination,
      carrier: pkg.carrier,
      estimatedDelivery: pkg.estimatedDelivery,
      weightLbs: pkg.weightLbs,
      signatureRequired: pkg.signatureRequired,
      currentLat: pkg.currentLat,
      currentLng: pkg.currentLng,
      progressPct: pkg.progressPct,
      currentLocationName: pkg.currentLocationName,
    });
  }

  logger.info({ count: getAllTrackingIds().length }, "Package seed data ensured");
}
