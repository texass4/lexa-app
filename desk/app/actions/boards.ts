"use server"

import { runAction } from "@/lib/actions"
import * as boards from "@/lib/services/boards"

type BoardInput = Parameters<typeof boards.createBoard>[0]

export async function createBoardAction(input: BoardInput = {}) {
  return runAction(async () => {
    const board = await boards.createBoard(input)
    return { id: board.id }
  })
}

export async function updateBoardMetaAction(id: string, input: BoardInput) {
  return runAction(() => boards.updateBoardMeta(id, input ?? {}))
}

export async function setBoardArchivedAction(id: string, archived: boolean) {
  return runAction(() => boards.setBoardArchived(id, archived))
}

export async function deleteBoardAction(id: string) {
  return runAction(() => boards.deleteBoard(id))
}
