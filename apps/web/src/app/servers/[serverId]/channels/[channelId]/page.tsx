import { ChatAppShell } from "@/features/chat-app/chat-app-shell"

type ChannelPageProps = {
  params: Promise<{
    serverId: string
    channelId: string
  }>
}

export default async function ChannelPage(props: ChannelPageProps) {
  const params = await props.params

  return (
    <ChatAppShell
      route={{
        kind: "server",
        serverId: params.serverId,
        channelId: params.channelId
      }}
    />
  )
}
