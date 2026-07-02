import { db, packagesTable, trackingEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { broadcastToPackage, broadcastViewers } from "./sse.js";
import { logger } from "./logger.js";

interface Waypoint {
  lat: number;
  lng: number;
}

interface Stop {
  name: string;
  lat: number;
  lng: number;
  done: boolean;
  active: boolean;
  timestamp: string | null;
}

interface RouteData {
  waypoints: Waypoint[];
  stops: Stop[];
}

const ROUTES: Record<string, RouteData> = {
  "LT-2024-881923": {
    waypoints: [
      { lat: 34.0522, lng: -118.2437 },
      { lat: 34.8, lng: -116.5 },
      { lat: 35.5, lng: -115.8 },
      { lat: 36.1699, lng: -115.1398 },
      { lat: 37.1, lng: -114.0 },
      { lat: 38.2, lng: -113.0 },
      { lat: 39.3, lng: -112.1 },
      { lat: 40.7608, lng: -111.891 },
      { lat: 40.5, lng: -110.0 },
      { lat: 40.2, lng: -108.0 },
      { lat: 39.9, lng: -106.5 },
      { lat: 39.7392, lng: -104.9903 },
      { lat: 39.5, lng: -102.5 },
      { lat: 39.3, lng: -100.5 },
      { lat: 39.1, lng: -98.0 },
      { lat: 39.0997, lng: -94.5786 },
      { lat: 39.5, lng: -92.0 },
      { lat: 40.2, lng: -90.5 },
      { lat: 40.8, lng: -89.0 },
      { lat: 41.8781, lng: -87.6298 },
    ],
    stops: [
      { name: "Los Angeles, CA", lat: 34.0522, lng: -118.2437, done: true, active: false, timestamp: "Jun 30, 9:00 AM" },
      { name: "Las Vegas, NV", lat: 36.1699, lng: -115.1398, done: true, active: false, timestamp: "Jun 30, 2:30 PM" },
      { name: "Salt Lake City, UT", lat: 40.7608, lng: -111.891, done: true, active: false, timestamp: "Jun 30, 8:00 PM" },
      { name: "Denver, CO", lat: 39.7392, lng: -104.9903, done: false, active: true, timestamp: null },
      { name: "Kansas City, MO", lat: 39.0997, lng: -94.5786, done: false, active: false, timestamp: null },
      { name: "Chicago, IL", lat: 41.8781, lng: -87.6298, done: false, active: false, timestamp: null },
    ],
  },
  "LT-2024-443712": {
    waypoints: [
      { lat: 40.7128, lng: -74.006 },
      { lat: 40.5, lng: -75.5 },
      { lat: 40.0, lng: -76.5 },
      { lat: 39.9526, lng: -75.1652 },
      { lat: 39.5, lng: -76.0 },
      { lat: 39.2904, lng: -76.6122 },
      { lat: 38.9, lng: -77.2 },
      { lat: 38.9072, lng: -77.0369 },
      { lat: 38.5, lng: -77.5 },
      { lat: 37.8, lng: -78.0 },
      { lat: 37.5407, lng: -77.436 },
    ],
    stops: [
      { name: "New York, NY", lat: 40.7128, lng: -74.006, done: true, active: false, timestamp: "Jul 1, 7:00 AM" },
      { name: "Philadelphia, PA", lat: 39.9526, lng: -75.1652, done: true, active: false, timestamp: "Jul 1, 10:30 AM" },
      { name: "Baltimore, MD", lat: 39.2904, lng: -76.6122, done: false, active: true, timestamp: null },
      { name: "Washington D.C.", lat: 38.9072, lng: -77.0369, done: false, active: false, timestamp: null },
      { name: "Richmond, VA", lat: 37.5407, lng: -77.436, done: false, active: false, timestamp: null },
    ],
  },
  "LT-2024-991047": {
    waypoints: [
      { lat: 47.6062, lng: -122.3321 },
      { lat: 46.5, lng: -121.8 },
      { lat: 45.8, lng: -121.5 },
      { lat: 45.5231, lng: -122.6765 },
      { lat: 44.5, lng: -123.0 },
      { lat: 44.0582, lng: -121.3153 },
      { lat: 43.5, lng: -122.0 },
      { lat: 42.8711, lng: -122.0 },
      { lat: 42.3265, lng: -122.8756 },
      { lat: 42.0, lng: -122.5 },
      { lat: 41.8587, lng: -122.4727 },
      { lat: 41.0, lng: -122.0 },
      { lat: 40.5865, lng: -122.3917 },
      { lat: 39.5, lng: -121.5 },
      { lat: 38.5816, lng: -121.4944 },
    ],
    stops: [
      { name: "Seattle, WA", lat: 47.6062, lng: -122.3321, done: true, active: false, timestamp: "Jul 1, 6:00 AM" },
      { name: "Portland, OR", lat: 45.5231, lng: -122.6765, done: true, active: false, timestamp: "Jul 1, 11:00 AM" },
      { name: "Eugene, OR", lat: 44.0582, lng: -121.3153, done: false, active: true, timestamp: null },
      { name: "Medford, OR", lat: 42.3265, lng: -122.8756, done: false, active: false, timestamp: null },
      { name: "Redding, CA", lat: 40.5865, lng: -122.3917, done: false, active: false, timestamp: null },
      { name: "Sacramento, CA", lat: 38.5816, lng: -121.4944, done: false, active: false, timestamp: null },
    ],
  },
};

// In-memory simulation state
interface SimState {
  waypointIdx: number;
  progress: number; // 0→1 between waypointIdx and waypointIdx+1
}

const simStates: Record<string, SimState> = {
  "LT-2024-881923": { waypointIdx: 11, progress: 0.0 },
  "LT-2024-443712": { waypointIdx: 4, progress: 0.0 },
  "LT-2024-991047": { waypointIdx: 5, progress: 0.0 },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function computeProgress(route: RouteData, state: SimState): number {
  const total = route.waypoints.length - 1;
  return Math.min(((state.waypointIdx + state.progress) / total) * 100, 99);
}

function nearestStopName(route: RouteData, lat: number, lng: number): string {
  // Find active stop or the next undone stop
  const active = route.stops.find((s) => s.active);
  if (active) return `Approaching ${active.name}`;
  const next = route.stops.find((s) => !s.done);
  return next ? `En route to ${next.name}` : "Arriving soon";
}

export function getRouteData(trackingId: string): RouteData | null {
  return ROUTES[trackingId] ?? null;
}

export function getAllTrackingIds(): string[] {
  return Object.keys(ROUTES);
}

const STEP = 0.004; // per-tick interpolation step

export function startSimulation(): void {
  setInterval(async () => {
    for (const [trackingId, state] of Object.entries(simStates)) {
      const route = ROUTES[trackingId];
      if (!route) continue;

      const maxIdx = route.waypoints.length - 2;
      if (state.waypointIdx >= maxIdx && state.progress >= 1) continue;

      state.progress += STEP;
      if (state.progress >= 1) {
        state.progress = 0;
        state.waypointIdx = Math.min(state.waypointIdx + 1, maxIdx);
      }

      const from = route.waypoints[state.waypointIdx];
      const to = route.waypoints[Math.min(state.waypointIdx + 1, maxIdx)];
      const lat = lerp(from.lat, to.lat, state.progress);
      const lng = lerp(from.lng, to.lng, state.progress);
      const progressPct = computeProgress(route, state);
      const currentLocationName = nearestStopName(route, lat, lng);

      try {
        await db
          .update(packagesTable)
          .set({ currentLat: lat, currentLng: lng, progressPct, currentLocationName })
          .where(eq(packagesTable.trackingId, trackingId));
      } catch {
        // DB may not be ready yet during startup
      }

      broadcastToPackage(trackingId, "location", {
        lat,
        lng,
        progressPct,
        currentLocationName,
      });

      // Occasionally emit a tracking event
      if (Math.random() < 0.015) {
        const msgs = [
          "Package scanned at sorting facility",
          "Departed distribution center",
          "Package loaded onto vehicle",
          "In transit to next facility",
          "Package handled with care",
        ];
        const msg = msgs[Math.floor(Math.random() * msgs.length)];
        const ts = new Date().toISOString();
        try {
          await db.insert(trackingEventsTable).values({
            trackingId,
            message: msg,
            location: currentLocationName,
            timestamp: new Date(),
          });
        } catch {
          // ignore
        }
        broadcastToPackage(trackingId, "event", {
          id: Date.now(),
          trackingId,
          message: msg,
          location: currentLocationName,
          timestamp: ts,
        });
      }
    }
  }, 1500);

  // Broadcast viewer counts every 10 seconds (heartbeat)
  setInterval(() => {
    for (const trackingId of Object.keys(ROUTES)) {
      broadcastViewers(trackingId);
    }
  }, 10000);

  logger.info("Package simulation started");
}
