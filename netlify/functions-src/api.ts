import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import serverless from "serverless-http";

process.env.NETLIFY = "true";
process.env.SERVERLESS = "true";
process.env.NODE_ENV = process.env.NODE_ENV ?? "production";

type ServerlessHandler = ReturnType<typeof serverless>;

let cachedHandler: ServerlessHandler | null = null;

async function getHandler(): Promise<ServerlessHandler> {
  if (cachedHandler) return cachedHandler;

  const { default: app } = await import("../../artifacts/api-server/src/app.js");
  cachedHandler = serverless(app, {
    binary: ["image/*", "application/octet-stream"],
  });
  return cachedHandler;
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext,
) => {
  (context as HandlerContext & { callbackWaitsForEmptyEventLoop?: boolean })
    .callbackWaitsForEmptyEventLoop = false;

  const serverlessHandler = await getHandler();

  let path = event.path;
  if (path.startsWith("/.netlify/functions/api")) {
    path = `/api${path.slice("/.netlify/functions/api".length)}`;
  }

  return serverlessHandler(
    {
      ...event,
      path,
      rawPath: path,
    },
    context,
  );
};
