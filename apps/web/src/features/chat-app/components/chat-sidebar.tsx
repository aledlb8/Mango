import { useState, type FormEvent } from "react"
import type { Server, User } from "@/lib/api"
import { Plus, Home, LogOut, Copy, Crown, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"

type ChatSidebarProps = {
  me: User
  busyKey: string | null
  servers: Server[]
  selectedServerId: string | null
  serverName: string
  inviteCode: string
  onSelectHome: () => void
  onSelectServer: (serverId: string) => void
  setServerName: (value: string) => void
  setInviteCode: (value: string) => void
  onCreateServer: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onJoinServer: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onLeaveServer: (serverId: string) => Promise<void>
  onDeleteServer: (serverId: string) => Promise<void>
  copyToClipboard: (text: string) => void
}

const SERVER_COLORS = [
  "bg-red-600", "bg-orange-600", "bg-amber-600", "bg-yellow-600",
  "bg-lime-600", "bg-green-600", "bg-emerald-600", "bg-teal-600",
  "bg-cyan-600", "bg-sky-600", "bg-blue-600", "bg-indigo-600",
  "bg-violet-600", "bg-purple-600", "bg-fuchsia-600", "bg-pink-600",
]

function getServerColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return SERVER_COLORS[Math.abs(hash) % SERVER_COLORS.length]!
}

export function ChatSidebar(props: ChatSidebarProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [leaveTargetServer, setLeaveTargetServer] = useState<Server | null>(null)
  const [deleteTargetServer, setDeleteTargetServer] = useState<Server | null>(null)

  async function confirmLeaveServer(): Promise<void> {
    if (!leaveTargetServer) {
      return
    }

    const server = leaveTargetServer
    setLeaveTargetServer(null)
    await props.onLeaveServer(server.id)
  }

  async function confirmDeleteServer(): Promise<void> {
    if (!deleteTargetServer) {
      return
    }

    const server = deleteTargetServer
    setDeleteTargetServer(null)
    await props.onDeleteServer(server.id)
  }

  return (
    <>
      <nav className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 bg-sidebar-deep py-3">
        {/* Home */}
        <div className="group relative flex w-full justify-center">
          <span
            className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-foreground transition-all duration-200 ${
              props.selectedServerId === null ? "h-10" : "h-0 group-hover:h-5"
            }`}
          />
          <Button
            variant="ghost"
            className={`h-12 w-12 shrink-0 p-0 transition-all duration-200 ${
              props.selectedServerId === null
                ? "rounded-[16px] bg-primary text-primary-foreground hover:bg-primary/90"
                : "rounded-[24px] bg-secondary text-secondary-foreground hover:rounded-[16px] hover:bg-primary hover:text-primary-foreground"
            }`}
            onClick={props.onSelectHome}
            title="Home"
          >
            <Home className="h-5 w-5" />
          </Button>
        </div>

        <div className="mx-auto h-[2px] w-8 rounded-full bg-border" />

        {/* Servers */}
        <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto py-1">
          {props.servers.map((server) => {
            const isActive = props.selectedServerId === server.id
            const isOwner = server.ownerId === props.me.id
            return (
              <ContextMenu key={server.id}>
                <ContextMenuTrigger asChild>
                  <div className="group relative flex w-full justify-center">
                    <span
                      className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-foreground transition-all duration-200 ${
                        isActive ? "h-10" : "h-0 group-hover:h-5"
                      }`}
                    />
                    <Button
                      variant="ghost"
                      className={`relative h-12 w-12 shrink-0 p-0 text-sm font-semibold transition-all duration-200 ${
                        isActive
                          ? `rounded-[16px] ${getServerColor(server.name)} text-white hover:opacity-90`
                          : "rounded-[24px] bg-secondary text-secondary-foreground hover:rounded-[16px] hover:bg-primary/80 hover:text-white"
                      }`}
                      onClick={() => props.onSelectServer(server.id)}
                      title={server.name}
                    >
                      {server.name.charAt(0).toUpperCase()}
                      {isOwner ? (
                        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-amber-400 p-0.5 text-black">
                          <Crown className="h-2.5 w-2.5" />
                        </span>
                      ) : null}
                    </Button>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {isOwner ? (
                    <ContextMenuItem
                      destructive
                      disabled={props.busyKey === "server-delete"}
                      onClick={() => setDeleteTargetServer(server)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Server
                    </ContextMenuItem>
                  ) : (
                    <ContextMenuItem
                      disabled={props.busyKey === "server-leave"}
                      onClick={() => setLeaveTargetServer(server)}
                    >
                      <LogOut className="h-4 w-4" />
                      Leave Server
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => props.copyToClipboard(server.id)}>
                    <Copy className="h-4 w-4" />
                    Copy Server ID
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
        </div>

        {/* Add server */}
        <div className="mx-auto h-[2px] w-8 rounded-full bg-border" />
        <div className="relative">
          <Button
            variant="ghost"
            className="h-12 w-12 shrink-0 rounded-[24px] bg-secondary p-0 text-green-500 transition-all duration-200 hover:rounded-[16px] hover:bg-green-600 hover:text-white"
            onClick={() => setShowAdd(!showAdd)}
            title="Add a server"
          >
            <Plus className="h-5 w-5" />
          </Button>

          {showAdd && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowAdd(false)} role="presentation" />
              <div className="absolute bottom-0 left-[calc(100%+8px)] z-50 w-72 rounded-lg border bg-card p-4 shadow-xl">
                <p className="mb-3 text-sm font-semibold">Create a server</p>
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    void props.onCreateServer(e)
                    setShowAdd(false)
                  }}
                >
                  <Input
                    value={props.serverName}
                    onChange={(e) => props.setServerName(e.target.value)}
                    placeholder="Server name"
                    required
                    autoFocus
                  />
                  <Button type="submit" size="sm" className="w-full" disabled={props.busyKey === "server-create"}>
                    {props.busyKey === "server-create" ? "Creating..." : "Create"}
                  </Button>
                </form>

                <div className="my-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <p className="mb-2 text-sm font-semibold">Join by invite</p>
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    void props.onJoinServer(e)
                    setShowAdd(false)
                  }}
                >
                  <Input
                    value={props.inviteCode}
                    onChange={(e) => props.setInviteCode(e.target.value)}
                    placeholder="Invite code"
                    required
                  />
                  <Button type="submit" size="sm" variant="secondary" className="w-full" disabled={props.busyKey === "server-join"}>
                    {props.busyKey === "server-join" ? "Joining..." : "Join Server"}
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </nav>

      <AlertDialog open={Boolean(leaveTargetServer)} onOpenChange={(open) => !open && setLeaveTargetServer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Server?</AlertDialogTitle>
            <AlertDialogDescription>
              {leaveTargetServer ? `You will leave "${leaveTargetServer.name}".` : "You will leave this server."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant="destructive"
                disabled={props.busyKey === "server-leave"}
                onClick={() => void confirmLeaveServer()}
              >
                Leave Server
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteTargetServer)} onOpenChange={(open) => !open && setDeleteTargetServer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Server?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargetServer
                ? `Deleting "${deleteTargetServer.name}" is permanent and removes channels and messages.`
                : "Deleting this server is permanent."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant="destructive"
                disabled={props.busyKey === "server-delete"}
                onClick={() => void confirmDeleteServer()}
              >
                Delete Server
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
