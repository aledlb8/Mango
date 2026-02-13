"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ApiError, login, register } from "@/lib/api"
import { setTokenCookie } from "@/lib/session-cookie"
import { AuthGate } from "@/features/chat-app/components"

export function AuthPageClient() {
  const router = useRouter()

  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [registerEmail, setRegisterEmail] = useState("")
  const [registerUsername, setRegisterUsername] = useState("")
  const [registerDisplayName, setRegisterDisplayName] = useState("")
  const [registerPassword, setRegisterPassword] = useState("")

  const [loginIdentifier, setLoginIdentifier] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  async function handleRegister(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setBusyKey("register")
    setErrorMessage(null)

    try {
      const response = await register({
        email: registerEmail,
        username: registerUsername,
        displayName: registerDisplayName,
        password: registerPassword
      })

      setTokenCookie(response.token)
      router.replace("/friends")
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage("Registration failed.")
      }
    } finally {
      setBusyKey(null)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setBusyKey("login")
    setErrorMessage(null)

    try {
      const response = await login({
        identifier: loginIdentifier,
        password: loginPassword
      })

      setTokenCookie(response.token)
      router.replace("/friends")
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage("Login failed.")
      }
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <AuthGate
      busyKey={busyKey}
      registerEmail={registerEmail}
      registerUsername={registerUsername}
      registerDisplayName={registerDisplayName}
      registerPassword={registerPassword}
      loginIdentifier={loginIdentifier}
      loginPassword={loginPassword}
      onRegister={handleRegister}
      onLogin={handleLogin}
      setRegisterEmail={setRegisterEmail}
      setRegisterUsername={setRegisterUsername}
      setRegisterDisplayName={setRegisterDisplayName}
      setRegisterPassword={setRegisterPassword}
      setLoginIdentifier={setLoginIdentifier}
      setLoginPassword={setLoginPassword}
      errorMessage={errorMessage}
    />
  )
}
