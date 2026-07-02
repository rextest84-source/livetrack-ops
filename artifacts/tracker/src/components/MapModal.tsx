import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, Crosshair, Layers, Navigation } from "lucide-react";

interface Stop {
  name: string;
  lat: number;
  lng: number;
  done: boolean;
  active?: boolean;
  timestamp?: string;
}

interface MapModalProps {
  trackingId: string;
  currentLat: number;
  currentLng: number;
  locationName: string;
  progressPct: number;
  route?: {
    waypoints: { lat: number; lng: number }[];
    stops: Stop[];
  };
  onClose: () => void;
}

const TILE_LAYERS = {
  dark: {
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    subdomains: "abcd",
  },
  light: {
    label: "Street",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    subdomains: "abcd",
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    subdomains: "",
  },
};

const LIVE_MARKER_HTML = `
  <div style="position:relative;width:56px;height:56px;display:flex;align-items:center;justify-content:center;">
    <div style="position:absolute;width:56px;height:56px;border-radius:50%;background:rgba(56,189,248,0.2);animation:pulse-ring 2s ease-out infinite;"></div>
    <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(56,189,248,0.15);animation:pulse-ring 2s ease-out infinite 0.6s;"></div>
    <div style="font-size:30px;line-height:1;filter:drop-shadow(0 2px 12px rgba(56,189,248,0.8));animation:bounce-marker 2.5s ease-in-out infinite;">📬</div>
  </div>
`;

const ORIGIN_HTML = `<div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 0 10px rgba(34,197,94,0.7);"></div>`;
const DEST_HTML = `<div style="width:16px;height:16px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 0 10px rgba(245,158,11,0.7);"></div>`;
const STOP_DONE_HTML = `<div style="width:10px;height:10px;border-radius:50%;background:#38bdf8;border:2px solid rgba(255,255,255,0.5);"></div>`;
const STOP_PENDING_HTML = `<div style="width:10px;height:10px;border-radius:50%;background:#475569;border:2px solid #64748b;"></div>`;

function makeDivIcon(html: string, size: [number, number], anchor: [number, number]) {
  return L.divIcon({ className: "", html, iconSize: size, iconAnchor: anchor });
}

export function MapModal({ trackingId, currentLat, currentLng, locationName, progressPct, route, onClose }: MapModalProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const rafRef = useRef<number | null>(null);
  const currentPosRef = useRef({ lat: currentLat, lng: currentLng });
  const prevPosRef = useRef({ lat: currentLat, lng: currentLng });
  const lastMoveTimeRef = useRef<number>(Date.now());

  const [activeLayer, setActiveLayer] = useState<keyof typeof TILE_LAYERS>("dark");
  const [coords, setCoords] = useState({ lat: currentLat, lng: currentLng });
  const [speed, setSpeed] = useState<number | null>(null);
  const [bearing, setBearing] = useState<number | null>(null);

  // Init map
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: [currentLat, currentLng],
      zoom: 7,
      zoomControl: false,
    });

    // Custom zoom control bottom-right
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Scale bar
    L.control.scale({ position: "bottomleft", imperial: true, metric: true }).addTo(map);

    // Attribution
    map.attributionControl.setPosition("bottomleft");

    // Tile layer
    const layer = TILE_LAYERS.dark;
    const tile = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: 19,
      subdomains: layer.subdomains || "abc",
    }).addTo(map);
    tileRef.current = tile;

    // Live package marker
    const liveMarker = L.marker([currentLat, currentLng], {
      icon: makeDivIcon(LIVE_MARKER_HTML, [56, 56], [28, 28]),
      zIndexOffset: 1000,
    }).addTo(map);
    liveMarker.bindPopup(`
      <div style="font-family:monospace;min-width:160px;">
        <div style="font-weight:bold;color:#38bdf8;font-size:13px;">${trackingId}</div>
        <div style="color:#94a3b8;font-size:11px;margin-top:4px;">${locationName}</div>
        <div style="color:#22c55e;font-size:11px;margin-top:2px;">Progress: ${Math.round(progressPct)}%</div>
      </div>
    `);

    markerRef.current = liveMarker;
    mapRef.current = map;
    currentPosRef.current = { lat: currentLat, lng: currentLng };
    prevPosRef.current = { lat: currentLat, lng: currentLng };

    // Draw route
    if (route && route.waypoints.length >= 2) {
      const waypoints = route.waypoints.map((w) => [w.lat, w.lng] as [number, number]);
      L.polyline(waypoints, { color: "#334155", weight: 3, opacity: 0.7, dashArray: "8,8" }).addTo(map);

      const activeIdx = route.stops.findIndex((s) => s.active || !s.done);
      if (activeIdx > 0) {
        const ratio = activeIdx / (route.stops.length - 1);
        const splitIdx = Math.ceil(ratio * waypoints.length);
        const completed = waypoints.slice(0, Math.max(splitIdx, 2));
        if (completed.length >= 2) {
          L.polyline(completed, { color: "#38bdf8", weight: 4, opacity: 0.95 }).addTo(map);
        }
      }

      route.stops.forEach((stop, i) => {
        const isFirst = i === 0;
        const isLast = i === route.stops.length - 1;
        const html = isFirst ? ORIGIN_HTML : isLast ? DEST_HTML : stop.done ? STOP_DONE_HTML : STOP_PENDING_HTML;
        const size: [number, number] = isFirst || isLast ? [16, 16] : [10, 10];
        const m = L.marker([stop.lat, stop.lng], {
          icon: makeDivIcon(html, size, [size[0] / 2, size[1] / 2]),
        }).addTo(map);

        const badge = isFirst ? "🟢 Origin" : isLast ? "🟡 Destination" : stop.done ? "✅ Completed" : "⏳ Upcoming";
        m.bindPopup(`
          <div style="font-family:monospace;min-width:140px;">
            <div style="font-size:11px;color:#94a3b8;">${badge}</div>
            <div style="font-weight:bold;font-size:13px;margin-top:2px;">${stop.name}</div>
            ${stop.timestamp ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">${new Date(stop.timestamp).toLocaleString()}</div>` : ""}
          </div>
        `);
      });

      // Fit to route bounds
      const allPts = route.stops.map((s) => L.latLng(s.lat, s.lng));
      if (allPts.length >= 2) {
        map.fitBounds(L.latLngBounds(allPts), { padding: [60, 60] });
      }
    }

    // Mouse coordinate tracker
    map.on("mousemove", (e) => {
      setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate marker to new position + compute speed/bearing
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const fromLat = currentPosRef.current.lat;
    const fromLng = currentPosRef.current.lng;
    const toLat = currentLat;
    const toLng = currentLng;

    if (fromLat === toLat && fromLng === toLng) return;

    // Compute bearing
    const dLng = ((toLng - fromLng) * Math.PI) / 180;
    const lat1 = (fromLat * Math.PI) / 180;
    const lat2 = (toLat * Math.PI) / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    setBearing(Math.round(deg));

    // Compute speed (km/h) using Haversine
    const R = 6371;
    const dLat = ((toLat - fromLat) * Math.PI) / 180;
    const dLon = ((toLng - fromLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((fromLat * Math.PI) / 180) * Math.cos((toLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const distKm = 2 * R * Math.asin(Math.sqrt(a));
    const elapsedHrs = (Date.now() - lastMoveTimeRef.current) / 3_600_000;
    if (elapsedHrs > 0) setSpeed(Math.round(distKm / elapsedHrs));
    lastMoveTimeRef.current = Date.now();

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
      setCoords({ lat, lng });

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        currentPosRef.current = { lat: toLat, lng: toLng };
        // Auto-pan if out of view
        const map = mapRef.current;
        if (map && !map.getBounds().contains([toLat, toLng])) {
          map.panTo([toLat, toLng], { animate: true, duration: 1.2 });
        }
        // Update popup content
        marker.setPopupContent(`
          <div style="font-family:monospace;min-width:160px;">
            <div style="font-weight:bold;color:#38bdf8;font-size:13px;">${trackingId}</div>
            <div style="color:#94a3b8;font-size:11px;margin-top:4px;">${locationName}</div>
            <div style="color:#22c55e;font-size:11px;margin-top:2px;">Progress: ${Math.round(progressPct)}%</div>
          </div>
        `);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  }, [currentLat, currentLng, locationName, progressPct, trackingId]);

  // Switch tile layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tileRef.current) return;
    map.removeLayer(tileRef.current);
    const layer = TILE_LAYERS[activeLayer];
    const tile = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: 19,
      subdomains: layer.subdomains || "abc",
    }).addTo(map);
    tile.setZIndex(0);
    tileRef.current = tile;
    markerRef.current?.setZIndexOffset(1000);
  }, [activeLayer]);

  // Center on package
  const centerOnPackage = () => {
    mapRef.current?.flyTo([currentPosRef.current.lat, currentPosRef.current.lng], 10, { duration: 1.5 });
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const compassDir = (deg: number | null) => {
    if (deg === null) return "—";
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[Math.round(deg / 45) % 8];
  };

  return (
    /*
     * Root: fixed full-screen, creates its own stacking context via z-[50].
     * The map div and the UI overlay div are siblings.
     * UI overlay uses zIndex 1000 in inline style — well above Leaflet's
     * internal ceiling (~700 for popups) so it never gets buried during
     * zoom/pan repaints. Tailwind z-classes (z-20 = 20) were being overridden
     * by Leaflet's pane z-indexes during CSS-transform repaints.
     */
    <div className="fixed inset-0 font-mono" style={{ zIndex: 50 }}>

      {/* Map fills everything — Leaflet mounts here */}
      <div ref={mapDivRef} className="absolute inset-0" />

      {/* UI overlay — isolated above all Leaflet layers, pointer-events off by default */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 1000 }}
      >
        {/* ── Top bar ── */}
        <div className="absolute top-0 left-0 right-0 pointer-events-auto flex items-center justify-between px-4 py-3 bg-background/90 backdrop-blur-md border-b border-primary/20">
          <div className="flex items-center gap-3">
            <span className="text-primary font-bold text-sm tracking-widest uppercase">Live Map</span>
            <span className="text-muted-foreground text-xs">—</span>
            <span className="text-foreground text-xs font-bold uppercase">{trackingId}</span>
            <span className="hidden sm:flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
              LIVE
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Layer switcher */}
            <div className="flex items-center gap-0 bg-card/90 border border-primary/20 rounded-md overflow-hidden">
              <Layers className="w-3.5 h-3.5 text-muted-foreground mx-2 shrink-0" />
              {(Object.keys(TILE_LAYERS) as (keyof typeof TILE_LAYERS)[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveLayer(key)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase transition-colors ${
                    activeLayer === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-primary/10"
                  }`}
                >
                  {TILE_LAYERS[key].label}
                </button>
              ))}
            </div>

            {/* Center on package */}
            <button
              onClick={centerOnPackage}
              className="flex items-center gap-1.5 bg-card/90 border border-primary/20 hover:border-primary/60 text-foreground px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-colors"
            >
              <Crosshair className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">Center</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 bg-card/90 border border-primary/20 hover:border-red-500/60 text-foreground px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>

        {/* ── Bottom HUD ── */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-stretch gap-2">
          <div className="bg-background/90 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-2 flex items-center gap-4 shadow-xl">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs uppercase">Lat</span>
              <span className="text-primary text-xs font-bold tabular-nums">{coords.lat.toFixed(5)}</span>
            </div>
            <div className="w-px h-4 bg-primary/20" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs uppercase">Lng</span>
              <span className="text-primary text-xs font-bold tabular-nums">{coords.lng.toFixed(5)}</span>
            </div>
          </div>

          <div className="bg-background/90 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-2 flex items-center gap-4 shadow-xl">
            <div className="flex items-center gap-2">
              <Navigation
                className="w-3.5 h-3.5 text-primary transition-transform duration-500"
                style={bearing !== null ? { transform: `rotate(${bearing}deg)` } : {}}
              />
              <span className="text-foreground text-xs font-bold">{compassDir(bearing)}</span>
            </div>
            <div className="w-px h-4 bg-primary/20" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs uppercase">Speed</span>
              <span className="text-primary text-xs font-bold tabular-nums">
                {speed !== null ? `${speed} km/h` : "—"}
              </span>
            </div>
          </div>

          <div className="bg-background/90 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-2 flex items-center gap-3 shadow-xl">
            <span className="text-muted-foreground text-xs uppercase">Progress</span>
            <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-1000"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-primary text-xs font-bold tabular-nums">{Math.round(progressPct)}%</span>
          </div>
        </div>

        {/* ── Legend ── */}
        <div className="absolute bottom-8 right-4 bg-background/90 backdrop-blur-md border border-primary/20 rounded-lg px-3 py-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-0.5 bg-[#38bdf8] rounded" />
              <span className="text-xs text-muted-foreground">Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 border-t border-dashed border-[#475569]" />
              <span className="text-xs text-muted-foreground">Upcoming</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
              <span className="text-xs text-muted-foreground">Origin</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
              <span className="text-xs text-muted-foreground">Destination</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
