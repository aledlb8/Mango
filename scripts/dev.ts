import { ensureTools, runCommand, startProcess } from "./utils";

type ProcSpec = {
  label: string;
  command: string[];
  cwd?: string;
};

async function main() {
  ensureTools(["bun", "pnpm", "go"]);
  if (!Bun.which("docker")) {
    throw new Error(
      "Missing required tool: docker. Install Docker Desktop to run local infrastructure."
    );
  }

  await runCommand({
    command: ["docker", "compose", "-f", "infra/docker-compose.yml", "up", "-d"],
    label: "infra"
  });

  const processSpecs: ProcSpec[] = [
    { label: "api-gateway", command: ["bun", "run", "dev"], cwd: "services/api-gateway" },
    { label: "identity-service", command: ["bun", "run", "dev"], cwd: "services/identity-service" },
    { label: "community-service", command: ["bun", "run", "dev"], cwd: "services/community-service" },
    { label: "messaging-service", command: ["bun", "run", "dev"], cwd: "services/messaging-service" },
    { label: "media-service", command: ["bun", "run", "dev"], cwd: "services/media-service" },
    { label: "notification-worker", command: ["bun", "run", "dev"], cwd: "workers/notification-worker" },
    { label: "realtime-gateway", command: ["go", "run", "."], cwd: "services/realtime-gateway" },
    { label: "presence-service", command: ["go", "run", "."], cwd: "services/presence-service" },
    { label: "voice-signaling", command: ["go", "run", "."], cwd: "services/voice-signaling" },
    { label: "web", command: ["pnpm", "dev"], cwd: "apps/web" }
  ];

  const children = processSpecs.map((spec) => startProcess(spec));

  const shutdown = () => {
    for (const child of children) {
      child.proc.kill();
    }
  };

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });

  const exits = children.map(async ({ label, proc }) => ({
    label,
    code: await proc.exited
  }));

  const firstExit = await Promise.race(exits);
  if (firstExit.code !== 0) {
    console.error(`[${firstExit.label}] exited with code ${firstExit.code}`);
    shutdown();
    process.exit(firstExit.code);
  }

  console.log(`[${firstExit.label}] exited cleanly`);
  shutdown();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
