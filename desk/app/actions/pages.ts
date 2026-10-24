"use server"

import { runAction } from "@/lib/actions"
import * as pages from "@/lib/services/pages"

type PageMeta = Parameters<typeof pages.updatePageMeta>[1]

export async function createPageAction(input: PageMeta = {}) {
  return runAction(async () => {
    const page = await pages.createPage(input)
    return { id: page.id }
  })
}

export async function updatePageMetaAction(id: string, meta: PageMeta) {
  return runAction(async () => {
    const page = await pages.updatePageMeta(id, meta)
    return { title: page.title, updatedAt: page.updatedAt }
  })
}

export async function setPageArchivedAction(id: string, archived: boolean) {
  return runAction(() => pages.setPageArchived(id, archived))
}

export async function deletePageAction(id: string) {
  return runAction(() => pages.deletePage(id))
}
