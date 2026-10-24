"use server"

import { runAction } from "@/lib/actions"
import * as areas from "@/lib/services/areas"

type AreaInput = Parameters<typeof areas.createArea>[0]
type AreaPatch = Parameters<typeof areas.updateArea>[1]

export async function createAreaAction(input: AreaInput) {
  return runAction(() => areas.createArea(input))
}

export async function updateAreaAction(id: string, patch: AreaPatch) {
  return runAction(() => areas.updateArea(id, patch))
}

export async function setAreaArchivedAction(id: string, archived: boolean) {
  return runAction(() => areas.setAreaArchived(id, archived))
}

export async function moveAreaAction(id: string, direction: "up" | "down") {
  return runAction(() => areas.moveArea(id, direction))
}

export async function deleteAreaAction(id: string) {
  return runAction(() => areas.deleteArea(id))
}
