"use client"

import * as React from "react"
import { Plus, Scale, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { StatusBadge } from "@/components/ui/status-badge"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { getSupabase } from "@/lib/supabase/client"
import { currentOrgId } from "@/lib/auth/account"
import { UFS } from "@/lib/clientes/clients"
import { formatOab, oabDigits, validateOab } from "@/lib/intimacoes/oab"
import type { LawyerOab } from "@/types"

type Row = { id: string; organization_id: string; user_id: string; number: string; uf: string; active: boolean; created_at: string }

const toOab = (r: Row): LawyerOab => ({
  id: r.id,
  organizationId: r.organization_id,
  userId: r.user_id,
  number: r.number,
  uf: r.uf,
  active: r.active,
  createdAt: r.created_at,
})

/** Inscrições de uma pessoa (a RLS deixa ler as do escritório e gravar as próprias ou, com `users.manage`, as de todos). */
function useLawyerOabs(userId: string) {
  const [state, setState] = React.useState<{ oabs: LawyerOab[]; loading: boolean; unavailable: boolean }>({
    oabs: [],
    loading: true,
    unavailable: false,
  })
  const load = React.useCallback(async () => {
    const { data, error } = await getSupabase().from("lawyer_oabs").select("*").eq("user_id", userId).order("created_at")
    // Sem a migração 0011: o cadastro de inscrições ainda não existe no banco.
    if (error) {
      console.warn("[OAB] Não foi possível ler as inscrições (migração 0011 aplicada?):", error)
      setState({ oabs: [], loading: false, unavailable: true })
    }
    else setState({ oabs: (data as Row[]).map(toOab), loading: false, unavailable: false })
  }, [userId])
  React.useEffect(() => {
    // Leitura inicial do banco; o estado reflete a resposta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])
  return { ...state, reload: load }
}

/**
 * Inscrições na OAB (várias por advogado). Cada inscrição ativa é consultada todo dia
 * no DJEN para capturar intimações.
 */
export function OabManager({ userId, required, canEdit = true }: { userId: string; required?: boolean; canEdit?: boolean }) {
  const { oabs, loading, unavailable, reload } = useLawyerOabs(userId)
  const [form, setForm] = React.useState({ number: "", uf: "" })
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const active = oabs.filter((o) => o.active)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validateOab(form)
    if (problem) return setError(problem)
    setBusy(true)
    const { error: saveError } = await getSupabase()
      .from("lawyer_oabs")
      .insert({ organization_id: currentOrgId(), user_id: userId, number: oabDigits(form.number), uf: form.uf.toUpperCase() })
    setBusy(false)
    if (saveError) {
      return setError(
        saveError.code === "23505"
          ? "Esta inscrição já está cadastrada no escritório."
          : "Não foi possível salvar. Confira a permissão e tente de novo.",
      )
    }
    setForm({ number: "", uf: "" })
    setError("")
    await reload()
    toast.success("Inscrição cadastrada.", { description: `${formatOab(form)} — intimações capturadas diariamente.` })
  }

  const update = async (oab: LawyerOab, patch: { active?: boolean } | "delete") => {
    const table = getSupabase().from("lawyer_oabs")
    const { error: saveError } = patch === "delete" ? await table.delete().eq("id", oab.id) : await table.update(patch).eq("id", oab.id)
    if (saveError) return toast.error("Não foi possível alterar a inscrição.")
    await reload()
  }

  if (unavailable) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        O cadastro de inscrições na OAB ainda não está disponível para o escritório. Fale com o suporte da Íntegra.
      </p>
    )
  }

  return (
    <div className="@container space-y-3">
      {required && !loading && !active.length && (
        <p role="status" className="rounded-[10px] border border-warning/25 bg-warning-soft/50 px-3 py-2 text-[12.5px] text-foreground">
          Obrigatória para advogados: sem uma inscrição ativa, as intimações do DJEN não chegam para você.
        </p>
      )}
      {oabs.length > 0 && (
        <ul className="divide-y divide-border rounded-[10px] border border-border">
          {oabs.map((oab) => (
            <li key={oab.id} className="flex items-center gap-3 px-3 py-2.5">
              <Scale className="size-4 shrink-0 text-subtle" />
              <span className="tabular min-w-0 flex-1 truncate text-[13px] font-medium">{formatOab(oab)}</span>
              {!oab.active && (
                <StatusBadge tone="neutral" size="sm" dot={false}>
                  Inativa
                </StatusBadge>
              )}
              {canEdit && (
                <>
                  <ToggleSwitch
                    label={`Capturar intimações de ${formatOab(oab)}`}
                    checked={oab.active}
                    onChange={(v) => void update(oab, { active: v })}
                  />
                  <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${formatOab(oab)}`} onClick={() => void update(oab, "delete")}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={add} noValidate className="grid grid-cols-[minmax(0,1fr)_96px] items-end gap-2 @sm:grid-cols-[minmax(0,1fr)_96px_auto]">
          <Field label="Número da OAB" htmlFor={`oab-number-${userId}`} error={error}>
            <TextInput
              id={`oab-number-${userId}`}
              inputMode="numeric"
              placeholder="Ex.: 12.345"
              value={form.number}
              aria-invalid={!!error}
              onChange={(e) => {
                setForm((f) => ({ ...f, number: e.target.value.replace(/[^\d.]/g, "").slice(0, 9) }))
                setError("")
              }}
            />
          </Field>
          <Field label="UF" htmlFor={`oab-uf-${userId}`}>
            <NativeSelect id={`oab-uf-${userId}`} value={form.uf} onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value }))}>
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </NativeSelect>
          </Field>
          {/* Espaço estreito: número e UF lado a lado, "Adicionar" na linha de baixo. */}
          <Button type="submit" variant="secondary" disabled={busy} className="col-span-2 @sm:col-span-1">
            <Plus /> Adicionar
          </Button>
        </form>
      )}
    </div>
  )
}
