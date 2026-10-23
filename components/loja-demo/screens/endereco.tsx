"use client"

import { useState } from "react"
import { useStore } from "../store"
import { THEME, TopBar, Anno } from "../ui"

function Input({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <label className="block border-b px-4 py-3" style={{ borderColor: THEME.line }}>
      <input
        placeholder={label + (optional ? " (opcional)" : "")}
        className="w-full bg-transparent text-[14px] outline-none placeholder:text-[#b6b8be]"
        style={{ color: THEME.ink }}
      />
    </label>
  )
}

export function EnderecoScreen() {
  const { back, flash } = useStore()
  const [padrao, setPadrao] = useState(true)

  return (
    <div className="flex h-full flex-col" style={{ background: THEME.bg }}>
      <TopBar title="Adicionar o novo endereço" />

      <div className="flex-1 overflow-y-auto pb-2">
        <div className="px-4 py-1.5 text-center text-[11px]" style={{ background: "#fff8e6", color: "#8a6d1a" }}>
          Formulário de demonstração — os campos não enviam nem salvam dados
        </div>

        {/* Contato */}
        <div className="px-4 pt-4 pb-1 text-[13px] font-semibold" style={{ color: THEME.muted }}>Informações de contato</div>
        <div style={{ background: THEME.surface }}>
          <Input label="Nome" />
          <label className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: THEME.line }}>
            <span className="text-[14px]" style={{ color: THEME.muted }}>BR +55</span>
            <input placeholder="Número de telefone" className="w-full bg-transparent text-[14px] outline-none placeholder:text-[#b6b8be]" style={{ color: THEME.ink }} />
          </label>
          <Input label="E-mail" />
        </div>

        {/* Endereço */}
        <div className="px-4 pt-4 pb-1 text-[13px] font-semibold" style={{ color: THEME.muted }}>Informações de endereço</div>
        <div style={{ background: THEME.surface }}>
          <Input label="CEP/Código postal" />
          <div className="grid grid-cols-2 border-b" style={{ borderColor: THEME.line }}>
            <div className="border-r px-4 py-3 text-[14px]" style={{ borderColor: THEME.line, color: THEME.muted }}>Estado/UF ⌄</div>
            <div className="px-4 py-3 text-[14px]" style={{ color: THEME.muted }}>Cidade ⌄</div>
          </div>
          <Input label="Bairro/Distrito" />
          <Input label="Endereço" />
          <Input label='Nº da residência. Use "s/n" se nenhum' />
          <Input label="Apartamento, bloco, unidade etc." optional />
        </div>

        {/* Fiscal */}
        <div className="px-4 pt-4 pb-1 text-[13px] font-semibold" style={{ color: THEME.muted }}>Informações fiscais</div>
        <div style={{ background: THEME.surface }}>
          <Input label="Número de CPF de 11 dígitos" />
          <div className="px-4 py-2 text-[12px] font-medium" style={{ color: THEME.ink }}>O CPF será usado para emitir faturas.</div>
        </div>

        {/* Config */}
        <div className="px-4 pt-4 pb-1 text-[13px] font-semibold" style={{ color: THEME.muted }}>Configurações</div>
        <div className="flex items-center justify-between px-4 py-3" style={{ background: THEME.surface }}>
          <span className="text-[15px] font-semibold" style={{ color: THEME.ink }}>
            Definir como padrão
            <Anno n={8} label="Default pré-marcado" note="O interruptor já vem ligado — o caminho de menor esforço é o que favorece a loja." />
          </span>
          <button
            onClick={() => setPadrao((p) => !p)}
            className="relative h-7 w-12 rounded-full transition-colors"
            style={{ background: padrao ? "#34d0d6" : THEME.line }}
            aria-pressed={padrao}
          >
            <span className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all" style={{ left: padrao ? 22 : 2 }} />
          </button>
        </div>

        <div className="px-4 py-4 text-[12px] leading-snug" style={{ color: THEME.muted }}>
          Leia a <b>Política de privacidade</b> da loja demonstrativa para saber como os dados seriam usados.
        </div>
      </div>

      {/* Salvar */}
      <div className="border-t px-4 py-3" style={{ borderColor: THEME.line, background: THEME.surface }}>
        <button
          onClick={() => {
            flash("Endereço de demonstração — nada foi salvo")
            back()
          }}
          className="w-full rounded-full py-3 text-[15px] font-bold text-white"
          style={{ background: "#f6a9a0" }}
        >
          Salvar
        </button>
      </div>
    </div>
  )
}
