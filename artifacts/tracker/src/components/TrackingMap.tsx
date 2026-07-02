import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface TrackingMapProps {
  currentLat: number;
  currentLng: number;
  route?: {
    waypoints: { lat: number; lng: number }[];
    stops: { name: string; lat: number; lng: number; done: boolean; active?: boolean }[];
  };
}

const CARTO_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTR = '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

const MARKER_HTML = `
  <div style="position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;">
    <div style="
      position:absolute;
      width:48px;height:48px;
      border-radius:50%;
      background:rgba(56,189,248,0.25);
      animation:pulse-ring 2s ease-out infinite;
    "></div>
    <div style="
      position:absolute;
      width:28px;height:28px;
      border-radius:50%;
      background:rgba(56,189,248,0.15);
      animation:pulse-ring 2s ease-out infinite 0.5s;
    "></div>
    <div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 8px rgba(56,189,248,0.6));animation:bounce-marker 2s ease-in-out infinite;">📬</div>
  </div>
`;

const ORIGIN_HTML = `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-shadow:0 0 8px rgba(34,197,94,0.6);"></div>`;
const DEST_HTML = `<div style="width:14px;height:14px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 0 8px rgba(245,158,11,0.6);"></div>`;
const STOP_DONE_HTML = `<div style="width:10px;height:10px;border-radius:50%;background:#38bdf8;border:2px solid rgba(255,255,255,0.4);"></div>`;
const STOP_PENDING_HTML = `<div style="width:10px;height:10px;border-radius:50%;background:#334155;border:2px solid #475569;"></div>`;

function makeDivIcon(html: string, size: [number, number], anchor: [number, number]) {
  return L.divIcon({ className: "", html, iconSize: size, iconAnchor: anchor });
}

export function TrackingMap({ currentLat, currentLng, route }: TrackingMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const rafRef = useRef<number | null>(null);
  const currentPosRef = useRef({ lat: currentLat, lng: currentLng });

  // Initialize map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: [currentLat, currentLng],
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(CARTO_DARK, { attribution: CARTO_ATTR, maxZoom: 19, subdomains: "abcd" }).addTo(map);

    const liveMarker = L.marker([currentLat, currentLng], {
      icon: makeDivIcon(MARKER_HTML, [48, 48], [24, 24]),
      zIndexOffset: 1000,
    }).addTo(map);

    markerRef.current = liveMarker;
    mapRef.current = map;
    currentPosRef.current = { lat: currentLat, lng: currentLng };

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw route when it loads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || route.waypoints.length < 2) return;

    const waypoints = route.waypoints.map((w) => [w.lat, w.lng] as [number, number]);

    // Full route — dashed muted
    L.polyline(waypoints, { color: "#334155", weight: 3, opacity: 0.7, dashArray: "8,8" }).addTo(map);

    // Completed portion — solid accent (up to the first active/incomplete stop)
    const activeIdx = route.stops.findIndex((s) => s.active || !s.done);
    if (activeIdx > 0) {
      const completedWps = waypoints.slice(0, Math.ceil((activeIdx / (route.stops.length - 1)) * waypoints.length));
      if (completedWps.length >= 2) {
        L.polyline(completedWps, { color: "#38bdf8", weight: 4, opacity: 0.9 }).addTo(map);
      }
    }

    // Stop markers
    route.stops.forEach((stop, i) => {
      const isFirst = i === 0;
      const isLast = i === route.stops.length - 1;
      const html = isFirst ? ORIGIN_HTML : isLast ? DEST_HTML : stop.done ? STOP_DONE_HTML : STOP_PENDING_HTML;
      const size: [number, number] = isFirst || isLast ? [14, 14] : [10, 10];
      const marker = L.marker([stop.lat, stop.lng], {
        icon: makeDivIcon(html, size, [size[0] / 2, size[1] / 2]),
      }).addTo(map);
      marker.bindTooltip(`<strong>${stop.name}</strong>${stop.timestamp ? "<br>" + stop.timestamp : ""}`, {
        direction: "top",
        className: "leaflet-dark-tooltip",
      });
    });

    // Fit bounds with padding
    const allPoints = route.stops.map((s) => L.latLng(s.lat, s.lng));
    if (allPoints.length >= 2) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40] });
    }
  }, [route]);

  // Animate marker to new position
  useEffect(() => {
    const marker = markerRef.current;
    const map = mapRef.current;
    if (!marker || !map) return;

    const fromLat = currentPosRef.current.lat;
    const fromLng = currentPosRef.current.lng;
    const toLat = currentLat;
    const toLng = currentLng;

    if (fromLat === toLat && fromLng === toLng) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const startTime = performance.now();
    const duration = 1200;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = easeOutCubic(t);
      const lat = fromLat + (toLat - fromLat) * ease;
      const lng = fromLng + (toLng - fromLng) * ease;
      marker.setLatLng([lat, lng]);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        currentPosRef.current = { lat: toLat, lng: toLng };
        // Pan if out of view
        if (!map.getBounds().contains([toLat, toLng])) {
          map.panTo([toLat, toLng], { animate: true, duration: 1.0 });
        }
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  }, [currentLat, currentLng]);

  return (
    <div ref={mapDivRef} className="w-full h-full" style={{ background: "#0f172a" }} />
  );
}
