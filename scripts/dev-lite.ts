import { ensureTools, startProcess } from "./utils";

async function main() {
  ensureTools(["bun", "pnpm"]);

  const children = [
    startProcess({ label: "identity-service", command: ["bun", "--watch", "services/identity-service/src/index.ts"] }),
    startProcess({ label: "community-service", command: ["bun", "--watch", "services/community-service/src/index.ts"] }),
    startProcess({ label: "messaging-service", command: ["bun", "--watch", "services/messaging-service/src/index.ts"] }),
    startProcess({ label: "api-gateway", command: ["bun", "--watch", "services/api-gateway/src/index.ts"] }),
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
