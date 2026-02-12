"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type AuthGateProps = {
  busyKey: string | null
  registerEmail: string
  registerUsername: string
  registerDisplayName: string
  registerPassword: string
  loginIdentifier: string
  loginPassword: string
  onRegister: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onLogin: (event: FormEvent<HTMLFormElement>) => Promise<void>
  setRegisterEmail: (value: string) => void
  setRegisterUsername: (value: string) => void
  setRegisterDisplayName: (value: string) => void
  setRegisterPassword: (value: string) => void
  setLoginIdentifier: (value: string) => void
  setLoginPassword: (value: string) => void
  errorMessage: string | null
}

export function AuthGate(props: AuthGateProps) {
  const [tab, setTab] = useState<"login" | "register">("login")

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-primary">Mango</h1>
          <p className="mt-2 text-sm text-muted-foreground">Real-time community chat</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-6 flex rounded-lg bg-secondary p-1">
            <Button
              variant="ghost"
              size="sm"
              className={`flex-1 ${
                tab === "login"
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground"
              }`}
              onClick={() => setTab("login")}
            >
              Sign in
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`flex-1 ${
                tab === "register"
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground"
              }`}
              onClick={() => setTab("register")}
            >
              Create account
            </Button>
          </div>

          {tab === "login" ? (
            <form className="space-y-4" onSubmit={props.onLogin}>
              <div className="space-y-2">
                <Label htmlFor="login-identifier">Email or username</Label>
                <Input
                  id="login-identifier"
                  value={props.loginIdentifier}
                  onChange={(e) => props.setLoginIdentifier(e.target.value)}
                  placeholder="alex_dev or name@domain.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={props.loginPassword}
                  onChange={(e) => props.setLoginPassword(e.target.value)}
                  placeholder="Your password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={props.busyKey === "login"}>
                {props.busyKey === "login" ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={props.onRegister}>
              <div className="space-y-2">
                <Label htmlFor="register-display-name">Display name</Label>
                <Input
                  id="register-display-name"
                  value={props.registerDisplayName}
                  onChange={(e) => props.setRegisterDisplayName(e.target.value)}
                  placeholder="Alex"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-username">Username</Label>
                <Input
                  id="register-username"
                  value={props.registerUsername}
                  onChange={(e) => props.setRegisterUsername(e.target.value)}
                  placeholder="alex_dev"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-email">Email</Label>
                <Input
                  id="register-email"
                  type="email"
                  value={props.registerEmail}
                  onChange={(e) => props.setRegisterEmail(e.target.value)}
                  placeholder="name@domain.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">Password</Label>
                <Input
                  id="register-password"
                  type="password"
                  value={props.registerPassword}
                  onChange={(e) => props.setRegisterPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={props.busyKey === "register"}>
                {props.busyKey === "register" ? "Creating account..." : "Create account"}
              </Button>
            </form>
          )}

          {props.errorMessage && (
            <p className="mt-4 text-center text-sm text-destructive">{props.errorMessage}</p>
          )}
        </div>
      </div>
    </main>
  )
}
