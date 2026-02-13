import { useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") {
      return true
    }
    return document.documentElement.classList.contains("dark")
  })

  function toggle() {
    const next = !isDark
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("mango-theme", next ? "dark" : "light")
    setIsDark(next)
  }

  return (
    <Button
      variant="sidebar-action"
      size="sidebar-action"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
