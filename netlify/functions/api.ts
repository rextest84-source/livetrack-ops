import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import serverless from "serverless-http";
import app from "../../artifacts/api-server/src/app.js";
import { ensureSeeded } from "../../artifacts/api-server/src/lib/seed.js";

process.env.NETLIFY = "true";

const serverlessHandler = serverless(app, {
  binary: ["image/*", "application/octet-stream"],
});

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext,
) => {
  (context as HandlerContext & { callbackWaitsForEmptyEventLoop?: boolean })
    .callbackWaitsForEmptyEventLoop = false;

  await ensureSeeded();

  const path = event.path.replace(/^\/\.netlify\/functions\/api/, "/api");
  return serverlessHandler(
    {
      ...event,
      path,
      rawPath: path,
    },
    context,
  );
};
