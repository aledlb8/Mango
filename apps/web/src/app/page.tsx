import { redirect } from "next/navigation"
import { resolveHomePath } from "@/lib/server-auth"

export default async function HomePage() {
  redirect(await resolveHomePath())
}
