import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ArcGISTiledElevationTerrainProvider,
  ArcType,
  BoundingSphere,
  CallbackPositionProperty,
  CameraEventType,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  DistanceDisplayCondition,
  EllipsoidTerrainProvider,
  HeadingPitchRange,
  HeightReference,
  Ion,
  KeyboardEventModifier,
  LabelStyle,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Terrain,
  VerticalOrigin,
  Viewer,
  createOsmBuildingsAsync,
  type Entity,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { createLayerProviders, hasValidIonToken } from "./cesium-layers";
import {
  buildRoutePaths,
  buildStopPoints,
  type GlobeLayer,
  type RouteData,
} from "./globe-config";

if (hasValidIonToken()) {
  Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string;
}

export interface GlobeMapHandle {
  flyToPackage: (lat: number, lng: number) => void;
  fitRoute: (route: RouteData) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetNorth: () => void;
  toggleTerrain: (enabled: boolean) => void;
  toggleBuildings: (enabled: boolean) => void;
  setSceneMode: (mode: "3d" | "2d") => void;
  searchLocation: (query: string) => Promise<boolean>;
}

interface GlobeMapProps {
  currentLat: number;
  currentLng: number;
  route?: RouteData;
  layer: GlobeLayer;
  followPackage?: boolean;
  fitRouteOnLoad?: boolean;
  terrainEnabled?: boolean;
  buildingsEnabled?: boolean;
  onCoordsChange?: (coords: { lat: number; lng: number }) => void;
  onUserInteract?: () => void;
  onAltitudeChange?: (meters: number) => void;
  className?: string;
}

const PACKAGE_ENTITY_ID = "livetrack-package";
const ROUTE_FULL_ID = "livetrack-route-full";
const ROUTE_ACTIVE_ID = "livetrack-route-active";

function cssColor(hex: string, alpha = 1): Color {
  return Color.fromCssColorString(hex).withAlpha(alpha);
}

function stopColor(hex: string): Color {
  return cssColor(hex, 0.95);
}

function pickGroundCoords(viewer: Viewer): { lat: number; lng: number } | null {
  try {
    const canvas = viewer.canvas;
    if (!canvas.clientWidth || !canvas.clientHeight) return null;
    const center = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const ray = viewer.camera.getPickRay(center);
    if (!ray) return null;
    const hit = viewer.scene.globe.pick(ray, viewer.scene);
    if (!hit) return null;
    const carto = Cartographic.fromCartesian(hit);
    return {
      lat: CesiumMath.toDegrees(carto.latitude),
      lng: CesiumMath.toDegrees(carto.longitude),
    };
  } catch {
    return null;
  }
}

function flyHeightForZoom(viewer: Viewer, factor: number): number {
  const height = viewer.camera.positionCartographic.height;
  return CesiumMath.clamp(height * factor, 500, 25_000_000);
}

async function applyTerrain(viewer: Viewer, enabled: boolean): Promise<void> {
  if (!enabled) {
    viewer.terrainProvider = new EllipsoidTerrainProvider();
    viewer.scene.globe.depthTestAgainstTerrain = false;
    return;
  }

  if (hasValidIonToken()) {
    try {
      viewer.scene.setTerrain(Terrain.fromWorldTerrain());
      viewer.scene.globe.depthTestAgainstTerrain = true;
      return;
    } catch {
      /* fall through */
    }
  }

  try {
    viewer.terrainProvider = await ArcGISTiledElevationTerrainProvider.fromUrl(
      "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
    );
    viewer.scene.globe.depthTestAgainstTerrain = true;
  } catch {
    viewer.terrainProvider = new EllipsoidTerrainProvider();
    viewer.scene.globe.depthTestAgainstTerrain = false;
  }
}

export const GlobeMap = forwardRef<GlobeMapHandle, GlobeMapProps>(function GlobeMap(
  {
    currentLat,
    currentLng,
    route,
    layer,
    followPackage = false,
    fitRouteOnLoad = true,
    terrainEnabled = true,
    buildingsEnabled = false,
    onCoordsChange,
    onUserInteract,
    onAltitudeChange,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const packageEntityRef = useRef<Entity | null>(null);
  const packagePositionRef = useRef({ lat: currentLat, lng: currentLng });
  const buildingsRef = useRef<Awaited<ReturnType<typeof createOsmBuildingsAsync>> | null>(
    null,
  );
  const fittedRouteRef = useRef(false);
  const followRef = useRef(followPackage);
  const userMovedRef = useRef(false);
  const onCoordsChangeRef = useRef(onCoordsChange);
  const onUserInteractRef = useRef(onUserInteract);
  const onAltitudeChangeRef = useRef(onAltitudeChange);

  const [viewerReady, setViewerReady] = useState(false);

  followRef.current = followPackage;
  packagePositionRef.current = { lat: currentLat, lng: currentLng };
  onCoordsChangeRef.current = onCoordsChange;
  onUserInteractRef.current = onUserInteract;
  onAltitudeChangeRef.current = onAltitudeChange;

  useImperativeHandle(ref, () => ({
    flyToPackage(lat: number, lng: number) {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      userMovedRef.current = false;
      viewer.trackedEntity = undefined;
      const height = flyHeightForZoom(viewer, 0.35);
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lng, lat, height),
        orientation: {
          heading: viewer.camera.heading,
          pitch: CesiumMath.toRadians(-45),
          roll: 0,
        },
        duration: 1.6,
        complete: () => {
          if (followRef.current && packageEntityRef.current) {
            viewer.trackedEntity = packageEntityRef.current;
          }
        },
      });
    },
    fitRoute(nextRoute: RouteData) {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      userMovedRef.current = false;
      viewer.trackedEntity = undefined;
      const positions = nextRoute.waypoints.map((w) =>
        Cartesian3.fromDegrees(w.lng, w.lat, 800),
      );
      const sphere = BoundingSphere.fromPoints(positions);
      viewer.camera.flyToBoundingSphere(sphere, {
        duration: 2,
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-40), sphere.radius * 2.8),
      });
    },
    zoomIn() {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      const height = viewer.camera.positionCartographic.height;
      viewer.camera.zoomIn(height * 0.45);
    },
    zoomOut() {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      const height = viewer.camera.positionCartographic.height;
      viewer.camera.zoomOut(height * 0.55);
    },
    resetNorth() {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      viewer.camera.flyTo({
        destination: viewer.camera.position,
        orientation: { heading: 0, pitch: viewer.camera.pitch, roll: 0 },
        duration: 0.8,
      });
    },
    async toggleTerrain(enabled: boolean) {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      await applyTerrain(viewer, enabled);
    },
    async toggleBuildings(enabled: boolean) {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed() || !hasValidIonToken()) return;
      if (enabled) {
        if (!buildingsRef.current) {
          try {
            buildingsRef.current = await createOsmBuildingsAsync();
            viewer.scene.primitives.add(buildingsRef.current);
          } catch {
            /* optional */
          }
        } else {
          buildingsRef.current.show = true;
        }
      } else if (buildingsRef.current) {
        buildingsRef.current.show = false;
      }
    },
    setSceneMode(mode: "3d" | "2d") {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      if (mode === "2d") viewer.scene.morphTo2D(0.8);
      else viewer.scene.morphTo3D(0.8);
    },
    async searchLocation(query: string) {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return false;

      const trimmed = query.trim();
      if (!trimmed) return false;

      const coordMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      if (coordMatch) {
        const lat = Number(coordMatch[1]);
        const lng = Number(coordMatch[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          viewer.trackedEntity = undefined;
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(lng, lat, 12_000),
            orientation: { heading: 0, pitch: CesiumMath.toRadians(-55), roll: 0 },
            duration: 2,
          });
          return true;
        }
      }

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`,
          { headers: { Accept: "application/json" } },
        );
        const results = (await response.json()) as Array<{ lat: string; lon: string }>;
        if (!results.length) return false;
        viewer.trackedEntity = undefined;
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(
            Number(results[0].lon),
            Number(results[0].lat),
            18_000,
          ),
          orientation: { heading: 0, pitch: CesiumMath.toRadians(-55), roll: 0 },
          duration: 2,
        });
        return true;
      } catch {
        return false;
      }
    },
  }));

  // Create viewer exactly once — never re-run on prop/callback changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewerRef.current) return;

    let destroyed = false;

    const viewer = new Viewer(container, {
      animation: false,
      timeline: false,
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      vrButton: false,
      shouldAnimate: true,
      showRenderLoopErrors: false,
      terrainProvider: new EllipsoidTerrainProvider(),
      requestRenderMode: false,
    });

    viewerRef.current = viewer;
    viewer.cesiumWidget.creditContainer.classList.add("cesium-credit-minimal");

    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableCollisionDetection = true;
    controller.minimumZoomDistance = 120;
    controller.maximumZoomDistance = 50_000_000;
    controller.inertiaSpin = 0.9;
    controller.inertiaTranslate = 0.85;
    controller.inertiaZoom = 0.82;
    controller.zoomEventTypes = [CameraEventType.WHEEL, CameraEventType.PINCH];
    controller.tiltEventTypes = [
      CameraEventType.RIGHT_DRAG,
      CameraEventType.PINCH,
      { eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.CTRL },
    ];
    controller.rotateEventTypes = [CameraEventType.LEFT_DRAG];

    viewer.scene.globe.enableLighting = false;
    viewer.scene.fog.enabled = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;

    viewer.scene.renderError.addEventListener((_scene, error) => {
      console.error("[Cesium] render error:", error);
    });

    const markUserMoved = () => {
      userMovedRef.current = true;
      onUserInteractRef.current?.();
      if (followRef.current) viewer.trackedEntity = undefined;
    };
    viewer.camera.moveStart.addEventListener(markUserMoved);

    const reportView = () => {
      if (destroyed || viewer.isDestroyed()) return;
      const ground = pickGroundCoords(viewer);
      if (ground) onCoordsChangeRef.current?.(ground);
      onAltitudeChangeRef.current?.(viewer.camera.positionCartographic.height);
    };
    viewer.camera.changed.addEventListener(reportView);

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const ray = viewer.camera.getPickRay(click.position);
      if (!ray) return;
      const hit = viewer.scene.globe.pick(ray, viewer.scene);
      if (!hit) return;
      const carto = Cartographic.fromCartesian(hit);
      onCoordsChangeRef.current?.({
        lat: CesiumMath.toDegrees(carto.latitude),
        lng: CesiumMath.toDegrees(carto.longitude),
      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const ray = viewer.camera.getPickRay(click.position);
      if (!ray) return;
      const hit = viewer.scene.globe.pick(ray, viewer.scene);
      if (!hit) return;
      const carto = Cartographic.fromCartesian(hit);
      const height = Math.max(viewer.camera.positionCartographic.height * 0.4, 1200);
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          CesiumMath.toDegrees(carto.longitude),
          CesiumMath.toDegrees(carto.latitude),
          height,
        ),
        duration: 1.2,
        orientation: {
          heading: viewer.camera.heading,
          pitch: CesiumMath.toRadians(-50),
          roll: 0,
        },
      });
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    const packageEntity = viewer.entities.add({
      id: PACKAGE_ENTITY_ID,
      position: new CallbackPositionProperty(() => {
        const { lat, lng } = packagePositionRef.current;
        return Cartesian3.fromDegrees(lng, lat, 500);
      }, false),
      point: {
        pixelSize: 14,
        color: cssColor("#38bdf8"),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: "LIVE",
        font: "bold 12px sans-serif",
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -18),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      viewFrom: new Cartesian3(-8000, -8000, 5000),
    });
    packageEntityRef.current = packageEntity;

    if (!destroyed) setViewerReady(true);

    return () => {
      destroyed = true;
      setViewerReady(false);
      handler.destroy();
      handlerRef.current = null;
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
      packageEntityRef.current = null;
      buildingsRef.current = null;
    };
  }, []);

  // Imagery layers — single loader, no race with init
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady || viewer.isDestroyed()) return;

    let cancelled = false;
    void (async () => {
      try {
        const providers = await createLayerProviders(layer);
        if (cancelled || viewer.isDestroyed()) return;
        viewer.imageryLayers.removeAll();
        for (const [index, provider] of providers.entries()) {
          const imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
          if (index === 1) imageryLayer.alpha = 0.72;
        }
      } catch (error) {
        console.error("[Cesium] imagery load failed:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [layer, viewerReady]);

  // Terrain toggle
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady || viewer.isDestroyed()) return;
    void applyTerrain(viewer, terrainEnabled);
  }, [terrainEnabled, viewerReady]);

  // 3D buildings — off by default; only load when explicitly enabled
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady || viewer.isDestroyed() || !hasValidIonToken()) return;

    void (async () => {
      if (buildingsEnabled) {
        if (!buildingsRef.current) {
          try {
            buildingsRef.current = await createOsmBuildingsAsync();
            if (!viewer.isDestroyed()) {
              viewer.scene.primitives.add(buildingsRef.current);
            }
          } catch {
            /* optional */
          }
        } else {
          buildingsRef.current.show = true;
        }
      } else if (buildingsRef.current) {
        buildingsRef.current.show = false;
      }
    })();
  }, [buildingsEnabled, viewerReady]);

  // Follow camera
  useEffect(() => {
    const viewer = viewerRef.current;
    const entity = packageEntityRef.current;
    if (!viewer || !entity || viewer.isDestroyed()) return;

    if (followPackage && !userMovedRef.current) {
      viewer.trackedEntity = entity;
    } else if (!followPackage) {
      viewer.trackedEntity = undefined;
    }
  }, [currentLat, currentLng, followPackage, viewerReady]);

  // Route overlays
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady || viewer.isDestroyed()) return;

    viewer.entities.removeById(ROUTE_FULL_ID);
    viewer.entities.removeById(ROUTE_ACTIVE_ID);
    for (let i = 0; i < 20; i++) viewer.entities.removeById(`livetrack-stop-${i}`);

    if (!route?.waypoints.length) return;

    const paths = buildRoutePaths(route);

    const addPolyline = (id: string, coords: [number, number][], color: string, width: number) => {
      const flat = coords.flatMap(([lat, lng]) => [lng, lat]);
      viewer.entities.add({
        id,
        polyline: {
          positions: Cartesian3.fromDegreesArray(flat),
          width,
          material: cssColor(color),
          arcType: ArcType.GEODESIC,
        },
      });
    };

    if (paths[0]) addPolyline(ROUTE_FULL_ID, paths[0].coords, "#64748b", 3);
    if (paths[1]) addPolyline(ROUTE_ACTIVE_ID, paths[1].coords, "#38bdf8", 4);

    buildStopPoints(route).forEach((stop, index) => {
      viewer.entities.add({
        id: `livetrack-stop-${index}`,
        position: Cartesian3.fromDegrees(stop.lng, stop.lat, 500),
        point: {
          pixelSize: 8 + stop.size * 14,
          color: stopColor(stop.color),
          outlineColor: Color.WHITE.withAlpha(0.9),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: stop.name,
          font: "11px sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -12),
          showBackground: true,
          backgroundColor: cssColor("#0f172a", 0.75),
          backgroundPadding: new Cartesian2(6, 4),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 3_000_000),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    });

    if (fitRouteOnLoad && !fittedRouteRef.current) {
      fittedRouteRef.current = true;
      const positions = route.waypoints.map((w) => Cartesian3.fromDegrees(w.lng, w.lat, 800));
      const sphere = BoundingSphere.fromPoints(positions);
      viewer.camera.flyToBoundingSphere(sphere, {
        duration: 2,
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-38), sphere.radius * 2.8),
      });
    }
  }, [fitRouteOnLoad, route, viewerReady]);

  return (
    <div
      ref={containerRef}
      className={`cesium-earth-view ${className ?? "h-full w-full"}`}
    />
  );
});
