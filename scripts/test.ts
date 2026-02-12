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

async function hasBunTests(project: string): Promise<boolean> {
  const patterns = [
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.test.js",
    "**/*.test.jsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "**/*.spec.js",
    "**/*.spec.jsx"
  ];

  for (const pattern of patterns) {
    for await (const _ of new Bun.Glob(pattern).scan({ cwd: project })) {
      return true;
    }
  }

  return false;
}

async function main() {
  for (const project of tsProjects) {
    if (!(await hasBunTests(project))) {
      console.log(`[${project}] no test files found, skipping.`);
      continue;
    }

    await runCommand({
      command: ["bun", "run", "test"],
      cwd: project,
      label: project
    });
  }

  for (const project of goProjects) {
    await runCommand({
      command: ["go", "test", "./..."],
      cwd: project,
      label: project
    });
  }

  await runCommand({
    command: ["pnpm", "--dir", "apps/web", "test"],
    label: "apps/web"
  });

  console.log("Tests complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
