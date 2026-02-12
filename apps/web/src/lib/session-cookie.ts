const TOKEN_COOKIE = "mango_token"
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function getTokenFromCookie(): string | null {
  if (typeof document === "undefined") {
    return null
  }

  const pairs = document.cookie.split(";").map((item) => item.trim())
  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=")
    if (key !== TOKEN_COOKIE) {
      continue
    }

    const value = rest.join("=")
    return value ? decodeCookieValue(value) : null
  }

  return null
}

export function setTokenCookie(token: string): void {
  if (typeof document === "undefined") {
    return
  }

  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${TOKEN_TTL_SECONDS}; SameSite=Lax`
}

export function clearTokenCookie(): void {
  if (typeof document === "undefined") {
    return
  }

  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}
