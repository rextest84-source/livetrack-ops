import { Router, type IRouter } from "express";
import {
  GetPackageParams,
  GetPackageRouteParams,
  GetPackageViewersParams,
  GetPackageHistoryParams,
} from "@workspace/api-zod";
import {
  addSseClient,
  removeSseClient,
  getViewerCount,
  sendSseEvent,
} from "../lib/sse.js";
import { getRouteData, isServerlessRuntime } from "../lib/simulation.js";
import {
  getPackageByTrackingId,
  getPackageHistory,
  listPackages,
} from "../lib/package-store.js";
import { isKnownTrackingId } from "../lib/demo-packages.js";

const router: IRouter = Router();

// GET /packages
router.get("/packages", async (_req, res): Promise<void> => {
  const packages = await listPackages();
  res.json(packages);
});

// GET /packages/:trackingId
router.get("/packages/:trackingId", async (req, res): Promise<void> => {
  const parsed = GetPackageParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const pkg = await getPackageByTrackingId(parsed.data.trackingId);
  if (!pkg) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  res.json(pkg);
});

// GET /packages/:trackingId/route
router.get("/packages/:trackingId/route", async (req, res): Promise<void> => {
  const parsed = GetPackageRouteParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const routeData = getRouteData(parsed.data.trackingId);
  if (!routeData) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  res.json({ trackingId: parsed.data.trackingId, ...routeData });
});

// GET /packages/:trackingId/viewers
router.get("/packages/:trackingId/viewers", async (req, res): Promise<void> => {
  const parsed = GetPackageViewersParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!isKnownTrackingId(parsed.data.trackingId)) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  res.json({
    trackingId: parsed.data.trackingId,
    viewers: getViewerCount(parsed.data.trackingId),
  });
});

// GET /packages/:trackingId/history
router.get("/packages/:trackingId/history", async (req, res): Promise<void> => {
  const parsed = GetPackageHistoryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const history = await getPackageHistory(parsed.data.trackingId);
  if (history === null) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  res.json(history);
});

// GET /packages/:trackingId/stream  — SSE (local dev only; Netlify uses polling)
router.get("/packages/:trackingId/stream", async (req, res): Promise<void> => {
  if (isServerlessRuntime()) {
    res.status(501).json({
      error: "Live streaming is unavailable in serverless mode. Use polling instead.",
    });
    return;
  }

  const trackingId = Array.isArray(req.params.trackingId)
    ? req.params.trackingId[0]
    : req.params.trackingId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const client = addSseClient(trackingId, res);

  try {
    const pkg = await getPackageByTrackingId(trackingId);
    if (pkg) {
      sendSseEvent(res, "location", {
        lat: pkg.currentLat,
        lng: pkg.currentLng,
        progressPct: pkg.progressPct,
        currentLocationName: pkg.currentLocationName,
      });
      sendSseEvent(res, "status", { status: pkg.status });
    }
  } catch {
    // non-fatal
  }

  sendSseEvent(res, "viewers", {
    trackingId,
    viewers: getViewerCount(trackingId),
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSseClient(trackingId, client);
  });
});

export default router;
