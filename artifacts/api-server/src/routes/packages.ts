import { Router, type IRouter } from "express";
import { db, packagesTable, trackingEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
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
import { getRouteData } from "../lib/simulation.js";

const router: IRouter = Router();

// GET /packages
router.get("/packages", async (_req, res): Promise<void> => {
  const packages = await db.select().from(packagesTable);
  res.json(packages);
});

// GET /packages/:trackingId
router.get("/packages/:trackingId", async (req, res): Promise<void> => {
  const parsed = GetPackageParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [pkg] = await db
    .select()
    .from(packagesTable)
    .where(eq(packagesTable.trackingId, parsed.data.trackingId));
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
  const [pkg] = await db
    .select()
    .from(packagesTable)
    .where(eq(packagesTable.trackingId, parsed.data.trackingId));
  if (!pkg) {
    res.status(404).json({ error: "Package not found" });
    return;
  }
  const events = await db
    .select()
    .from(trackingEventsTable)
    .where(eq(trackingEventsTable.trackingId, parsed.data.trackingId))
    .orderBy(desc(trackingEventsTable.timestamp))
    .limit(50);
  res.json(
    events.map((e) => ({
      ...e,
      timestamp: e.timestamp.toISOString(),
    }))
  );
});

// GET /packages/:trackingId/stream  — SSE
router.get("/packages/:trackingId/stream", async (req, res): Promise<void> => {
  const trackingId = Array.isArray(req.params.trackingId)
    ? req.params.trackingId[0]
    : req.params.trackingId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const client = addSseClient(trackingId, res);

  // Send initial state
  try {
    const [pkg] = await db
      .select()
      .from(packagesTable)
      .where(eq(packagesTable.trackingId, trackingId));
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

  // Heartbeat
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
