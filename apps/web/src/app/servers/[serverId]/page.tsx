import { ChatAppShell } from "@/features/chat-app/chat-app-shell"

type ServerPageProps = {
  params: Promise<{
    serverId: string
  }>
}

export default async function ServerPage(props: ServerPageProps) {
  const params = await props.params

  return <ChatAppShell route={{ kind: "server", serverId: params.serverId }} />
}
