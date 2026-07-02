import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, Crosshair, Layers, Navigation, BookOpen } from "lucide-react";

interface Stop {
  name: string;
  lat: number;
  lng: number;
  done: boolean;
  active?: boolean;
  timestamp?: string | null;
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
    <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(56,189,248,0.12);animation:pulse-ring 2s ease-out infinite 0.6s;"></div>
    <div style="font-size:30px;line-height:1;filter:drop-shadow(0 2px 12px rgba(56,189,248,0.8));animation:bounce-marker 2.5s ease-in-out infinite;">📬</div>
  </div>
`;

function originIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 0 12px rgba(34,197,94,0.8);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function destIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 0 12px rgba(245,158,11,0.8);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function stopDoneIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:13px;height:13px;border-radius:50%;background:#38bdf8;border:2px solid rgba(255,255,255,0.7);box-shadow:0 0 6px rgba(56,189,248,0.5);"></div>`,
    iconSize: [13, 13],
    iconAnchor: [6, 6],
  });
}

function stopPendingIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:13px;height:13px;border-radius:50%;background:#475569;border:2px solid #64748b;"></div>`,
    iconSize: [13, 13],
    iconAnchor: [6, 6],
  });
}

function liveIcon() {
  return L.divIcon({
    className: "",
    html: LIVE_MARKER_HTML,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
}

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "";
  // ts is like "Jun 30, 9:00 AM" — already human readable, just return it
  return ts;
}

export function MapModal({ trackingId, currentLat, currentLng, locationName, progressPct, route, onClose }: MapModalProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const rafRef = useRef<number | null>(null);
  const routeLayersRef = useRef<L.Layer[]>([]);
  const currentPosRef = useRef({ lat: currentLat, lng: currentLng });
  const lastMoveTimeRef = useRef<number>(Date.now());

  const [activeLayer, setActiveLayer] = useState<keyof typeof TILE_LAYERS>("dark");
  const [coords, setCoords] = useState({ lat: currentLat, lng: currentLng });
  const [speed, setSpeed] = useState<number | null>(null);
  const [bearing, setBearing] = useState<number | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  // ── 1. Init map (once) — only creates the map instance and live marker ──
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: [currentLat, currentLng],
      zoom: 5,
      zoomControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: true, metric: true }).addTo(map);
    map.attributionControl.setPosition("bottomleft");

    const layer = TILE_LAYERS.dark;
    const tile = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: 19,
      subdomains: layer.subdomains || "abc",
    }).addTo(map);
    tileRef.current = tile;

    const liveMarker = L.marker([currentLat, currentLng], {
      icon: liveIcon(),
      zIndexOffset: 1000,
    }).addTo(map);

    liveMarker.bindPopup(buildPackagePopup(trackingId, locationName, progressPct));
    markerRef.current = liveMarker;
    mapRef.current = map;
    currentPosRef.current = { lat: currentLat, lng: currentLng };

    map.on("mousemove", (e) => {
      setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      tileRef.current = null;
      routeLayersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Draw route reactively — runs whenever route data arrives or changes ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || route.waypoints.length < 2) return;

    // Clear any previously drawn route layers
    routeLayersRef.current.forEach((l) => map.removeLayer(l));
    routeLayersRef.current = [];

    const waypoints = route.waypoints.map((w) => [w.lat, w.lng] as [number, number]);

    // Full route — dashed muted
    const fullRoute = L.polyline(waypoints, {
      color: "#334155",
      weight: 3,
      opacity: 0.75,
      dashArray: "8,8",
    }).addTo(map);
    routeLayersRef.current.push(fullRoute);

    // Completed portion — solid cyan, up to first active/undone stop
    const activeIdx = route.stops.findIndex((s) => s.active || !s.done);
    const splitAt = activeIdx > 0 ? activeIdx : route.stops.length - 1;
    const ratio = splitAt / (route.stops.length - 1);
    const splitWpIdx = Math.max(Math.ceil(ratio * (waypoints.length - 1)), 2);
    if (splitAt > 0) {
      const completedWps = waypoints.slice(0, splitWpIdx + 1);
      const completedRoute = L.polyline(completedWps, {
        color: "#38bdf8",
        weight: 5,
        opacity: 0.95,
      }).addTo(map);
      routeLayersRef.current.push(completedRoute);
    }

    // Stop markers
    route.stops.forEach((stop, i) => {
      const isFirst = i === 0;
      const isLast = i === route.stops.length - 1;

      let icon: L.DivIcon;
      let badge: string;
      if (isFirst) { icon = originIcon(); badge = "🟢 Origin"; }
      else if (isLast) { icon = destIcon(); badge = "🟡 Destination"; }
      else if (stop.done) { icon = stopDoneIcon(); badge = "🔵 Completed Stop"; }
      else { icon = stopPendingIcon(); badge = "⚫ Upcoming Stop"; }

      const m = L.marker([stop.lat, stop.lng], { icon, zIndexOffset: 200 }).addTo(map);
      routeLayersRef.current.push(m);

      const ts = formatTimestamp(stop.timestamp);
      m.bindPopup(`
        <div style="font-family:monospace;min-width:150px;padding:2px 0;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">${badge}</div>
          <div style="font-weight:bold;font-size:13px;">${stop.name}</div>
          ${ts ? `<div style="font-size:10px;color:#64748b;margin-top:3px;">📅 ${ts}</div>` : '<div style="font-size:10px;color:#475569;margin-top:3px;">Not yet reached</div>'}
        </div>
      `);
    });

    // Fit map to show entire route with padding for top bar
    const allPts = route.stops.map((s) => L.latLng(s.lat, s.lng));
    if (allPts.length >= 2) {
      map.fitBounds(L.latLngBounds(allPts), { paddingTopLeft: [20, 64], paddingBottomRight: [20, 80] });
    }
  }, [route]);

  // ── 3. Animate live marker on position updates ──
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const fromLat = currentPosRef.current.lat;
    const fromLng = currentPosRef.current.lng;
    const toLat = currentLat;
    const toLng = currentLng;

    if (fromLat === toLat && fromLng === toLng) return;

    // Compute bearing
    const dLngRad = ((toLng - fromLng) * Math.PI) / 180;
    const lat1Rad = (fromLat * Math.PI) / 180;
    const lat2Rad = (toLat * Math.PI) / 180;
    const y = Math.sin(dLngRad) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLngRad);
    setBearing(Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360));

    // Compute speed (km/h)
    const R = 6371;
    const dLatRad = ((toLat - fromLat) * Math.PI) / 180;
    const dLonRad = ((toLng - fromLng) * Math.PI) / 180;
    const a =
      Math.sin(dLatRad / 2) ** 2 +
      Math.cos((fromLat * Math.PI) / 180) * Math.cos((toLat * Math.PI) / 180) * Math.sin(dLonRad / 2) ** 2;
    const distKm = 2 * R * Math.asin(Math.sqrt(a));
    const elapsedHrs = (Date.now() - lastMoveTimeRef.current) / 3_600_000;
    if (elapsedHrs > 0) setSpeed(Math.round(distKm / elapsedHrs));
    lastMoveTimeRef.current = Date.now();

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const startTime = performance.now();
    const duration = 1200;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const e = ease(t);
      const lat = fromLat + (toLat - fromLat) * e;
      const lng = fromLng + (toLng - fromLng) * e;
      marker.setLatLng([lat, lng]);
      setCoords({ lat, lng });

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        currentPosRef.current = { lat: toLat, lng: toLng };
        const map = mapRef.current;
        if (map && !map.getBounds().contains([toLat, toLng])) {
          map.panTo([toLat, toLng], { animate: true, duration: 1.2 });
        }
        marker.setPopupContent(buildPackagePopup(trackingId, locationName, progressPct));
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  }, [currentLat, currentLng, locationName, progressPct, trackingId]);

  // ── 4. Switch tile layers ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tileRef.current) return;
    map.removeLayer(tileRef.current);
    const cfg = TILE_LAYERS[activeLayer];
    const tile = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 19,
      subdomains: cfg.subdomains || "abc",
    }).addTo(map);
    tile.setZIndex(0);
    tileRef.current = tile;
    markerRef.current?.setZIndexOffset(1000);
  }, [activeLayer]);

  // ── Close on Escape ──
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const centerOnPackage = () => {
    mapRef.current?.flyTo([currentPosRef.current.lat, currentPosRef.current.lng], 10, { duration: 1.5 });
  };

  const compassDir = (deg: number | null) => {
    if (deg === null) return null;
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
  };

  return (
    <div className="fixed inset-0 font-mono" style={{ zIndex: 50 }}>

      {/* Map fills everything */}
      <div ref={mapDivRef} className="absolute inset-0" />

      {/* UI overlay — zIndex 1000 keeps all controls above Leaflet's internal panes */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>

        {/* ── Top bar ── */}
        <div className="absolute top-0 left-0 right-0 pointer-events-auto flex items-center justify-between px-4 py-3 bg-background/90 backdrop-blur-md border-b border-primary/20">
          <div className="flex items-center gap-3">
            <span className="text-primary font-bold text-sm tracking-widest uppercase">Live Map</span>
            <span className="text-muted-foreground text-xs">—</span>
            <span className="text-foreground text-xs font-bold uppercase">{trackingId}</span>
            <span className="hidden sm:flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary text-xs px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
              LIVE
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Layer switcher */}
            <div className="flex items-center bg-card/90 border border-primary/20 rounded-md overflow-hidden">
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

            {/* Legend toggle */}
            <button
              onClick={() => setShowLegend((v) => !v)}
              className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-colors ${
                showLegend
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/90 border-primary/20 hover:border-primary/60 text-foreground"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Legend</span>
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
          {/* Coordinates */}
          <div className="bg-background/90 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-2 flex items-center gap-4 shadow-xl">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[10px] uppercase">Lat</span>
              <span className="text-primary text-xs font-bold tabular-nums">{coords.lat.toFixed(5)}</span>
            </div>
            <div className="w-px h-4 bg-primary/20" />
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[10px] uppercase">Lng</span>
              <span className="text-primary text-xs font-bold tabular-nums">{coords.lng.toFixed(5)}</span>
            </div>
          </div>

          {/* Heading + Speed */}
          <div className="bg-background/90 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-2 flex items-center gap-4 shadow-xl">
            <div className="flex items-center gap-1.5">
              <Navigation
                className="w-3.5 h-3.5 text-primary transition-transform duration-700"
                style={bearing !== null ? { transform: `rotate(${bearing}deg)` } : {}}
              />
              <span className="text-foreground text-xs font-bold w-6">
                {compassDir(bearing) ?? "—"}
              </span>
            </div>
            <div className="w-px h-4 bg-primary/20" />
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[10px] uppercase">Speed</span>
              <span className="text-primary text-xs font-bold tabular-nums">
                {speed !== null ? `${speed} km/h` : "—"}
              </span>
            </div>
          </div>

          {/* Progress */}
          <div className="bg-background/90 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-2 flex items-center gap-3 shadow-xl">
            <span className="text-muted-foreground text-[10px] uppercase">Progress</span>
            <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-primary text-xs font-bold tabular-nums">{Math.round(progressPct)}%</span>
          </div>
        </div>

        {/* ── Legend Panel ── */}
        {showLegend && (
          <div className="absolute top-[56px] right-4 w-72 bg-background/95 backdrop-blur-md border border-primary/30 rounded-xl shadow-2xl overflow-hidden pointer-events-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold uppercase tracking-widest">Map Legend</span>
              </div>
              <button onClick={() => setShowLegend(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-4 py-3 space-y-5 text-xs overflow-y-auto max-h-[calc(100vh-120px)]">

              <section>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2 pb-1 border-b border-primary/10">Live Package</div>
                <div className="space-y-2.5">
                  <LegendRow
                    icon={<span className="text-xl leading-none">📬</span>}
                    label="Animated Marker"
                    desc="Current position — moves every 1.5 s via live stream"
                  />
                  <LegendRow
                    icon={
                      <div className="w-5 h-5 rounded-full bg-[#38bdf8]/20 border-2 border-[#38bdf8]/60 flex items-center justify-center shrink-0">
                        <div className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse" />
                      </div>
                    }
                    label="Pulse Ring"
                    desc="Active signal — package is transmitting GPS location"
                  />
                </div>
              </section>

              <section>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2 pb-1 border-b border-primary/10">Route Lines</div>
                <div className="space-y-2.5">
                  <LegendRow
                    icon={<div className="w-10 h-[3px] bg-[#38bdf8] rounded shrink-0" />}
                    label="Completed Segment"
                    desc="Path already travelled by this package"
                  />
                  <LegendRow
                    icon={<div className="w-10 shrink-0" style={{ borderTop: "2px dashed #475569" }} />}
                    label="Upcoming Segment"
                    desc="Remaining route to destination"
                  />
                </div>
              </section>

              <section>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2 pb-1 border-b border-primary/10">Stop Markers</div>
                <div className="space-y-2.5">
                  <LegendRow
                    icon={<div className="w-[18px] h-[18px] rounded-full bg-[#22c55e] border-2 border-white shadow-[0_0_8px_rgba(34,197,94,0.7)] shrink-0" />}
                    label="Origin"
                    desc="Pickup / dispatch point — click for details"
                  />
                  <LegendRow
                    icon={<div className="w-[18px] h-[18px] rounded-full bg-[#f59e0b] border-2 border-white shadow-[0_0_8px_rgba(245,158,11,0.7)] shrink-0" />}
                    label="Destination"
                    desc="Final delivery address — click for details"
                  />
                  <LegendRow
                    icon={<div className="w-[13px] h-[13px] rounded-full bg-[#38bdf8] border-2 border-white/60 shadow-[0_0_4px_rgba(56,189,248,0.5)] shrink-0 ml-[2px]" />}
                    label="Completed Stop"
                    desc="Checkpoint already scanned and passed"
                  />
                  <LegendRow
                    icon={<div className="w-[13px] h-[13px] rounded-full bg-[#475569] border-2 border-[#64748b] shrink-0 ml-[2px]" />}
                    label="Upcoming Stop"
                    desc="Checkpoint not yet reached"
                  />
                </div>
              </section>

              <section>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2 pb-1 border-b border-primary/10">Controls</div>
                <div className="space-y-2.5">
                  <LegendRow
                    icon={<Navigation className="w-4 h-4 text-primary shrink-0" />}
                    label="Heading Arrow"
                    desc="Rotates to show travel direction (N / NE / E…)"
                  />
                  <LegendRow
                    icon={<Crosshair className="w-4 h-4 text-primary shrink-0" />}
                    label="Center Button"
                    desc="Flies the map back to the live marker"
                  />
                  <LegendRow
                    icon={<Layers className="w-4 h-4 text-primary shrink-0" />}
                    label="Layer Switcher"
                    desc="Dark ops / Street map / Satellite imagery"
                  />
                </div>
              </section>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendRow({ icon, label, desc }: { icon: React.ReactNode; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center justify-center w-6 h-6 shrink-0 mt-0.5">{icon}</div>
      <div>
        <div className="font-bold text-foreground">{label}</div>
        <div className="text-muted-foreground leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

function buildPackagePopup(trackingId: string, locationName: string, progressPct: number): string {
  return `
    <div style="font-family:monospace;min-width:160px;padding:2px 0;">
      <div style="font-weight:bold;color:#38bdf8;font-size:13px;">${trackingId}</div>
      <div style="color:#94a3b8;font-size:11px;margin-top:4px;">${locationName}</div>
      <div style="margin-top:6px;background:#1e293b;border-radius:4px;overflow:hidden;height:4px;">
        <div style="height:100%;width:${Math.round(progressPct)}%;background:#38bdf8;transition:width 1s;"></div>
      </div>
      <div style="color:#22c55e;font-size:10px;margin-top:3px;">${Math.round(progressPct)}% complete</div>
    </div>
  `;
}
