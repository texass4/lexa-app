import { Check, Minus } from "lucide-react"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Th, Td } from "@/components/ui/data-table"
import { ADMIN_PERMISSIONS, MEMBER_ROLES, MODULES, ROLE_DEFAULTS, ROLE_LABELS, type Permission } from "@/lib/auth/permissions"

function Mark({ on }: { on: boolean }) {
  return on ? <Check className="mx-auto size-4 text-success" aria-label="Sim" /> : <Minus className="mx-auto size-4 text-subtle" aria-label="Não" />
}

/** Padrão de cada papel. O ajuste por pessoa fica em Usuários › Permissões. */
export function PermissionsSection() {
  const has = (role: (typeof MEMBER_ROLES)[number], p: Permission) => ROLE_DEFAULTS[role].includes(p)
  return (
    <Panel>
      <PanelHeader
        title="Permissões"
        description="O que cada papel pode fazer por padrão. Para ajustar uma pessoa específica, use Usuários › Permissões."
      />
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[620px] border-separate border-spacing-0">
          <thead>
            <tr>
              <Th>Módulo</Th>
              {MEMBER_ROLES.map((r) => (
                <Th key={r} className="text-center">
                  {ROLE_LABELS[r]}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child_td]:border-0">
            {MODULES.map((m) => (
              <tr key={m.key}>
                <Td className="font-medium">{m.label}</Td>
                {MEMBER_ROLES.map((r) => (
                  <Td key={r} className="text-center text-[12.5px] text-muted-foreground">
                    {has(r, `${m.key}.edit`) ? "Ver e editar" : has(r, `${m.key}.view`) ? "Só ver" : <Mark on={false} />}
                  </Td>
                ))}
              </tr>
            ))}
            {ADMIN_PERMISSIONS.map((a) => (
              <tr key={a.key}>
                <Td className="font-medium">{a.label}</Td>
                {MEMBER_ROLES.map((r) => (
                  <Td key={r}>
                    <Mark on={has(r, a.key)} />
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-3 text-[12px] text-muted-foreground">
        O Sócio/Proprietário tem sempre acesso total. As permissões são aplicadas pelo banco de dados, não só pela tela.
      </p>
    </Panel>
  )
}
