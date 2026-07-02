import type { Response } from "express";

interface SseClient {
  res: Response;
  trackingId: string;
}

const clients = new Map<string, Set<SseClient>>();

export function addSseClient(trackingId: string, res: Response): SseClient {
  const client: SseClient = { res, trackingId };
  if (!clients.has(trackingId)) {
    clients.set(trackingId, new Set());
  }
  clients.get(trackingId)!.add(client);
  broadcastViewers(trackingId);
  return client;
}

export function removeSseClient(trackingId: string, client: SseClient): void {
  const group = clients.get(trackingId);
  if (group) {
    group.delete(client);
    if (group.size === 0) {
      clients.delete(trackingId);
    } else {
      broadcastViewers(trackingId);
    }
  }
}

export function getViewerCount(trackingId: string): number {
  return clients.get(trackingId)?.size ?? 0;
}

export function broadcastToPackage(
  trackingId: string,
  eventName: string,
  data: unknown,
): void {
  const group = clients.get(trackingId);
  if (!group || group.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of group) {
    try {
      client.res.write(payload);
    } catch {
      // client disconnected mid-write — will be cleaned up via close event
    }
  }
}

export function broadcastViewers(trackingId: string): void {
  const count = getViewerCount(trackingId);
  broadcastToPackage(trackingId, "viewers", { trackingId, viewers: count });
}

export function sendSseEvent(
  res: Response,
  eventName: string,
  data: unknown,
): void {
  res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
}
