import { existsSync } from "node:fs";
import { ensureTools, runCommand } from "./utils";

async function main() {
  ensureTools(["bun", "pnpm", "go"]);

  if (!Bun.which("docker")) {
    console.log("[infra] docker not found. You can still bootstrap code dependencies.");
    console.log("[infra] install Docker Desktop before running bun run dev.");
  }

  await runCommand({
    command: ["bun", "install"],
    label: "root"
  });

  await runCommand({
    command: ["pnpm", "install", "--dir", "apps/web"],
    label: "web"
  });

  await runCommand({
    command: ["go", "work", "sync"],
    label: "go"
  });

  if (Bun.which("uv") && existsSync("workers/moderation-worker/pyproject.toml")) {
    await runCommand({
      command: ["uv", "sync", "--project", "workers/moderation-worker"],
      label: "python"
    });
  } else {
    console.log("[python] uv not found or moderation worker not configured yet, skipping.");
  }

  console.log("Bootstrap complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
