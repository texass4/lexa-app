"use server"

import { runAction } from "@/lib/actions"
import * as journal from "@/lib/services/journal"

export async function deleteEntryAction(id: string) {
  return runAction(() => journal.deleteEntry(id))
}
