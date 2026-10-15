"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import type { Editor } from "@tiptap/react"
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CloudOff,
  Copy,
  Ellipsis,
  FilePlus2,
  FileText,
  FolderInput,
  Link2,
  Loader2,
  Lock,
  Scale,
  Star,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Panel } from "@/components/ui/panel"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { NativeSelect } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TaskDetailSheet } from "@/components/tarefas/task-detail-sheet"
import { TaskFormDialog } from "@/components/tarefas/task-form-dialog"
import { useToggleTask } from "@/components/tarefas/task-row"
import { useSession } from "@/lib/auth/session"
import { getUser } from "@/lib/auth/account"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { describeRelated } from "@/lib/store/selectors"
import { fmtNumericDate, fmtRelative } from "@/lib/core/dates"
import {
  createPage,
  deletePage,
  fetchPage,
  fetchPageVersion,
  getSaver,
  setPageFavorite,
  updatePageMeta,
  usePages,
  type MetaPatch,
} from "@/lib/paginas/pages"
import {
  breadcrumb,
  canWritePage,
  descendants,
  EMPTY_DOC,
  moveTargets,
  pageHref,
  pageTitle,
  referencedTaskIds,
  type DocNode,
  type PageMeta,
  type PageRecord,
} from "@/lib/paginas/model"
import type { PageSaver, SaverSnapshot } from "@/lib/paginas/autosave"
import type { Task } from "@/types"
import { PageEditorContext, type PageEditorContextValue } from "./editor/editor-context"
import { NavToggle } from "./pages-shell"
import { useNewPage } from "./new-page-dialog"
import { TaskPicker } from "./task-picker"

function EditorSkeleton() {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-label="Carregando o editor">
      <div className="h-4 w-11/12 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
    </div>
  )
}

// O editor (Tiptap/ProseMirror) só é baixado nas páginas, não no resto do app.
const PageEditor = dynamic(() => import("./editor/page-editor"), { ssr: false, loading: () => <EditorSkeleton /> })

type Load = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ok"; page: PageRecord }

/** Página aberta: carrega o conteúdo do banco e mostra os estados de carregamento/erro. */
export function PageView({ id }: { id: string }) {
  const [load, setLoad] = React.useState<Load>({ status: "loading" })
  const [attempt, setAttempt] = React.useState(0)
  const [loadedKey, setLoadedKey] = React.useState(`${id}:${attempt}`)
  if (loadedKey !== `${id}:${attempt}`) {
    setLoadedKey(`${id}:${attempt}`)
    setLoad({ status: "loading" })
  }

  React.useEffect(() => {
    let cancelled = false
    void fetchPage(id).then((r) => {
      if (!cancelled) setLoad(r.status === "ok" ? { status: "ok", page: r.page } : { status: r.status })
    })
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  if (load.status === "loading") {
    return (
      <div className="mx-auto max-w-[820px] space-y-5 pt-2" aria-busy="true" aria-label="Carregando a página">
        <div className="h-4 w-48 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
        <div className="h-9 w-2/3 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
        <EditorSkeleton />
      </div>
    )
  }
  if (load.status !== "ok") {
    return (
      <div className="mx-auto max-w-[820px] pt-2">
        <div className="mb-4 flex items-center gap-1">
          <NavToggle />
        </div>
        <Panel>
          <EmptyState
            icon={load.status === "missing" ? <FileText /> : <CloudOff />}
            title={load.status === "missing" ? "Página não encontrada." : "Não foi possível abrir a página."}
            description={
              load.status === "missing"
                ? "Ela pode ter sido excluída, ou você não tem acesso a ela (páginas pessoais e páginas vinculadas a clientes ou processos que você não vê)."
                : "Verifique a conexão e tente de novo."
            }
            action={
              load.status === "missing" ? (
                <Link href="/tarefas/paginas" className={buttonVariants({ variant: "secondary" })}>
                  Voltar às páginas
                </Link>
              ) : (
                <Button variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
                  Tentar de novo
                </Button>
              )
            }
          />
        </Panel>
      </div>
    )
  }
  return <LoadedPage key={load.page.id} initial={load.page} />
}

function useSaverState(saver: PageSaver): SaverSnapshot {
  return React.useSyncExternalStore(
    React.useCallback((l: () => void) => saver.subscribe(l), [saver]),
    () => saver.snapshot,
    () => saver.snapshot,
  )
}

/** Relógio de 1 s só enquanto precisa (contagem até a próxima tentativa). */
function useTicker(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const handle = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(handle)
  }, [active])
  return now
}

function SaveIndicator({ snap, saver }: { snap: SaverSnapshot; saver: PageSaver }) {
  const now = useTicker(snap.state === "error")
  const base = "flex items-center gap-1.5 text-[12px] whitespace-nowrap"
  if (snap.state === "saving")
    return (
      <span className={cn(base, "text-muted-foreground")}>
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> Salvando…
      </span>
    )
  if (snap.state === "dirty") return <span className={cn(base, "text-subtle")}>Alterações não salvas</span>
  if (snap.state === "error") {
    const secs = snap.retryAt ? Math.max(0, Math.ceil((snap.retryAt - now) / 1000)) : 0
    return (
      <span className={cn(base, "text-danger")}>
        <CloudOff className="size-3.5" /> Não salvo{secs > 0 ? ` · nova tentativa em ${secs}s` : ""}
        <button type="button" onClick={() => saver.retryNow()} className="font-medium underline underline-offset-2">
          Tentar agora
        </button>
      </span>
    )
  }
  if (snap.state === "conflict")
    return (
      <span className={cn(base, "text-warning")}>
        <AlertTriangle className="size-3.5" /> Conflito
      </span>
    )
  if (snap.state === "missing")
    return (
      <span className={cn(base, "text-danger")}>
        <AlertTriangle className="size-3.5" /> Não salvo
      </span>
    )
  return snap.savedAt ? (
    <span className={cn(base, "text-muted-foreground")}>
      <Check className="size-3.5 text-success" /> Salvo
    </span>
  ) : null
}

const chip =
  "inline-flex h-7 max-w-full items-center gap-1.5 rounded-[7px] px-2 text-[12.5px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none"

function LoadedPage({ initial }: { initial: PageRecord }) {
  const id = initial.id
  const router = useRouter()
  const params = useSearchParams()
  const data = useOfficeData()
  const { deleteTask, confirmSaved } = useOfficeActions()
  const { user, can } = useSession()
  const { pages, list, favorites } = usePages()
  const newPage = useNewPage()
  const toggleTask = useToggleTask()
  const meta: PageMeta = pages.get(id) ?? initial
  const writable = canWritePage(meta, user.id, can("tasks.edit"))
  const canEditTasks = can("tasks.edit")

  // Um salvador por página (no módulo): o que ainda não foi gravado sobrevive a sair e voltar.
  const saver = React.useMemo(() => getSaver(id, initial.version), [id, initial.version])
  const snap = useSaverState(saver)
  const [initialContent] = React.useState<DocNode>(() => saver.unsaved?.content ?? initial.content ?? EMPTY_DOC)
  const [title, setTitle] = React.useState(() => saver.unsaved?.title ?? initial.title)
  const editorRef = React.useRef<Editor | null>(null)
  const titleRef = React.useRef<HTMLTextAreaElement>(null)

  // Tarefas: detalhe, criação (com retorno para o bloco) e escolha de existente.
  const [openTaskId, setOpenTaskId] = React.useState<string>()
  const [creating, setCreating] = React.useState<{ title?: string; onCreated: (t: Task) => void } | null>(null)
  const [editingTask, setEditingTask] = React.useState<Task>()
  const [picking, setPicking] = React.useState<((id: string) => void) | null>(null)
  const [moving, setMoving] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const ctx = React.useMemo<PageEditorContextValue>(
    () => ({
      pageId: id,
      canEditTasks,
      openTask: setOpenTaskId,
      createTask: (o) => setCreating(o),
      pickTask: (onPick) => setPicking(() => onPick),
    }),
    [id, canEditTasks],
  )

  // Página nova: foco no título.
  const isNew = params.get("nova") === "1"
  React.useEffect(() => {
    if (!isNew) return
    const el = titleRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
    router.replace(pageHref(id), { scroll: false })
  }, [isNew, id, router])

  // Sair da página grava o que estiver pendente; Ctrl/⌘+S grava na hora; a conexão voltou → tenta.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void saver.flush()
      }
    }
    const onOnline = () => saver.retryNow()
    window.addEventListener("keydown", onKey)
    window.addEventListener("online", onOnline)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("online", onOnline)
      void saver.flush()
    }
  }, [saver])

  // Voltou para a aba: se outra pessoa gravou e aqui não há nada pendente, mostra a versão nova.
  React.useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== "visible" || saver.hasUnsaved()) return
      const current = await fetchPageVersion(id)
      if (!current || current.version <= saver.version || saver.hasUnsaved()) return
      const fresh = await fetchPage(id)
      if (fresh.status !== "ok" || saver.hasUnsaved()) return
      editorRef.current?.commands.setContent(fresh.page.content, { emitUpdate: false })
      setTitle(fresh.page.title)
      saver.rebase(fresh.page.version)
      toast("Página atualizada.", { description: `${getUser(fresh.page.updatedBy ?? fresh.page.createdBy).firstName} alterou esta página.` })
    }
    const onFocus = () => void check()
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [id, saver])

  const onTitle = (value: string) => {
    const next = value.replace(/\n/g, " ").slice(0, 300)
    setTitle(next)
    saver.edit({ title: next })
  }

  const reloadSaved = async () => {
    const fresh = await fetchPage(id)
    if (fresh.status !== "ok") {
      toast.error("Não foi possível carregar a versão salva.")
      return
    }
    editorRef.current?.commands.setContent(fresh.page.content, { emitUpdate: false })
    setTitle(fresh.page.title)
    saver.discard(fresh.page.version)
  }

  const applyMeta = async (patch: MetaPatch, success: string) => {
    const r = await updatePageMeta(id, patch)
    if ("error" in r) {
      toast.error("Não foi possível alterar a página.", {
        description:
          r.error === "denied"
            ? r.message && /[a-zà-ú]/i.test(r.message) && !/policy|violates/i.test(r.message)
              ? r.message
              : "Você não tem permissão para esta alteração."
            : "Verifique a conexão e tente de novo.",
      })
      return false
    }
    toast.success(success)
    return true
  }

  const createSubpage = React.useCallback(async () => {
    const r = await createPage({ title: "", content: EMPTY_DOC, visibility: meta.visibility, parentId: id })
    if ("error" in r) {
      toast.error("Não foi possível criar a subpágina.")
      return null
    }
    toast.success("Subpágina criada.", { action: { label: "Abrir", onClick: () => router.push(pageHref(r.page.id)) } })
    return r.page.id
  }, [id, meta.visibility, router])

  const onReady = React.useCallback((e: Editor) => {
    editorRef.current = e
  }, [])

  const path = breadcrumb(pages, id)
  const parents = path.slice(0, -1)
  const children = list.filter((p) => p.parentId === id).sort((a, b) => pageTitle(a).localeCompare(pageTitle(b), "pt-BR"))
  const favorite = favorites.has(id)
  const related = meta.processId
    ? describeRelated(data, { type: "process", id: meta.processId })
    : meta.clientId
      ? describeRelated(data, { type: "client", id: meta.clientId })
      : undefined
  const isOwner = meta.createdBy === user.id
  const subCount = descendants(list, id).length
  const openTask = openTaskId ? byId(data.tasks, openTaskId) : undefined
  const pageTasks = React.useMemo(() => new Set(referencedTaskIds(initialContent)), [initialContent])
  const creator = getUser(meta.createdBy)
  const lastEditor = meta.updatedBy ? getUser(meta.updatedBy) : creator

  return (
    <PageEditorContext.Provider value={ctx}>
      <article className="mx-auto max-w-[820px] pb-10" aria-labelledby="page-title">
        {/* Barra superior: trilha, salvamento e ações. */}
        <div className="sticky top-16 z-10 -mx-2 mb-4 flex min-h-11 items-center gap-1 bg-background px-2 py-1.5 md:top-[72px]">
          <NavToggle />
          <nav aria-label="Local da página" className="flex min-w-0 flex-1 items-center gap-0.5 text-[12.5px] text-muted-foreground">
            <Link href="/tarefas/paginas" className="shrink-0 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground max-sm:hidden">
              Páginas
            </Link>
            {parents.map((p) => (
              <React.Fragment key={p.id}>
                <ChevronRight className="size-3.5 shrink-0 text-subtle max-sm:hidden" aria-hidden />
                <Link href={pageHref(p.id)} className="min-w-0 truncate rounded px-1 py-0.5 hover:bg-accent hover:text-foreground max-sm:hidden">
                  {pageTitle(p)}
                </Link>
              </React.Fragment>
            ))}
            <ChevronRight className="size-3.5 shrink-0 text-subtle max-sm:hidden" aria-hidden />
            <span className="min-w-0 truncate px-1 text-foreground" aria-current="page">
              {title.trim() || pageTitle(meta)}
            </span>
          </nav>
          <div className="flex shrink-0 items-center gap-1" aria-live="polite">
            <SaveIndicator snap={snap} saver={saver} />
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!(await setPageFavorite(id, !favorite))) toast.error("Não foi possível atualizar as favoritas.")
            }}
            aria-pressed={favorite}
            aria-label={favorite ? "Remover das favoritas" : "Adicionar às favoritas"}
            title={favorite ? "Remover das favoritas" : "Adicionar às favoritas"}
            className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Star className={cn("size-4", favorite && "fill-gold text-gold")} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Ações da página"
              className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                className="h-8 gap-2.5 px-2 text-[13px]"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}${pageHref(id)}`)
                    toast.success("Link copiado.", { description: "Só abre para quem tem acesso à página." })
                  } catch {
                    toast.error("Não foi possível copiar o link.")
                  }
                }}
              >
                <Copy /> Copiar link
              </DropdownMenuItem>
              {writable && (
                <DropdownMenuItem className="h-8 gap-2.5 px-2 text-[13px]" onClick={() => newPage.open({ parent: meta })}>
                  <FilePlus2 /> Nova subpágina
                </DropdownMenuItem>
              )}
              {writable && (
                <DropdownMenuItem className="h-8 gap-2.5 px-2 text-[13px]" onClick={() => setMoving(true)}>
                  <FolderInput /> Mover para…
                </DropdownMenuItem>
              )}
              {writable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="h-8 gap-2.5 px-2 text-[13px] text-danger data-[highlighted]:text-danger"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 /> Excluir página
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Avisos que pedem decisão. */}
        {snap.state === "conflict" && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-foreground"
          >
            <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
            <p className="min-w-0 flex-1">
              <strong className="font-semibold">
                {snap.conflict?.updatedBy ? getUser(snap.conflict.updatedBy).firstName : "Outra pessoa"} alterou esta página
              </strong>
              {snap.conflict?.updatedAt ? ` ${fmtRelative(snap.conflict.updatedAt)}` : ""} enquanto você editava. Suas alterações ainda não foram
              salvas.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => void reloadSaved()}>
                Ver a versão salva
              </Button>
              <Button size="sm" onClick={() => void saver.overwrite(snap.conflict?.version ?? saver.version)}>
                Manter a minha
              </Button>
            </div>
          </div>
        )}
        {snap.state === "missing" && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-[12px] border border-danger/25 bg-danger-soft px-4 py-3 text-[13px] text-foreground"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <p>
              <strong className="font-semibold">Esta página foi excluída ou você perdeu o acesso.</strong> O que você escreveu continua na tela, mas
              não pode ser salvo aqui — copie o que precisar.
            </p>
          </div>
        )}
        {!writable && (
          <p className="mb-4 flex items-center gap-2 rounded-[10px] bg-surface-muted px-3 py-2 text-[12.5px] text-muted-foreground">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            Somente leitura: alterar páginas do escritório requer a permissão de editar tarefas.
          </p>
        )}

        {/* Título e propriedades. */}
        <textarea
          id="page-title"
          ref={titleRef}
          value={title}
          readOnly={!writable}
          rows={1}
          maxLength={300}
          onChange={(e) => onTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || (e.key === "ArrowDown" && e.currentTarget.selectionStart === e.currentTarget.value.length)) {
              e.preventDefault()
              editorRef.current?.commands.focus("start")
            }
          }}
          placeholder="Sem título"
          aria-label="Título da página"
          className="w-full resize-none bg-transparent text-[28px] leading-[1.2] font-semibold tracking-[-0.022em] text-foreground outline-none [field-sizing:content] placeholder:text-subtle/80 focus-visible:outline-none sm:text-[34px]"
        />

        <div className="mt-2 mb-6 flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-border/70 pb-3">
          <VisibilityControl
            meta={meta}
            isOwner={isOwner}
            canShare={can("tasks.edit")}
            onChange={(v) => applyMeta({ visibility: v }, v === "private" ? "A página agora é pessoal." : "A página agora é do escritório.")}
          />
          <RelatedControl
            meta={meta}
            related={related}
            writable={writable}
            onChange={(clientId, processId) =>
              applyMeta({ clientId, processId }, processId || clientId ? "Vínculo atualizado." : "Vínculo removido.")
            }
          />
          <span className="px-2 text-[12px] text-subtle">
            Criada por {creator.firstName} em {fmtNumericDate(meta.createdAt)} · editada {fmtRelative(meta.updatedAt)}
            {lastEditor.id !== creator.id ? ` por ${lastEditor.firstName}` : ""}
          </span>
        </div>

        <PageEditor
          key={id}
          pageId={id}
          initialContent={initialContent}
          editable={writable && snap.state !== "missing"}
          saver={saver}
          createSubpage={createSubpage}
          onReady={onReady}
        />

        {(children.length > 0 || writable) && (
          <section aria-labelledby="subpaginas" className="mt-2 border-t border-border/70 pt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="subpaginas" className="text-[12px] font-medium tracking-[0.08em] text-subtle uppercase">
                Subpáginas
              </h2>
              {writable && (
                <Button size="sm" variant="ghost" onClick={() => newPage.open({ parent: meta })}>
                  <FilePlus2 /> Nova subpágina
                </Button>
              )}
            </div>
            {children.length ? (
              <ul className="grid gap-1 sm:grid-cols-2">
                {children.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={pageHref(c.id)}
                      className="flex min-w-0 items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13.5px] text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/40"
                    >
                      <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
                      <span className="truncate">{pageTitle(c)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-subtle">Nenhuma subpágina.</p>
            )}
          </section>
        )}
      </article>

      <TaskDetailSheet
        task={openTask}
        related={openTask ? describeRelated(data, openTask.related) : undefined}
        open={!!openTask}
        onOpenChange={(o) => !o && setOpenTaskId(undefined)}
        onToggle={(t) => void toggleTask(t)}
        onEdit={(t) => {
          setOpenTaskId(undefined)
          window.setTimeout(() => setEditingTask(t), 180)
        }}
        onDelete={async (t) => {
          setOpenTaskId(undefined)
          deleteTask(t.id)
          if (await confirmSaved("tasks", t.id)) toast.success("Tarefa excluída.", { description: t.title })
        }}
      />
      <TaskFormDialog open={!!editingTask} onOpenChange={(o) => !o && setEditingTask(undefined)} task={editingTask} />
      <TaskFormDialog
        open={!!creating}
        onOpenChange={(o) => !o && setCreating(null)}
        defaults={{ title: creating?.title, pageId: id, clientId: meta.clientId ?? undefined, processId: meta.processId ?? undefined }}
        onCreated={(t) => creating?.onCreated(t)}
      />
      <TaskPicker
        open={!!picking}
        onOpenChange={(o) => !o && setPicking(null)}
        exclude={pageTasks}
        onPick={(taskId) => {
          picking?.(taskId)
          setPicking(null)
        }}
      />
      <MoveDialog open={moving} onOpenChange={setMoving} meta={meta} list={list} onMove={(parentId) => applyMeta({ parentId }, "Página movida.")} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Excluir "${pageTitle(meta)}"?`}
        description={
          subCount
            ? `A página e ${subCount} subpágina${subCount > 1 ? "s" : ""} serão excluídas. As tarefas mostradas nelas continuam no quadro.`
            : "A página será excluída. As tarefas mostradas nela continuam no quadro."
        }
        confirmLabel="Excluir página"
        onConfirm={async () => {
          const parent = meta.parentId
          await saver.flush().catch(() => undefined)
          if (await deletePage(id)) {
            toast.success("Página excluída.")
            router.push(parent && pages.has(parent) ? pageHref(parent) : "/tarefas/paginas")
          } else toast.error("Não foi possível excluir a página.", { description: "Verifique a conexão ou sua permissão." })
        }}
      />
    </PageEditorContext.Provider>
  )
}

function VisibilityControl({
  meta,
  isOwner,
  canShare,
  onChange,
}: {
  meta: PageMeta
  isOwner: boolean
  canShare: boolean
  onChange: (v: "private" | "office") => void
}) {
  const label = meta.visibility === "private" ? "Pessoal" : "Escritório"
  const Icon = meta.visibility === "private" ? Lock : UsersRound
  // Subpágina herda; só quem criou a página de cima muda o acesso.
  if (!isOwner || meta.parentId) {
    return (
      <span
        className={cn(chip, "hover:bg-transparent hover:text-muted-foreground")}
        title={meta.parentId ? "Subpágina: mesmo acesso da página de cima" : "Só quem criou muda o acesso"}
      >
        <Icon className="size-3.5" /> {label}
      </span>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={chip} aria-label={`Acesso: ${label}. Alterar`}>
        <Icon className="size-3.5" /> {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuRadioGroup value={meta.visibility} onValueChange={(v) => v !== meta.visibility && onChange(v as "private" | "office")}>
          <DropdownMenuRadioItem value="private" className="items-start gap-2.5 py-2 text-[13px]">
            <span>
              <span className="block font-medium">Pessoal</span>
              <span className="block text-[12px] text-muted-foreground">Só você vê e edita (inclui as subpáginas).</span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="office" disabled={!canShare} className="items-start gap-2.5 py-2 text-[13px]">
            <span>
              <span className="block font-medium">Escritório</span>
              <span className="block text-[12px] text-muted-foreground">
                {canShare ? "A equipe vê; quem edita tarefas pode alterar." : "Requer permissão para editar tarefas."}
              </span>
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RelatedControl({
  meta,
  related,
  writable,
  onChange,
}: {
  meta: PageMeta
  related?: { label: string; href: string }
  writable: boolean
  onChange: (clientId: string | null, processId: string | null) => Promise<boolean>
}) {
  const data = useOfficeData()
  const { can } = useSession()
  const [open, setOpen] = React.useState(false)
  const current = meta.processId ? `process:${meta.processId}` : meta.clientId ? `client:${meta.clientId}` : ""
  const [value, setValue] = React.useState(current)
  const Icon = meta.processId ? Scale : meta.clientId ? UserRound : Link2
  const clients = can("clients.view") ? data.clients.filter((c) => c.status !== "inativo" || c.id === meta.clientId) : []
  const processes = can("processes.view") ? data.processes : []

  return (
    <span className="inline-flex max-w-full min-w-0 items-center">
      {related ? (
        <Link href={related.href} className={cn(chip, "min-w-0 text-foreground")} title="Abrir o registro vinculado">
          <Icon className="size-3.5 shrink-0" /> <span className="truncate">{related.label}</span>
        </Link>
      ) : null}
      {writable && (clients.length > 0 || processes.length > 0) && (
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (o) setValue(current)
          }}
        >
          <PopoverTrigger className={chip} aria-label={related ? "Alterar vínculo" : "Vincular a cliente ou processo"}>
            {related ? (
              <span className="text-[12px]">Alterar</span>
            ) : (
              <>
                <Link2 className="size-3.5" /> Vincular
              </>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(360px,calc(100vw-24px))] gap-3 p-3">
            <label htmlFor="page-related-edit" className="text-[12.5px] font-medium text-foreground">
              Cliente ou processo
            </label>
            <NativeSelect id="page-related-edit" value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Sem vínculo</option>
              {processes.length > 0 && (
                <optgroup label="Processos">
                  {processes.map((p) => (
                    <option key={p.id} value={`process:${p.id}`}>
                      {describeRelated(data, { type: "process", id: p.id })?.label ?? "Processo"}
                    </option>
                  ))}
                </optgroup>
              )}
              {clients.length > 0 && (
                <optgroup label="Clientes">
                  {clients.map((c) => (
                    <option key={c.id} value={`client:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </NativeSelect>
            <p className="text-[11.5px] text-muted-foreground">A página passa a aparecer só para quem também vê esse registro.</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  const [kind, rid] = value ? value.split(":") : []
                  if (await onChange(kind === "client" ? rid : null, kind === "process" ? rid : null)) setOpen(false)
                }}
              >
                Salvar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </span>
  )
}

function MoveDialog({
  open,
  onOpenChange,
  meta,
  list,
  onMove,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  meta: PageMeta
  list: PageMeta[]
  onMove: (parentId: string | null) => Promise<boolean>
}) {
  const [target, setTarget] = React.useState(meta.parentId ?? "")
  const [saving, setSaving] = React.useState(false)
  const [lastOpen, setLastOpen] = React.useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setTarget(meta.parentId ?? "")
  }
  const targets = moveTargets(list, meta.id).sort((a, b) => pageTitle(a).localeCompare(pageTitle(b), "pt-BR"))
  const pages = new Map(list.map((p) => [p.id, p]))
  const label = (p: PageMeta) => breadcrumb(pages, p.id).map(pageTitle).join(" › ")
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Mover página"
      description={`"${pageTitle(meta)}" e as subpáginas dela.`}
      icon={<FolderInput />}
      size="sm"
      bare
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setSaving(true)
          const ok = await onMove(target || null)
          setSaving(false)
          if (ok) onOpenChange(false)
        }}
      >
        <ModalBody>
          <label htmlFor="page-move-target" className="mb-1.5 block text-[12.5px] font-medium text-foreground">
            Colocar dentro de
          </label>
          <NativeSelect id="page-move-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Nenhuma — no topo ({meta.visibility === "private" ? "Pessoais" : "Escritório"})</option>
            <optgroup label="Pessoais">
              {targets
                .filter((p) => p.visibility === "private")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {label(p)}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Escritório">
              {targets
                .filter((p) => p.visibility === "office")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {label(p)}
                  </option>
                ))}
            </optgroup>
          </NativeSelect>
          <p className="mt-2 text-[12px] text-muted-foreground">Dentro de outra página, ela passa a ter o mesmo acesso (pessoal ou do escritório).</p>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || target === (meta.parentId ?? "")}>
            {saving ? "Movendo…" : "Mover"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
