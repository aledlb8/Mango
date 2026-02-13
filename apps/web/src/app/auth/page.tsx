import { requireGuest } from "@/lib/server-auth"
import { AuthPageClient } from "./page-client"

export default async function AuthPage() {
  await requireGuest()
  return <AuthPageClient />
}
