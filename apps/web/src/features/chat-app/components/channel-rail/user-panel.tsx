import type { User } from "@/lib/api"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "./theme-toggle"

type UserPanelProps = {
  me: User
  onSignOut: () => void
}

export function UserPanel(props: UserPanelProps) {
  return (
    <div className="flex items-center gap-2 border-t border-sidebar-border bg-sidebar-deep/50 px-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {props.me.displayName.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-sidebar-foreground">{props.me.displayName}</p>
        <p className="truncate text-[11px] text-muted-foreground">@{props.me.username}</p>
      </div>
      <ThemeToggle />
      <Button
        variant="sidebar-action"
        size="sidebar-action"
        onClick={props.onSignOut}
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  )
}
