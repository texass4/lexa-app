"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CalendarRange, ClipboardList, FilePlus2, FileText, Lightbulb, ListChecks, Lock, Scale, UsersRound, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect } from "@/components/ui/field"
import { useSession } from "@/lib/auth/session"
import { useOfficeData } from "@/lib/store/office-store"
import { describeRelated } from "@/lib/store/selectors"
import { createPage } from "@/lib/paginas/pages"
import { pageHref, pageTitle, type PageMeta, type PageVisibility } from "@/lib/paginas/model"
import { PAGE_TEMPLATES, type TemplateKey } from "@/lib/paginas/templates"

const TEMPLATE_ICON: Record<TemplateKey, LucideIcon> = {
  branco: FileText,
  reuniao: UsersRound,
  semana: CalendarRange,
  projeto: ClipboardList,
  caso: Scale,
  procedimento: ListChecks,
  ideias: Lightbulb,
}

export interface NewPageOptions {
  parent?: PageMeta
  visibility?: PageVisibility
  clientId?: string
  processId?: string
  template?: TemplateKey
}

interface NewPageContextValue {
  open: (options: NewPageOptions) => void
  /** Pode criar página do escritório (`tasks.edit`). */
  canShare: boolean
}

const NewPageContext = React.createContext<NewPageContextValue | null>(null)

export function useNewPage() {
  const ctx = React.useContext(NewPageContext)
  if (!ctx) throw new Error("useNewPage fora de NewPageProvider")
  return ctx
}

export function NewPageProvider({ children }: { children: React.ReactNode }) {
  const { can } = useSession()
  const [options, setOptions] = React.useState<NewPageOptions | null>(null)
  const canShare = can("tasks.edit")
  const value = React.useMemo(() => ({ open: (o: NewPageOptions) => setOptions(o), canShare }), [canShare])
  return (
    <NewPageContext.Provider value={value}>
      {children}
      <Modal
        open={!!options}
        onOpenChange={(o) => !o && setOptions(null)}
        title={options?.parent ? "Nova subpágina" : "Nova página"}
        description={options?.parent ? `Dentro de "${pageTitle(options.parent)}".` : "Comece em branco ou a partir de um modelo."}
        icon={<FilePlus2 />}
        size="lg"
        bare
      >
        {options && <NewPageForm options={options} canShare={canShare} onDone={() => setOptions(null)} />}
      </Modal>
    </NewPageContext.Provider>
  )
}

function NewPageForm({ options, canShare, onDone }: { options: NewPageOptions; canShare: boolean; onDone: () => void }) {
  const router = useRouter()
  const data = useOfficeData()
  const { can } = useSession()
  const [template, setTemplate] = React.useState<TemplateKey>(options.template ?? "branco")
  const [visibility, setVisibility] = React.useState<PageVisibility>(
    options.parent?.visibility ?? options.visibility ?? (canShare ? "office" : "private"),
  )
  const [related, setRelated] = React.useState(
    options.processId ? `process:${options.processId}` : options.clientId ? `client:${options.clientId}` : "",
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")
  const inherited = !!options.parent

  const clients = can("clients.view") ? data.clients.filter((c) => c.status !== "inativo") : []
  const processes = can("processes.view") ? data.processes : []

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const t = PAGE_TEMPLATES.find((x) => x.key === template)!
    const [kind, id] = related ? related.split(":") : []
    setSaving(true)
    setError("")
    const result = await createPage({
      title: t.title,
      content: t.content(),
      visibility,
      parentId: options.parent?.id ?? null,
      clientId: kind === "client" ? id : null,
      processId: kind === "process" ? id : null,
      template: t.key === "branco" ? null : t.key,
    })
    setSaving(false)
    if ("error" in result) {
      setError(
        result.error === "denied"
          ? "Você não tem permissão para criar esta página aqui."
          : result.error === "unavailable"
            ? "As páginas ainda não estão ativas neste escritório. Fale com o responsável técnico."
            : "Não foi possível criar a página. Verifique a conexão e tente de novo.",
      )
      return
    }
    onDone()
    router.push(`${pageHref(result.page.id)}?nova=1`)
  }

  return (
    <form onSubmit={submit}>
      <ModalBody>
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-[12.5px] font-medium text-foreground">Modelo</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modelo da página">
              {PAGE_TEMPLATES.map((t) => {
                const Icon = TEMPLATE_ICON[t.key]
                const selected = t.key === template
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTemplate(t.key)}
                    onDoubleClick={(e) => (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()}
                    className={cn(
                      "flex items-start gap-3 rounded-[10px] border px-3 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40",
                      selected ? "border-brand/60 bg-brand-soft/50" : "border-border hover:border-border-strong hover:bg-accent/50",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] border",
                        selected ? "border-brand/30 bg-surface text-brand" : "border-border bg-surface text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-foreground">{t.name}</span>
                      <span className="block text-[12px] leading-snug text-muted-foreground">{t.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          {inherited ? (
            <p className="flex items-center gap-2 rounded-[10px] bg-surface-muted px-3 py-2 text-[12.5px] text-muted-foreground">
              {visibility === "private" ? <Lock className="size-3.5" /> : <UsersRound className="size-3.5" />}
              Subpágina: mesmo acesso da página de cima ({visibility === "private" ? "só você" : "equipe do escritório"}).
            </p>
          ) : (
            <fieldset>
              <legend className="mb-2 text-[12.5px] font-medium text-foreground">Quem vê</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Quem vê a página">
                {(
                  [
                    { value: "private", icon: Lock, label: "Pessoal", hint: "Só você vê e edita." },
                    {
                      value: "office",
                      icon: UsersRound,
                      label: "Escritório",
                      hint: canShare ? "A equipe vê; quem edita tarefas pode alterar." : "Requer permissão para editar tarefas.",
                    },
                  ] as const
                ).map((o) => {
                  const disabled = o.value === "office" && !canShare
                  const selected = visibility === o.value
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      onClick={() => setVisibility(o.value)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-[10px] border px-3 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-55",
                        selected ? "border-brand/60 bg-brand-soft/50" : "border-border hover:border-border-strong",
                      )}
                    >
                      <o.icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-brand" : "text-muted-foreground")} />
                      <span>
                        <span className="block text-[13px] font-medium text-foreground">{o.label}</span>
                        <span className="block text-[12px] text-muted-foreground">{o.hint}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}

          {(clients.length > 0 || processes.length > 0) && (
            <Field label="Vincular a (opcional)" htmlFor="page-related" hint="A página aparece para quem também vê o cliente ou processo.">
              <NativeSelect id="page-related" value={related} onChange={(e) => setRelated(e.target.value)}>
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
            </Field>
          )}

          {error && (
            <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              {error}
            </p>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Criando…" : "Criar página"}
        </Button>
      </ModalFooter>
    </form>
  )
}
