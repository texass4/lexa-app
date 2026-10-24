"use server"

import { runAction } from "@/lib/actions"
import { getRequestContext } from "@/lib/context"
import * as inbox from "@/lib/services/inbox"

export async function captureAction(content: string, kind?: "note" | "task" | "idea") {
  return runAction(() => inbox.capture({ content, kind }))
}

export async function convertToTaskAction(id: string, overrides: { dueDate?: string | null; projectId?: string | null; areaId?: string | null } = {}) {
  return runAction(async () => {
    const task = await inbox.convertToTask(id, overrides)
    return { id: task.id, title: task.title }
  })
}

export async function convertToPageAction(id: string) {
  return runAction(async () => {
    const page = await inbox.convertToPage(id)
    return { id: page.id, title: page.title }
  })
}

export async function moveToJournalAction(id: string) {
  return runAction(async () => inbox.moveToJournal(id, (await getRequestContext()).today))
}

export async function dismissInboxItemAction(id: string) {
  return runAction(() => inbox.dismissInboxItem(id))
}

export async function restoreInboxItemAction(id: string) {
  return runAction(() => inbox.restoreInboxItem(id))
}

export async function updateInboxItemAction(id: string, content: string) {
  return runAction(() => inbox.updateInboxItem(id, content))
}

export async function deleteInboxItemAction(id: string) {
  return runAction(() => inbox.deleteInboxItem(id))
}
