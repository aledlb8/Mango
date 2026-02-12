import { ensureTools, startProcess } from "./utils";

async function main() {
  ensureTools(["bun", "pnpm"]);

  const children = [
    startProcess({ label: "identity-service", command: ["bun", "run", "dev"], cwd: "services/identity-service" }),
    startProcess({ label: "community-service", command: ["bun", "run", "dev"], cwd: "services/community-service" }),
    startProcess({ label: "messaging-service", command: ["bun", "run", "dev"], cwd: "services/messaging-service" }),
    startProcess({ label: "api-gateway", command: ["bun", "run", "dev"], cwd: "services/api-gateway" }),
    startProcess({ label: "web", command: ["pnpm", "dev"], cwd: "apps/web" })
  ];

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

  shutdown();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
