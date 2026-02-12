import { readdir } from "node:fs/promises"
import path from "node:path"
import type { SQL } from "bun"

export async function runMigrations(sql: SQL, migrationsDir: string): Promise<number> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))

  let appliedCount = 0

  for (const file of files) {
    const existing = await sql`SELECT 1 FROM schema_migrations WHERE id = ${file} LIMIT 1`
    if (existing.length > 0) {
      continue
    }

    const migrationPath = path.join(migrationsDir, file)
    const migrationSql = await Bun.file(migrationPath).text()

    await sql.begin(async (tx) => {
      await tx.unsafe(migrationSql)
      await tx`INSERT INTO schema_migrations (id) VALUES (${file})`
    })

    appliedCount += 1
  }

  return appliedCount
}
