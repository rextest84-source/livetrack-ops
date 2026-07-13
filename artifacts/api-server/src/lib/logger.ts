import pino from "pino";

// Plain JSON logging only — pino-pretty breaks Netlify/serverless bundles.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
});
