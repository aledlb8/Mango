import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { User } from "@/lib/api"

const TOKEN_COOKIE = "mango_token"
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"

export async function requireAuth(): Promise<string> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TOKEN_COOKIE)?.value
  if (!token) {
    redirect("/auth")
  }

  return token
}

export async function requireGuest(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TOKEN_COOKIE)?.value
  if (token) {
    redirect("/friends")
  }
}

export async function resolveHomePath(): Promise<string> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TOKEN_COOKIE)?.value
  return token ? "/friends" : "/auth"
}

export async function getSessionUser(token: string): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/v1/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      cache: "no-store"
    })

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as User | null
    if (!payload?.id) {
      return null
    }

    return payload
  } catch {
    return null
  }
}
