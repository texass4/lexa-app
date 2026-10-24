import { redirect } from "next/navigation"
import { getRequestContext } from "@/lib/context"

/** O diário abre sempre no dia de hoje (data local). */
export default async function JournalIndex() {
  const { today } = await getRequestContext()
  redirect(`/journal/${today}`)
}
