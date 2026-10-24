"use server"

import { runAction } from "@/lib/actions"
import { getRequestContext } from "@/lib/context"
import type { TaskStatus } from "@/lib/domain/tasks"
import * as tasks from "@/lib/services/tasks"
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validation"

export async function createTaskAction(input: CreateTaskInput) {
  return runAction(() => tasks.createTask(input))
}

export async function updateTaskAction(id: string, patch: UpdateTaskInput) {
  return runAction(async () => tasks.updateTask(id, patch, { today: (await getRequestContext()).today }))
}

export async function setTaskStatusAction(id: string, status: TaskStatus) {
  return runAction(async () => tasks.setTaskStatus(id, status, { today: (await getRequestContext()).today }))
}

export async function moveTaskAction(id: string, move: { status: TaskStatus; beforeId?: string | null; afterId?: string | null }) {
  return runAction(async () => tasks.moveTask(id, move, { today: (await getRequestContext()).today }))
}

export async function deleteTaskAction(id: string) {
  return runAction(() => tasks.deleteTask(id))
}

export async function addSubtaskAction(taskId: string, title: string) {
  return runAction(() => tasks.addSubtask(taskId, { title }))
}

export async function updateSubtaskAction(id: string, patch: { title?: string; done?: boolean }) {
  return runAction(() => tasks.updateSubtask(id, patch))
}

export async function deleteSubtaskAction(id: string) {
  return runAction(() => tasks.deleteSubtask(id))
}

export async function renameTagAction(id: string, name: string) {
  return runAction(() => tasks.renameTag(id, name))
}

export async function deleteTagAction(id: string) {
  return runAction(() => tasks.deleteTag(id))
}
