import { runCommand } from "./utils";

const tsProjects = [
  "services/api-gateway",
  "services/identity-service",
  "services/community-service",
  "services/messaging-service",
  "services/media-service",
  "workers/notification-worker",
  "packages/contracts",
  "packages/ui",
  "packages/config"
];

const goProjects = [
  "services/realtime-gateway",
  "services/presence-service",
  "services/voice-signaling"
];

async function main() {
  for (const project of tsProjects) {
    await runCommand({
      command: ["bun", "run", "lint"],
      cwd: project,
      label: project
    });
  }

  for (const project of goProjects) {
    await runCommand({
      command: ["go", "vet", "./..."],
      cwd: project,
      label: project
    });
  }

  await runCommand({
    command: ["pnpm", "--dir", "apps/web", "lint"],
    label: "apps/web"
  });

  console.log("Lint complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
