export type GlobeLayer = "satellite" | "street" | "hybrid";

export const LAYER_OPTIONS: GlobeLayer[] = ["satellite", "street", "hybrid"];

export interface RouteStop {
  name: string;
  lat: number;
  lng: number;
  done: boolean;
  active?: boolean;
  timestamp?: string | null;
}

export interface RouteData {
  waypoints: { lat: number; lng: number }[];
  stops: RouteStop[];
}

export interface GlobePath {
  coords: [number, number][];
  color: string;
  stroke?: number;
}

export interface GlobePoint {
  lat: number;
  lng: number;
  color: string;
  size: number;
  label: string;
  altitude?: number;
}

export const GLOBE_TEXTURES: Record<GlobeLayer, { label: string }> = {
  satellite: { label: "Satellite" },
  street: { label: "Street" },
  hybrid: { label: "Hybrid" },
};

export function buildRoutePaths(route: RouteData): GlobePath[] {
  const coords = route.waypoints.map((w) => [w.lat, w.lng] as [number, number]);
  if (coords.length < 2) return [];

  const paths: GlobePath[] = [
    {
      coords,
      color: "rgba(71, 85, 105, 0.85)",
      stroke: 0.35,
    },
  ];

  const activeIdx = route.stops.findIndex((s) => s.active || !s.done);
  const splitAt = activeIdx > 0 ? activeIdx : route.stops.length - 1;
  if (splitAt > 0) {
    const ratio = splitAt / Math.max(route.stops.length - 1, 1);
    const splitWpIdx = Math.max(Math.ceil(ratio * (coords.length - 1)), 1);
    paths.push({
      coords: coords.slice(0, splitWpIdx + 1),
      color: "rgba(56, 189, 248, 0.95)",
      stroke: 0.55,
    });
  }

  return paths;
}

export function buildStopPoints(route: RouteData): GlobePoint[] {
  return route.stops.map((stop, index) => {
    const isFirst = index === 0;
    const isLast = index === route.stops.length - 1;

    let color = "#475569";
    let size = 0.22;
    let label = stop.name;

    if (isFirst) {
      color = "#22c55e";
      size = 0.35;
      label = `Origin · ${stop.name}`;
    } else if (isLast) {
      color = "#f59e0b";
      size = 0.35;
      label = `Destination · ${stop.name}`;
    } else if (stop.done) {
      color = "#38bdf8";
      size = 0.28;
      label = `Completed · ${stop.name}`;
    } else if (stop.active) {
      color = "#a78bfa";
      size = 0.3;
      label = `Active · ${stop.name}`;
    } else {
      label = `Upcoming · ${stop.name}`;
    }

    if (stop.timestamp) {
      label += ` · ${stop.timestamp}`;
    }

    return {
      lat: stop.lat,
      lng: stop.lng,
      color,
      size,
      label,
      altitude: 0.012,
    };
  });
}

export function computeBearing(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const dLngRad = ((toLng - fromLng) * Math.PI) / 180;
  const lat1Rad = (fromLat * Math.PI) / 180;
  const lat2Rad = (toLat * Math.PI) / 180;
  const y = Math.sin(dLngRad) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLngRad);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

export function computeSpeedKmh(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  elapsedMs: number,
): number | null {
  if (elapsedMs <= 0) return null;

  const R = 6371;
  const dLatRad = ((toLat - fromLat) * Math.PI) / 180;
  const dLonRad = ((toLng - fromLng) * Math.PI) / 180;
  const a =
    Math.sin(dLatRad / 2) ** 2 +
    Math.cos((fromLat * Math.PI) / 180) *
      Math.cos((toLat * Math.PI) / 180) *
      Math.sin(dLonRad / 2) ** 2;
  const distKm = 2 * R * Math.asin(Math.sqrt(a));
  return Math.round(distKm / (elapsedMs / 3_600_000));
}

export function compassDirection(deg: number | null): string | null {
  if (deg === null) return null;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
}

export function routeBounds(route: RouteData): {
  lat: number;
  lng: number;
  altitude: number;
} {
  const lats = route.stops.map((s) => s.lat);
  const lngs = route.stops.map((s) => s.lng);
  const latSpan = Math.max(...lats) - Math.min(...lats);
  const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  const span = Math.max(latSpan, lngSpan);

  return {
    lat: (Math.max(...lats) + Math.min(...lats)) / 2,
    lng: (Math.max(...lngs) + Math.min(...lngs)) / 2,
    altitude: Math.min(Math.max(span * 0.9 + 0.8, 1.4), 3.2),
  };
}
