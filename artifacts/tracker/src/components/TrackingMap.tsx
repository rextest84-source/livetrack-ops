import { Suspense, lazy, useRef } from "react";
import type { GlobeMapHandle } from "@/components/globe/GlobeMap";
import { GlobeErrorBoundary } from "@/components/globe/GlobeErrorBoundary";
import type { RouteData } from "@/components/globe/globe-config";
import { Globe2 } from "lucide-react";

const GlobeMap = lazy(() =>
  import("@/components/globe/GlobeMap").then((module) => ({
    default: module.GlobeMap,
  })),
);

interface TrackingMapProps {
  currentLat: number;
  currentLng: number;
  route?: RouteData;
}

function GlobeFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-950 text-primary">
      <div className="flex flex-col items-center gap-3">
        <Globe2 className="h-10 w-10 animate-spin" />
        <span className="text-xs font-bold uppercase tracking-widest">Loading Earth View</span>
      </div>
    </div>
  );
}

export function TrackingMap({ currentLat, currentLng, route }: TrackingMapProps) {
  const globeRef = useRef<GlobeMapHandle>(null);

  return (
    <GlobeErrorBoundary>
      <Suspense fallback={<GlobeFallback />}>
        <GlobeMap
          ref={globeRef}
          className="h-full w-full bg-slate-950"
          currentLat={currentLat}
          currentLng={currentLng}
          route={route}
          layer="satellite"
          fitRouteOnLoad
          terrainEnabled
          buildingsEnabled={false}
        />
      </Suspense>
    </GlobeErrorBoundary>
  );
}
