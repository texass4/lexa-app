"use server"

import { runAction } from "@/lib/actions"
import * as projects from "@/lib/services/projects"

type ProjectInput = Parameters<typeof projects.createProject>[0]
type ProjectPatch = Parameters<typeof projects.updateProject>[1]

export async function createProjectAction(input: ProjectInput) {
  return runAction(() => projects.createProject(input))
}

export async function updateProjectAction(id: string, patch: ProjectPatch) {
  return runAction(() => projects.updateProject(id, patch))
}

export async function deleteProjectAction(id: string) {
  return runAction(() => projects.deleteProject(id))
}
