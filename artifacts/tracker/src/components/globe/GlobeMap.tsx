import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import {
  GLOBE_BACKGROUND,
  GLOBE_TEXTURES,
  buildRoutePaths,
  buildStopPoints,
  routeBounds,
  type GlobeLayer,
  type RouteData,
} from "./globe-config";

export interface GlobeMapHandle {
  flyToPackage: (lat: number, lng: number) => void;
  fitRoute: (route: RouteData) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetNorth: () => void;
}

interface GlobeMapProps {
  currentLat: number;
  currentLng: number;
  route?: RouteData;
  layer: GlobeLayer;
  followPackage?: boolean;
  fitRouteOnLoad?: boolean;
  onCoordsChange?: (coords: { lat: number; lng: number }) => void;
  onUserInteract?: () => void;
  className?: string;
}

function createLiveMarkerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "globe-live-marker";
  el.innerHTML = `
    <div class="globe-live-marker__ring globe-live-marker__ring--outer"></div>
    <div class="globe-live-marker__ring globe-live-marker__ring--inner"></div>
    <div class="globe-live-marker__icon">📬</div>
  `;
  return el;
}

export const GlobeMap = forwardRef<GlobeMapHandle, GlobeMapProps>(function GlobeMap(
  {
    currentLat,
    currentLng,
    route,
    layer,
    followPackage = false,
    fitRouteOnLoad = true,
    onCoordsChange,
    onUserInteract,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const followRef = useRef(followPackage);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const fittedRouteRef = useRef(false);

  followRef.current = followPackage;

  const texture = GLOBE_TEXTURES[layer];
  const pathsData = useMemo(() => (route ? buildRoutePaths(route) : []), [route]);
  const pointsData = useMemo(() => (route ? buildStopPoints(route) : []), [route]);

  const htmlElementsData = useMemo(
    () => [{ lat: currentLat, lng: currentLng, id: "live-package" }],
    [currentLat, currentLng],
  );

  useImperativeHandle(ref, () => ({
    flyToPackage(lat: number, lng: number) {
      const globe = globeRef.current;
      if (!globe) return;
      const altitude = globe.pointOfView().altitude ?? 1.6;
      globe.pointOfView({ lat, lng, altitude: Math.max(altitude, 1.2) }, 1500);
    },
    fitRoute(nextRoute: RouteData) {
      globeRef.current?.pointOfView(routeBounds(nextRoute), 1800);
    },
    zoomIn() {
      const globe = globeRef.current;
      if (!globe) return;
      const pov = globe.pointOfView();
      globe.pointOfView(
        { ...pov, altitude: Math.max((pov.altitude ?? 1.6) * 0.65, 0.35) },
        700,
      );
    },
    zoomOut() {
      const globe = globeRef.current;
      if (!globe) return;
      const pov = globe.pointOfView();
      globe.pointOfView(
        { ...pov, altitude: Math.min((pov.altitude ?? 1.6) * 1.45, 4.5) },
        700,
      );
    },
    resetNorth() {
      const globe = globeRef.current;
      if (!globe) return;
      const pov = globe.pointOfView();
      globe.pointOfView(
        { lat: pov.lat, lng: pov.lng, altitude: Math.min(pov.altitude ?? 1.6, 2.2) },
        900,
      );
      globe.controls().target.set(0, 0, 0);
      globe.controls().update();
    },
  }));

  const configureControls = () => {
    const globe = globeRef.current;
    if (!globe) return;

    const controls = globe.controls();
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.45;
    controls.zoomSpeed = 0.85;
    controls.panSpeed = 0.65;
    controls.enablePan = true;

    controls.addEventListener("start", () => {
      onUserInteract?.();
    });
  };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      setDimensions({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!globeRef.current || !route || !fitRouteOnLoad || fittedRouteRef.current) return;
    fittedRouteRef.current = true;
    globeRef.current.pointOfView(routeBounds(route), 1800);
  }, [route, fitRouteOnLoad]);

  useEffect(() => {
    if (!followRef.current || !globeRef.current) return;
    const pov = globeRef.current.pointOfView();
    globeRef.current.pointOfView(
      {
        lat: currentLat,
        lng: currentLng,
        altitude: pov.altitude ?? 1.6,
      },
      1200,
    );
  }, [currentLat, currentLng, followPackage]);

  return (
    <div ref={containerRef} className={className ?? "w-full h-full"}>
      {dimensions.width > 0 && dimensions.height > 0 && (
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          globeImageUrl={texture.globe}
          bumpImageUrl={texture.bump}
          backgroundImageUrl={GLOBE_BACKGROUND}
          showAtmosphere
          atmosphereColor="#38bdf8"
          atmosphereAltitude={0.18}
          animateIn
          pathsData={pathsData}
          pathPoints="coords"
          pathPointLat={(point) => point[0]}
          pathPointLng={(point) => point[1]}
          pathColor={(path) => path.color}
          pathStroke={(path) => path.stroke ?? 0.4}
          pathTransitionDuration={800}
          pointsData={pointsData}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointAltitude="altitude"
          pointRadius="size"
          pointLabel="label"
          htmlElementsData={htmlElementsData}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.04}
          htmlElement={createLiveMarkerElement}
          htmlTransitionDuration={1200}
          onGlobeReady={configureControls}
          onZoom={(pov) => {
            if (typeof pov.lat === "number" && typeof pov.lng === "number") {
              onCoordsChange?.({ lat: pov.lat, lng: pov.lng });
            }
          }}
          onGlobeClick={({ lat, lng }, event) => {
            if (typeof lat !== "number" || typeof lng !== "number") return;
            onCoordsChange?.({ lat, lng });

            if (event.detail >= 2) {
              const globe = globeRef.current;
              if (!globe) return;
              const pov = globe.pointOfView();
              globe.pointOfView(
                { lat, lng, altitude: Math.max((pov.altitude ?? 1.6) * 0.55, 0.3) },
                900,
              );
            }
          }}
        />
      )}
    </div>
  );
});
