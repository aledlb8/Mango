import { ChatAppShell } from "@/features/chat-app/chat-app-shell"

type DmPageProps = {
  params: Promise<{
    threadId: string
  }>
}

export default async function DmPage(props: DmPageProps) {
  const params = await props.params

  return <ChatAppShell route={{ kind: "dm", threadId: params.threadId }} />
}
