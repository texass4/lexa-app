/**
 * Navegação com recarga completa, de propósito: ao entrar, sair ou trocar de conta, o
 * store e a conta em memória precisam ser descartados, e o servidor precisa ver o
 * cookie de sessão novo. `router.push` manteria o estado da conta anterior.
 */
export function hardNavigate(path: string) {
  window.location.assign(path)
}
