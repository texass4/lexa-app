/**
 * Quem não tem `finance.view` não recebe nada do Financeiro. A barreira de verdade é
 * a RLS do banco (lançamentos desde a 0001; atividades financeiras desde a
 * `0014_financeiro_privacidade.sql`, com a mesma regra daqui). Estas funções repetem
 * a regra no app, para que nenhuma tela dependa só do que o banco devolveu.
 */

import type { Activity, ActivityType, Invoice } from "@/types"

/** Atividades que carregam descrição e valor de lançamentos (pagamento, cobrança, edição). */
export const FINANCIAL_ACTIVITY_TYPES: readonly ActivityType[] = ["payment"]

export const isFinancialActivity = (activity: Pick<Activity, "type">) => FINANCIAL_ACTIVITY_TYPES.includes(activity.type)

/** As atividades que a pessoa pode ver. */
export function visibleActivities<T extends Pick<Activity, "type">>(activities: T[], canViewFinance: boolean): T[] {
  return canViewFinance ? activities : activities.filter((activity) => !isFinancialActivity(activity))
}

/** O estado do escritório sem lançamentos nem atividades financeiras, para quem não tem o Financeiro. */
export function withoutFinance<S extends { invoices: Invoice[]; activities: Activity[] }>(state: S, canViewFinance: boolean): S {
  if (canViewFinance) return state
  return { ...state, invoices: [], activities: visibleActivities(state.activities, false) }
}
