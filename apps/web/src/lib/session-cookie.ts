const TOKEN_COOKIE = "mango_token"
const REFRESH_TOKEN_COOKIE = "mango_refresh_token"
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function getCookieValue(cookieName: string): string | null {
  if (typeof document === "undefined") {
    return null
  }

  const pairs = document.cookie.split(";").map((item) => item.trim())
  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=")
    if (key !== cookieName) {
      continue
    }

    const value = rest.join("=")
    return value ? decodeCookieValue(value) : null
  }

  return null
}

export function getTokenFromCookie(): string | null {
  return getCookieValue(TOKEN_COOKIE)
}

export function getRefreshTokenFromCookie(): string | null {
  return getCookieValue(REFRESH_TOKEN_COOKIE)
}

export function setTokenCookie(token: string): void {
  if (typeof document === "undefined") {
    return
  }

  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${TOKEN_TTL_SECONDS}; SameSite=Lax`
}

export function setRefreshTokenCookie(refreshToken: string): void {
  if (typeof document === "undefined") {
    return
  }

  document.cookie = `${REFRESH_TOKEN_COOKIE}=${encodeURIComponent(refreshToken)}; Path=/; Max-Age=${TOKEN_TTL_SECONDS}; SameSite=Lax`
}

export function setSessionCookies(token: string, refreshToken: string): void {
  setTokenCookie(token)
  setRefreshTokenCookie(refreshToken)
}

export function clearTokenCookie(): void {
  if (typeof document === "undefined") {
    return
  }

  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function clearRefreshTokenCookie(): void {
  if (typeof document === "undefined") {
    return
  }

  document.cookie = `${REFRESH_TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function clearSessionCookies(): void {
  clearTokenCookie()
  clearRefreshTokenCookie()
}
