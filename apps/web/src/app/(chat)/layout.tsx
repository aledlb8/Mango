import type { ReactNode } from "react"
import { ChatAppShell } from "@/features/chat-app/chat-app-shell"
import { getSessionUser, requireAuth } from "@/lib/server-auth"

type ChatLayoutProps = {
  children: ReactNode
}

export default async function ChatLayout(props: ChatLayoutProps) {
  const token = await requireAuth()
  const me = await getSessionUser(token)

  return (
    <>
      <ChatAppShell initialToken={token} initialMe={me} />
      <div className="hidden">{props.children}</div>
    </>
  )
}
