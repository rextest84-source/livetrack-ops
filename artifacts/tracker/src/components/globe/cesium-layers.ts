import {
  Credit,
  IonImageryProvider,
  OpenStreetMapImageryProvider,
  UrlTemplateImageryProvider,
  type ImageryProvider,
} from "cesium";
import type { GlobeLayer } from "./globe-config";

export const LAYER_LABELS: Record<GlobeLayer, string> = {
  satellite: "Satellite",
  street: "Street",
  hybrid: "Hybrid",
};

const ESRI_SATELLITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const ESRI_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

const ESRI_STREETS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";

function esriTiles(url: string, credit: string, maxLevel = 19): ImageryProvider {
  return new UrlTemplateImageryProvider({
    url,
    credit: new Credit(credit),
    maximumLevel: maxLevel,
  });
}

/** High-resolution satellite tiles — stay sharp when zoomed in. */
export function createSatelliteProvider(useIon: boolean): Promise<ImageryProvider> {
  if (useIon) {
    return IonImageryProvider.fromAssetId(2);
  }
  return Promise.resolve(esriTiles(ESRI_SATELLITE, "Esri, Maxar, Earthstar Geographics"));
}

/** Street map with roads, cities, and labels. */
export function createStreetProvider(useIon: boolean): Promise<ImageryProvider> {
  if (useIon) {
    return IonImageryProvider.fromAssetId(4);
  }
  return Promise.resolve(esriTiles(ESRI_STREETS, "Esri, OpenStreetMap contributors"));
}

/** Satellite base with transparent label overlay — Google Earth hybrid style. */
export async function createHybridProviders(
  useIon: boolean,
): Promise<ImageryProvider[]> {
  const base = await createSatelliteProvider(useIon);
  const labels = esriTiles(ESRI_LABELS, "Esri, OpenStreetMap contributors");
  return [base, labels];
}

export async function createLayerProviders(
  layer: GlobeLayer,
  useIon: boolean,
): Promise<ImageryProvider[]> {
  switch (layer) {
    case "satellite":
      return [await createSatelliteProvider(useIon)];
    case "street":
      return [await createStreetProvider(useIon)];
    case "hybrid":
      return createHybridProviders(useIon);
    default:
      return [await createSatelliteProvider(useIon)];
  }
}

/** Fallback street tiles when Ion is unavailable. */
export function createOsmProvider(): ImageryProvider {
  return new OpenStreetMapImageryProvider({
    url: "https://tile.openstreetmap.org/",
  });
}
