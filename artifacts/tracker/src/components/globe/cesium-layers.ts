import {
  Credit,
  IonImageryProvider,
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

/** Only use Cesium Ion when a real token is configured (not empty/placeholder). */
export function hasValidIonToken(): boolean {
  const token = (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined)?.trim();
  if (!token) return false;
  if (token === "your_token_here" || token === "placeholder") return false;
  return token.length >= 20;
}

function esriTiles(url: string, credit: string, maxLevel = 19): ImageryProvider {
  return new UrlTemplateImageryProvider({
    url,
    credit: new Credit(credit),
    maximumLevel: maxLevel,
  });
}

async function ionOrEsri(
  assetId: number,
  fallback: ImageryProvider,
): Promise<ImageryProvider> {
  if (!hasValidIonToken()) return fallback;
  try {
    return await IonImageryProvider.fromAssetId(assetId);
  } catch {
    return fallback;
  }
}

export function createSatelliteProvider(): Promise<ImageryProvider> {
  return ionOrEsri(
    2,
    esriTiles(ESRI_SATELLITE, "Esri, Maxar, Earthstar Geographics"),
  );
}

export function createStreetProvider(): Promise<ImageryProvider> {
  return ionOrEsri(
    4,
    esriTiles(ESRI_STREETS, "Esri, OpenStreetMap contributors"),
  );
}

export async function createHybridProviders(): Promise<ImageryProvider[]> {
  const base = await createSatelliteProvider();
  const labels = esriTiles(ESRI_LABELS, "Esri, OpenStreetMap contributors");
  return [base, labels];
}

export async function createLayerProviders(
  layer: GlobeLayer,
): Promise<ImageryProvider[]> {
  switch (layer) {
    case "satellite":
      return [await createSatelliteProvider()];
    case "street":
      return [await createStreetProvider()];
    case "hybrid":
      return createHybridProviders();
    default:
      return [await createSatelliteProvider()];
  }
}
