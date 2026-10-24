"use client"

import { Menu } from "@base-ui/react/menu"
import type { ReactElement, ReactNode } from "react"
import { cn } from "@/lib/cn"

export type MenuEntry =
  | { type?: "item"; label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | { type: "separator" }
  | { type: "label"; label: string }

/** Menu suspenso acessível (teclado, foco, Esc). `trigger` precisa ser um elemento clicável. */
export function DropdownMenu({ trigger, items, align = "end" }: { trigger: ReactElement; items: MenuEntry[]; align?: "start" | "end" | "center" }) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align={align} className="z-50 outline-none">
          <Menu.Popup className="min-w-48 origin-[var(--transform-origin)] rounded-md border border-line bg-white p-1 shadow-float outline-none transition-[opacity,transform] duration-100 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
            {items.map((item, i) => {
              if (item.type === "separator") return <Menu.Separator key={i} className="my-1 h-px bg-line-soft" />
              if (item.type === "label")
                return (
                  <div key={i} className="eyebrow px-2.5 pt-2 pb-1">
                    {item.label}
                  </div>
                )
              return (
                <Menu.Item
                  key={i}
                  disabled={item.disabled}
                  onClick={item.onSelect}
                  className={cn(
                    "flex cursor-default items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-paper [&_svg]:size-4 [&_svg]:text-ink-4",
                    item.danger ? "text-clay data-[highlighted]:bg-clay-soft [&_svg]:text-clay" : "text-ink-2",
                  )}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.hint ? <span className="meta">{item.hint}</span> : null}
                </Menu.Item>
              )
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
