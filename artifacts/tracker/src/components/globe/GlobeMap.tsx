import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
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
  type ImageryLayer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { createLayerProviders } from "./cesium-layers";
import {
  buildRoutePaths,
  buildStopPoints,
  type GlobeLayer,
  type RouteData,
} from "./globe-config";

const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
if (ionToken) {
  Ion.defaultAccessToken = ionToken;
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
  const canvas = viewer.canvas;
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
}

function flyHeightForZoom(viewer: Viewer, factor: number): number {
  const height = viewer.camera.positionCartographic.height;
  return CesiumMath.clamp(height * factor, 120, 25_000_000);
}

async function applyTerrain(viewer: Viewer, enabled: boolean): Promise<void> {
  if (!enabled) {
    viewer.terrainProvider = new EllipsoidTerrainProvider();
    viewer.scene.globe.depthTestAgainstTerrain = false;
    return;
  }

  if (ionToken) {
    try {
      viewer.scene.setTerrain(Terrain.fromWorldTerrain());
      viewer.scene.globe.depthTestAgainstTerrain = true;
      return;
    } catch {
      /* fall through to Esri terrain */
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
    buildingsEnabled = true,
    onCoordsChange,
    onUserInteract,
    onAltitudeChange,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const packageEntityRef = useRef<Entity | null>(null);
  const packagePositionRef = useRef({ lat: currentLat, lng: currentLng });
  const buildingsRef = useRef<Awaited<ReturnType<typeof createOsmBuildingsAsync>> | null>(
    null,
  );
  const fittedRouteRef = useRef(false);
  const followRef = useRef(followPackage);
  const userMovedRef = useRef(false);
  const layerRef = useRef(layer);

  followRef.current = followPackage;
  layerRef.current = layer;
  packagePositionRef.current = { lat: currentLat, lng: currentLng };

  useImperativeHandle(ref, () => ({
    flyToPackage(lat: number, lng: number) {
      const viewer = viewerRef.current;
      if (!viewer) return;
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
      if (!viewer) return;
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
      if (!viewer) return;
      const height = viewer.camera.positionCartographic.height;
      viewer.camera.zoomIn(height * 0.45);
    },
    zoomOut() {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const height = viewer.camera.positionCartographic.height;
      viewer.camera.zoomOut(height * 0.55);
    },
    resetNorth() {
      const viewer = viewerRef.current;
      if (!viewer) return;
      viewer.camera.flyTo({
        destination: viewer.camera.position,
        orientation: {
          heading: 0,
          pitch: viewer.camera.pitch,
          roll: 0,
        },
        duration: 0.8,
      });
    },
    async toggleTerrain(enabled: boolean) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      await applyTerrain(viewer, enabled);
    },
    async toggleBuildings(enabled: boolean) {
      const viewer = viewerRef.current;
      if (!viewer || !ionToken) return;
      if (enabled) {
        if (!buildingsRef.current) {
          try {
            buildingsRef.current = await createOsmBuildingsAsync();
            viewer.scene.primitives.add(buildingsRef.current);
          } catch {
            /* buildings optional */
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
      if (!viewer) return;
      if (mode === "2d") {
        viewer.scene.morphTo2D(0.8);
      } else {
        viewer.scene.morphTo3D(0.8);
      }
    },
    async searchLocation(query: string) {
      const viewer = viewerRef.current;
      if (!viewer) return false;

      const trimmed = query.trim();
      if (!trimmed) return false;

      const coordMatch = trimmed.match(
        /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
      );
      if (coordMatch) {
        const lat = Number(coordMatch[1]);
        const lng = Number(coordMatch[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          viewer.trackedEntity = undefined;
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(lng, lat, 12_000),
            orientation: {
              heading: 0,
              pitch: CesiumMath.toRadians(-55),
              roll: 0,
            },
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
        const lat = Number(results[0].lat);
        const lng = Number(results[0].lon);
        viewer.trackedEntity = undefined;
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(lng, lat, 18_000),
          orientation: {
            heading: 0,
            pitch: CesiumMath.toRadians(-55),
            roll: 0,
          },
          duration: 2,
        });
        return true;
      } catch {
        return false;
      }
    },
  }));

  // Initialize Cesium viewer once
  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewerRef.current) return;

    const viewer = new Viewer(container, {
      animation: false,
      timeline: false,
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
      msaaSamples: 2,
    });

    viewerRef.current = viewer;
    viewer.cesiumWidget.creditContainer.classList.add("cesium-credit-minimal");

    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableCollisionDetection = true;
    controller.minimumZoomDistance = 25;
    controller.maximumZoomDistance = 50_000_000;
    controller.inertiaSpin = 0.9;
    controller.inertiaTranslate = 0.85;
    controller.inertiaZoom = 0.82;
    controller.zoomEventTypes = [CameraEventType.WHEEL, CameraEventType.PINCH];
    controller.tiltEventTypes = [
      CameraEventType.RIGHT_DRAG,
      CameraEventType.PINCH,
      {
        eventType: CameraEventType.LEFT_DRAG,
        modifier: KeyboardEventModifier.CTRL,
      },
    ];
    controller.rotateEventTypes = [CameraEventType.LEFT_DRAG];

    viewer.scene.globe.enableLighting = true;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00015;
    viewer.scene.postProcessStages.fxaa.enabled = true;

    const markUserMoved = () => {
      userMovedRef.current = true;
      onUserInteract?.();
      if (followRef.current) {
        viewer.trackedEntity = undefined;
      }
    };

    viewer.camera.moveStart.addEventListener(markUserMoved);

    const reportView = () => {
      const ground = pickGroundCoords(viewer);
      if (ground) onCoordsChange?.(ground);
      onAltitudeChange?.(viewer.camera.positionCartographic.height);
    };
    viewer.camera.changed.addEventListener(reportView);

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const ray = viewer.camera.getPickRay(click.position);
      if (!ray) return;
      const hit = viewer.scene.globe.pick(ray, viewer.scene);
      if (!hit) return;
      const carto = Cartographic.fromCartesian(hit);
      onCoordsChange?.({
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
      const lat = CesiumMath.toDegrees(carto.latitude);
      const lng = CesiumMath.toDegrees(carto.longitude);
      const height = Math.max(viewer.camera.positionCartographic.height * 0.4, 800);
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lng, lat, height),
        duration: 1.2,
        orientation: {
          heading: viewer.camera.heading,
          pitch: CesiumMath.toRadians(-50),
          roll: 0,
        },
      });
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    void (async () => {
      viewer.imageryLayers.removeAll();
      const providers = await createLayerProviders(layerRef.current, Boolean(ionToken));
      providers.forEach((provider, index) => {
        const imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
        if (index === 1) {
          imageryLayer.alpha = 0.72;
        }
      });

      await applyTerrain(viewer, terrainEnabled);

      if (buildingsEnabled && ionToken) {
        try {
          buildingsRef.current = await createOsmBuildingsAsync();
          viewer.scene.primitives.add(buildingsRef.current);
        } catch {
          /* buildings optional */
        }
      }

      reportView();
    })();

    const packageEntity = viewer.entities.add({
      id: PACKAGE_ENTITY_ID,
      position: new CallbackPositionProperty(() => {
        const { lat, lng } = packagePositionRef.current;
        return Cartesian3.fromDegrees(lng, lat, 120);
      }, false),
      point: {
        pixelSize: 16,
        color: cssColor("#38bdf8"),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        heightReference: HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: "📬 LIVE",
        font: "bold 13px monospace",
        fillColor: Color.WHITE,
        outlineColor: cssColor("#0ea5e9"),
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -28),
        heightReference: HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      path: {
        show: true,
        width: 2,
        material: cssColor("#38bdf8", 0.55),
        leadTime: 0,
        trailTime: 180,
      },
      viewFrom: new Cartesian3(-6_500, -6_500, 4_500),
    });
    packageEntityRef.current = packageEntity;

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      packageEntityRef.current = null;
      buildingsRef.current = null;
    };
  }, [buildingsEnabled, onAltitudeChange, onCoordsChange, onUserInteract, terrainEnabled]);

  // Switch imagery layer
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let cancelled = false;
    void (async () => {
      const providers = await createLayerProviders(layer, Boolean(ionToken));
      if (cancelled) return;
      viewer.imageryLayers.removeAll();
      providers.forEach((provider, index) => {
        const imageryLayer: ImageryLayer = viewer.imageryLayers.addImageryProvider(provider);
        if (index === 1) {
          imageryLayer.alpha = 0.72;
        }
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [layer]);

  // Follow camera on live package
  useEffect(() => {
    const viewer = viewerRef.current;
    const entity = packageEntityRef.current;
    if (!viewer || !entity) return;

    if (followPackage && !userMovedRef.current) {
      viewer.trackedEntity = entity;
    } else if (!followPackage) {
      viewer.trackedEntity = undefined;
    }
  }, [currentLat, currentLng, followPackage]);

  // Route overlays
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.removeById(ROUTE_FULL_ID);
    viewer.entities.removeById(ROUTE_ACTIVE_ID);

    if (!route?.waypoints.length) return;

    const paths = buildRoutePaths(route);
    const fullPath = paths[0];
    if (fullPath) {
      const positions = fullPath.coords.flatMap(([lat, lng]) => [lng, lat]);
      viewer.entities.add({
        id: ROUTE_FULL_ID,
        polyline: {
          positions: Cartesian3.fromDegreesArray(positions),
          width: 4,
          material: cssColor("#64748b", 0.85),
          clampToGround: true,
          arcType: ArcType.GEODESIC,
        },
      });
    }

    const activePath = paths[1];
    if (activePath) {
      const positions = activePath.coords.flatMap(([lat, lng]) => [lng, lat]);
      viewer.entities.add({
        id: ROUTE_ACTIVE_ID,
        polyline: {
          positions: Cartesian3.fromDegreesArray(positions),
          width: 5,
          material: cssColor("#38bdf8", 0.95),
          clampToGround: true,
          arcType: ArcType.GEODESIC,
        },
      });
    }

    const stops = buildStopPoints(route);
    stops.forEach((stop, index) => {
      viewer.entities.add({
        id: `livetrack-stop-${index}`,
        position: Cartesian3.fromDegrees(stop.lng, stop.lat, 80),
        point: {
          pixelSize: 10 + stop.size * 18,
          color: stopColor(stop.color),
          outlineColor: Color.WHITE.withAlpha(0.9),
          outlineWidth: 1.5,
          heightReference: HeightReference.RELATIVE_TO_GROUND,
        },
        label: {
          text: stop.label,
          font: "11px monospace",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -16),
          heightReference: HeightReference.RELATIVE_TO_GROUND,
          showBackground: true,
          backgroundColor: cssColor("#0f172a", 0.72),
          backgroundPadding: new Cartesian2(8, 4),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 2_500_000),
        },
      });
    });

    if (fitRouteOnLoad && !fittedRouteRef.current) {
      fittedRouteRef.current = true;
      const positions = route.waypoints.map((w) => Cartesian3.fromDegrees(w.lng, w.lat, 800));
      const sphere = BoundingSphere.fromPoints(positions);
      viewer.camera.flyToBoundingSphere(sphere, {
        duration: 2.2,
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-38), sphere.radius * 2.8),
      });
    }

    return () => {
      viewer.entities.removeById(ROUTE_FULL_ID);
      viewer.entities.removeById(ROUTE_ACTIVE_ID);
      stops.forEach((_, index) => {
        viewer.entities.removeById(`livetrack-stop-${index}`);
      });
    };
  }, [fitRouteOnLoad, route]);

  return (
    <div
      ref={containerRef}
      className={`cesium-earth-view ${className ?? "h-full w-full"}`}
    />
  );
});
