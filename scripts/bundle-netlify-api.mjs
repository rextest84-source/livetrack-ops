import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { mkdir, rm } from "node:fs/promises";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionsDir = path.resolve(rootDir, "netlify/functions");
const outfile = path.resolve(functionsDir, "api.js");

await rm(outfile, { force: true });
await mkdir(functionsDir, { recursive: true });

await esbuild({
  entryPoints: [path.resolve(rootDir, "netlify/functions-src/api.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  logLevel: "info",
  mainFields: ["module", "main"],
  conditions: ["import", "module", "default"],
  external: [
    "express",
    "cors",
    "serverless-http",
    "cookie-parser",
    "body-parser",
    "pg",
    "pg-native",
    "pg-pool",
    "pg-connection-string",
    "pg-protocol",
    "pg-types",
    "pg-int8",
    "pgpass",
    "postgres-array",
    "postgres-bytea",
    "postgres-date",
    "postgres-interval",
    "xtend",
  ],
});

console.log(`Netlify API function bundled to ${outfile}`);
