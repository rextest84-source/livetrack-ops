import app from "./app";
import { logger } from "./lib/logger";
import { ensureSeeded } from "./lib/seed.js";
import { startSimulation } from "./lib/simulation.js";
import { isServerlessRuntime } from "./lib/simulation.js";

export default app;

export async function startServer(): Promise<void> {
  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  await ensureSeeded();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port, serverless: isServerlessRuntime() }, "Server listening");

    if (!isServerlessRuntime()) {
      startSimulation();
    }
  });
}
