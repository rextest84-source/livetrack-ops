import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { GlobeMapHandle } from "@/components/globe/GlobeMap";
import { GlobeErrorBoundary } from "@/components/globe/GlobeErrorBoundary";
import { hasValidIonToken } from "@/components/globe/cesium-layers";
import {
  GLOBE_TEXTURES,
  compassDirection,
  computeBearing,
  computeSpeedKmh,
  type GlobeLayer,
  type RouteData,
} from "@/components/globe/globe-config";
import {
  X,
  Crosshair,
  Layers,
  Navigation,
  BookOpen,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Globe2,
  Search,
  Mountain,
  Building2,
  Map,
} from "lucide-react";

const GlobeMap = lazy(() =>
  import("@/components/globe/GlobeMap").then((module) => ({
    default: module.GlobeMap,
  })),
);

interface MapModalProps {
  trackingId: string;
  currentLat: number;
  currentLng: number;
  locationName: string;
  progressPct: number;
  route?: RouteData;
  onClose: () => void;
}

export function MapModal({
  trackingId,
  currentLat,
  currentLng,
  locationName,
  progressPct,
  route,
  onClose,
}: MapModalProps) {
  const globeRef = useRef<GlobeMapHandle>(null);
  const currentPosRef = useRef({ lat: currentLat, lng: currentLng });
  const lastMoveTimeRef = useRef(Date.now());

  const [activeLayer, setActiveLayer] = useState<GlobeLayer>("satellite");
  const [coords, setCoords] = useState({ lat: currentLat, lng: currentLng });
  const [speed, setSpeed] = useState<number | null>(null);
  const [bearing, setBearing] = useState<number | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [followLive, setFollowLive] = useState(true);
  const [terrainOn, setTerrainOn] = useState(true);
  const [buildingsOn, setBuildingsOn] = useState(false);
  const [sceneMode, setSceneMode] = useState<"3d" | "2d">("3d");
  const [altitudeM, setAltitudeM] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);

  const hasIon = hasValidIonToken();

  useEffect(() => {
    const fromLat = currentPosRef.current.lat;
    const fromLng = currentPosRef.current.lng;

    if (fromLat === currentLat && fromLng === currentLng) return;

    setBearing(computeBearing(fromLat, fromLng, currentLat, currentLng));
    setSpeed(
      computeSpeedKmh(
        fromLat,
        fromLng,
        currentLat,
        currentLng,
        Date.now() - lastMoveTimeRef.current,
      ),
    );
    lastMoveTimeRef.current = Date.now();
    currentPosRef.current = { lat: currentLat, lng: currentLng };
    setCoords({ lat: currentLat, lng: currentLng });
  }, [currentLat, currentLng]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 font-mono" style={{ zIndex: 50 }}>
      <GlobeErrorBoundary>
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center bg-black text-primary">
              <Globe2 className="h-12 w-12 animate-spin" />
            </div>
          }
        >
          <GlobeMap
            ref={globeRef}
            className="absolute inset-0 bg-black"
            currentLat={currentLat}
            currentLng={currentLng}
            route={route}
            layer={activeLayer}
            followPackage={followLive}
            fitRouteOnLoad
            terrainEnabled={terrainOn}
            buildingsEnabled={buildingsOn}
            onCoordsChange={setCoords}
            onAltitudeChange={setAltitudeM}
            onUserInteract={() => setFollowLive(false)}
          />
        </Suspense>
      </GlobeErrorBoundary>

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
        <div className="absolute top-0 left-0 right-0 pointer-events-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-2.5 sm:px-4 py-2 sm:py-3 bg-background/90 backdrop-blur-md border-b border-primary/20">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <Globe2 className="w-4 h-4 text-primary shrink-0" />
            <span className="text-primary font-bold text-xs sm:text-sm tracking-widest uppercase shrink-0">
              Earth View
            </span>
            <span className="text-muted-foreground text-[10px] sm:text-xs hidden xs:inline">—</span>
            <span className="text-foreground text-[10px] sm:text-xs font-bold uppercase truncate">
              {trackingId}
            </span>
            <span className="hidden sm:flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary text-xs px-2 py-0.5 rounded-full shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
              LIVE
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <form
              className="flex items-center bg-card/90 border border-primary/20 rounded-md overflow-hidden"
              onSubmit={async (event) => {
                event.preventDefault();
                setSearchError(null);
                const ok = await globeRef.current?.searchLocation(searchQuery);
                if (!ok) setSearchError("Location not found");
              }}
            >
              <Search className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground mx-1.5 sm:mx-2 shrink-0" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search city or lat,lng"
                className="bg-transparent text-[10px] sm:text-xs w-28 sm:w-44 outline-none placeholder:text-muted-foreground/70 py-1 sm:py-1.5 pr-2"
              />
            </form>

            <div className="flex items-center bg-card/90 border border-primary/20 rounded-md overflow-hidden">
              <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground mx-1.5 sm:mx-2 shrink-0" />
              {(Object.keys(GLOBE_TEXTURES) as GlobeLayer[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveLayer(key)}
                  className={`px-1.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold uppercase transition-colors ${
                    activeLayer === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-primary/10"
                  }`}
                >
                  {GLOBE_TEXTURES[key].label}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setFollowLive((value) => {
                  const next = !value;
                  if (next) {
                    globeRef.current?.flyToPackage(currentLat, currentLng);
                  }
                  return next;
                });
              }}
              className={`flex items-center gap-1.5 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold uppercase transition-colors ${
                followLive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/90 border-primary/20 hover:border-primary/60 text-foreground"
              }`}
            >
              <Crosshair className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{followLive ? "Following" : "Free Cam"}</span>
            </button>

            <button
              onClick={() => {
                const next = sceneMode === "3d" ? "2d" : "3d";
                setSceneMode(next);
                globeRef.current?.setSceneMode(next);
              }}
              className="flex items-center gap-1.5 bg-card/90 border border-primary/20 hover:border-primary/60 text-foreground px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold uppercase transition-colors"
            >
              <Map className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
              <span className="hidden sm:inline">{sceneMode === "3d" ? "3D" : "2D"}</span>
            </button>

            {hasIon ? (
              <button
                onClick={() => {
                  const next = !buildingsOn;
                  setBuildingsOn(next);
                  void globeRef.current?.toggleBuildings(next);
                }}
                className={`flex items-center gap-1.5 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold uppercase transition-colors ${
                  buildingsOn
                    ? "bg-primary/15 border-primary text-primary"
                    : "bg-card/90 border-primary/20 text-foreground"
                }`}
              >
                <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">3D Buildings</span>
              </button>
            ) : null}

            <button
              onClick={() => {
                const next = !terrainOn;
                setTerrainOn(next);
                void globeRef.current?.toggleTerrain(next);
              }}
              className={`flex items-center gap-1.5 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold uppercase transition-colors ${
                terrainOn
                  ? "bg-primary/15 border-primary text-primary"
                  : "bg-card/90 border-primary/20 text-foreground"
              }`}
            >
              <Mountain className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Terrain</span>
            </button>

            <button
              onClick={() => globeRef.current?.flyToPackage(currentLat, currentLng)}
              className="flex items-center gap-1.5 bg-card/90 border border-primary/20 hover:border-primary/60 text-foreground px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold uppercase transition-colors"
            >
              <Navigation className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
              <span className="hidden sm:inline">Fly To</span>
            </button>

            <button
              onClick={() => route && globeRef.current?.fitRoute(route)}
              className="flex items-center gap-1.5 bg-card/90 border border-primary/20 hover:border-primary/60 text-foreground px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold uppercase transition-colors"
            >
              <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
              <span className="hidden sm:inline">Route</span>
            </button>

            <button
              onClick={() => setShowLegend((value) => !value)}
              className={`flex items-center gap-1.5 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold uppercase transition-colors ${
                showLegend
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/90 border-primary/20 hover:border-primary/60 text-foreground"
              }`}
            >
              <BookOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Legend</span>
            </button>

            <button
              onClick={onClose}
              className="flex items-center gap-1.5 bg-card/90 border border-primary/20 hover:border-red-500/60 text-foreground px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold uppercase transition-colors"
            >
              <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>

        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-40">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border border-primary/50" />
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-primary/40" />
            <div className="absolute top-1/2 left-0 w-full h-px -translate-y-1/2 bg-primary/40" />
          </div>
        </div>

        <div className="absolute right-3 sm:right-4 top-24 sm:top-28 flex flex-col gap-2 pointer-events-auto">
          <GlobeControlButton label="Zoom in" onClick={() => globeRef.current?.zoomIn()}>
            <ZoomIn className="w-4 h-4" />
          </GlobeControlButton>
          <GlobeControlButton label="Zoom out" onClick={() => globeRef.current?.zoomOut()}>
            <ZoomOut className="w-4 h-4" />
          </GlobeControlButton>
          <GlobeControlButton label="Reset view" onClick={() => globeRef.current?.resetNorth()}>
            <RotateCcw className="w-4 h-4" />
          </GlobeControlButton>
        </div>

        <div className="absolute bottom-2 sm:bottom-8 left-1/2 -translate-x-1/2 flex flex-wrap justify-center items-stretch gap-1.5 sm:gap-2 px-2 max-w-full">
          <HudCard>
            <HudMetric label="Lat" value={coords.lat.toFixed(5)} />
            <HudDivider />
            <HudMetric label="Lng" value={coords.lng.toFixed(5)} />
            <HudDivider />
            <HudMetric
              label="Alt"
              value={
                altitudeM !== null
                  ? altitudeM >= 1000
                    ? `${(altitudeM / 1000).toFixed(1)} km`
                    : `${Math.round(altitudeM)} m`
                  : "—"
              }
            />
          </HudCard>

          <HudCard>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Navigation
                className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary transition-transform duration-700"
                style={bearing !== null ? { transform: `rotate(${bearing}deg)` } : undefined}
              />
              <span className="text-foreground text-[10px] sm:text-xs font-bold w-5 sm:w-6">
                {compassDirection(bearing) ?? "—"}
              </span>
            </div>
            <HudDivider />
            <HudMetric
              label="Speed"
              value={speed !== null ? `${speed} km/h` : "—"}
            />
          </HudCard>

          <HudCard>
            <span className="text-muted-foreground text-[8px] sm:text-[10px] uppercase">
              Progress
            </span>
            <div className="w-12 sm:w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-1000"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-primary text-[10px] sm:text-xs font-bold tabular-nums">
              {Math.round(progressPct)}%
            </span>
          </HudCard>

          <HudCard>
            <span className="text-muted-foreground text-[8px] sm:text-[10px] uppercase truncate max-w-[120px] sm:max-w-[180px]">
              {locationName}
            </span>
          </HudCard>
        </div>

        {searchError && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 pointer-events-auto bg-destructive/90 text-destructive-foreground text-xs px-3 py-1.5 rounded-md shadow-lg">
            {searchError}
          </div>
        )}

        {showLegend && (
          <div className="absolute top-[52px] sm:top-[56px] right-2 sm:right-4 left-2 sm:left-auto w-auto sm:w-80 bg-background/95 backdrop-blur-md border border-primary/30 rounded-xl shadow-2xl overflow-hidden pointer-events-auto">
            <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                <span className="text-xs sm:text-sm font-bold uppercase tracking-widest">
                  Earth Controls
                </span>
              </div>
              <button
                onClick={() => setShowLegend(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-3 sm:px-4 py-3 space-y-4 text-[11px] sm:text-xs">
              <LegendSection title="Navigation">
                <LegendRow
                  label="Drag"
                  desc="Rotate the globe like Google Earth"
                />
                <LegendRow
                  label="Scroll / Pinch"
                  desc="Zoom in and out toward the surface"
                />
                <LegendRow
                  label="Right-drag"
                  desc="Tilt and pan the camera angle"
                />
                <LegendRow
                  label="Double-click"
                  desc="Zoom in toward a location on the globe"
                />
              </LegendSection>

              <LegendSection title="Layers">
                <LegendRow label="Satellite" desc="High-resolution Esri satellite tiles — sharp at street level" />
                <LegendRow label="Street" desc="Roads, cities, and place names" />
                <LegendRow label="Hybrid" desc="Satellite imagery with labels overlay" />
              </LegendSection>

              <LegendSection title="3D">
                <LegendRow label="Terrain" desc="Real elevation mesh — Esri worldwide terrain, or Cesium World Terrain with Ion" />
                {hasIon && (
                  <LegendRow label="3D Buildings" desc="OpenStreetMap 3D building extrusions via Cesium Ion" />
                )}
              </LegendSection>

              <LegendSection title="Search">
                <LegendRow label="City search" desc="Type a place name and press Enter to fly there" />
                <LegendRow label="Coordinates" desc="Enter lat,lng (e.g. 40.7128,-74.0060) to jump directly" />
              </LegendSection>

              <LegendSection title="Tracking">
                <LegendRow label="Following" desc="Camera flies with the live package automatically" />
                <LegendRow label="Free Cam" desc="Explore manually without auto-follow" />
                <LegendRow label="Fly To" desc="Cinematic camera flight to the package" />
                <LegendRow label="Route" desc="Zoom out to frame the full delivery path" />
              </LegendSection>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GlobeControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-background/90 text-primary shadow-lg backdrop-blur-md transition-colors hover:border-primary hover:bg-primary/10"
    >
      {children}
    </button>
  );
}

function HudCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background/90 backdrop-blur-md border border-primary/30 rounded-lg px-2.5 sm:px-4 py-1.5 sm:py-2 flex items-center gap-2 sm:gap-4 shadow-xl">
      {children}
    </div>
  );
}

function HudDivider() {
  return <div className="w-px h-4 bg-primary/20" />;
}

function HudMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      <span className="text-muted-foreground text-[8px] sm:text-[10px] uppercase">{label}</span>
      <span className="text-primary text-[10px] sm:text-xs font-bold tabular-nums">{value}</span>
    </div>
  );
}

function LegendSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2 pb-1 border-b border-primary/10">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function LegendRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div>
      <div className="font-bold text-foreground">{label}</div>
      <div className="text-muted-foreground leading-relaxed">{desc}</div>
    </div>
  );
}
