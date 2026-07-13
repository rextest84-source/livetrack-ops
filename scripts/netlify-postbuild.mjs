import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.DATABASE_URL) {
  console.log("Applying database schema...");
  const result = spawnSync("pnpm", ["--filter", "@workspace/db", "run", "push"], {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    console.warn(
      "Database schema push failed during build. The API will still deploy; ensure tables exist in Railway.",
    );
  }
} else {
  console.warn("DATABASE_URL is not set — skipping database schema push.");
}
