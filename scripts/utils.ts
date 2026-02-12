type Cmd = {
  command: string[];
  cwd?: string;
  label?: string;
};

export function ensureTools(tools: string[]): void {
  for (const tool of tools) {
    if (!Bun.which(tool)) {
      throw new Error(`Missing required tool: ${tool}`);
    }
  }
}

export async function runCommand({ command, cwd, label }: Cmd): Promise<void> {
  const prefix = label ? `[${label}] ` : "";
  console.log(`${prefix}$ ${command.join(" ")}`);

  const proc = Bun.spawn(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit"
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${prefix}command failed with exit code ${exitCode}`);
  }
}

export function startProcess({ command, cwd, label }: Cmd): {
  label: string;
  proc: Bun.Subprocess<"inherit", "inherit", "inherit">;
} {
  const processLabel = label ?? command[0];
  console.log(`[start:${processLabel}] ${command.join(" ")}`);

  const proc = Bun.spawn(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit"
  });

  return { label: processLabel, proc };
}
