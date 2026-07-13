import { getComputedLocation } from "./simulation.js";
import type { Package } from "@workspace/db";

const DEMO_PACKAGES = [
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

const DEMO_HISTORY: Record<
  string,
  Array<{ id: number; trackingId: string; message: string; location: string; timestamp: string }>
> = {
  "LT-2024-881923": [
    {
      id: 1,
      trackingId: "LT-2024-881923",
      message: "Departed Los Angeles distribution center",
      location: "Los Angeles, CA",
      timestamp: "2024-06-30T16:00:00.000Z",
    },
    {
      id: 2,
      trackingId: "LT-2024-881923",
      message: "Arrived at Las Vegas sorting facility",
      location: "Las Vegas, NV",
      timestamp: "2024-06-30T21:30:00.000Z",
    },
    {
      id: 3,
      trackingId: "LT-2024-881923",
      message: "In transit to Denver, CO",
      location: "Salt Lake City, UT",
      timestamp: "2024-07-01T03:00:00.000Z",
    },
  ],
  "LT-2024-443712": [
    {
      id: 4,
      trackingId: "LT-2024-443712",
      message: "Package scanned at New York hub",
      location: "New York, NY",
      timestamp: "2024-07-01T12:00:00.000Z",
    },
    {
      id: 5,
      trackingId: "LT-2024-443712",
      message: "En route to Baltimore, MD",
      location: "Philadelphia, PA",
      timestamp: "2024-07-01T15:30:00.000Z",
    },
  ],
  "LT-2024-991047": [
    {
      id: 6,
      trackingId: "LT-2024-991047",
      message: "Departed Seattle terminal",
      location: "Seattle, WA",
      timestamp: "2024-07-01T13:00:00.000Z",
    },
    {
      id: 7,
      trackingId: "LT-2024-991047",
      message: "Arrived Portland sorting facility",
      location: "Portland, OR",
      timestamp: "2024-07-01T18:00:00.000Z",
    },
  ],
};

function toLivePackage(base: (typeof DEMO_PACKAGES)[number]): Package {
  const live = getComputedLocation(base.trackingId);
  return {
    ...base,
    currentLat: live?.lat ?? 0,
    currentLng: live?.lng ?? 0,
    progressPct: live?.progressPct ?? 0,
    currentLocationName: live?.currentLocationName ?? "In Transit",
  };
}

export function getDemoPackages(): Package[] {
  return DEMO_PACKAGES.map(toLivePackage);
}

export function getDemoPackage(trackingId: string): Package | null {
  const base = DEMO_PACKAGES.find((pkg) => pkg.trackingId === trackingId);
  return base ? toLivePackage(base) : null;
}

export function getDemoHistory(trackingId: string) {
  return DEMO_HISTORY[trackingId] ?? [];
}

export function isKnownTrackingId(trackingId: string): boolean {
  return DEMO_PACKAGES.some((pkg) => pkg.trackingId === trackingId);
}
