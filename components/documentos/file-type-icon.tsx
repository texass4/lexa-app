import { cn } from "cn"

/**
 * Ícone do arquivo no estilo do Google Drive: página colorida com a dobra no canto e o
 * sinal do formato em branco — PDF vermelho, Word azul, Excel verde, imagem roxa, texto
 * cinza. Puramente visual (o nome do arquivo e o tipo vêm escritos ao lado).
 */
const STYLE: Record<string, { color: string; tile: string; glyph: "pdf" | "doc" | "sheet" | "image" | "text" }> = {
  pdf: { color: "#E5483B", tile: "bg-[#FDECEA] dark:bg-[#E5483B]/15", glyph: "pdf" },
  doc: { color: "#3B7BEA", tile: "bg-[#E8F0FE] dark:bg-[#3B7BEA]/15", glyph: "doc" },
  docx: { color: "#3B7BEA", tile: "bg-[#E8F0FE] dark:bg-[#3B7BEA]/15", glyph: "doc" },
  xlsx: { color: "#1E9E5A", tile: "bg-[#E6F4EA] dark:bg-[#1E9E5A]/15", glyph: "sheet" },
  xls: { color: "#1E9E5A", tile: "bg-[#E6F4EA] dark:bg-[#1E9E5A]/15", glyph: "sheet" },
  csv: { color: "#1E9E5A", tile: "bg-[#E6F4EA] dark:bg-[#1E9E5A]/15", glyph: "sheet" },
  jpg: { color: "#8B5CF6", tile: "bg-[#F1EBFE] dark:bg-[#8B5CF6]/15", glyph: "image" },
  png: { color: "#8B5CF6", tile: "bg-[#F1EBFE] dark:bg-[#8B5CF6]/15", glyph: "image" },
  txt: { color: "#64748B", tile: "bg-[#EEF1F5] dark:bg-[#64748B]/20", glyph: "text" },
}
const FALLBACK = STYLE.txt

export const fileColor = (extension: string) => (STYLE[extension] ?? FALLBACK).color

function Glyph({ kind }: { kind: (typeof STYLE)[string]["glyph"] }) {
  switch (kind) {
    case "pdf":
      return (
        <text
          x="10"
          y="16.6"
          textAnchor="middle"
          fontSize="5.4"
          fontWeight="800"
          fill="#fff"
          fontFamily="Inter, system-ui, sans-serif"
          letterSpacing="-0.1"
        >
          PDF
        </text>
      )
    case "doc":
      return <path d="M6 10.5h8M6 13h8M6 15.5h5.5" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
    case "sheet":
      return (
        <g stroke="#fff" strokeWidth="1.1" fill="none">
          <rect x="5.6" y="9.6" width="8.8" height="7.2" rx="0.6" />
          <path d="M5.6 12h8.8M5.6 14.4h8.8M9 9.6v7.2" />
        </g>
      )
    case "image":
      return (
        <g fill="#fff">
          <circle cx="12.6" cy="10.6" r="1.25" />
          <path d="M5.4 16.6l3-3.8 2.2 2.6 1.4-1.6 2.6 2.8z" />
        </g>
      )
    default:
      return <path d="M6 10.5h8M6 13h8M6 15.5h6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.95" />
  }
}

/** A página do formato (sem fundo). `className` define o tamanho. */
export function FileTypeGlyph({ extension, className }: { extension: string; className?: string }) {
  const s = STYLE[extension] ?? FALLBACK
  return (
    <svg viewBox="0 0 20 24" aria-hidden className={cn("shrink-0", className)}>
      <path d="M4 1h8.2L18 6.8V21a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill={s.color} />
      <path d="M12.2 1v4.3a1.5 1.5 0 0 0 1.5 1.5H18z" fill="#fff" opacity="0.38" />
      <Glyph kind={s.glyph} />
    </svg>
  )
}

/** Ícone do arquivo dentro de um quadrado suave (lista de arquivos). */
export function FileTypeTile({ extension, className, glyphClassName }: { extension: string; className?: string; glyphClassName?: string }) {
  const s = STYLE[extension] ?? FALLBACK
  return (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-[9px]", s.tile, className)}>
      <FileTypeGlyph extension={extension} className={cn("h-[22px] w-[18px]", glyphClassName)} />
    </span>
  )
}

/** Selo do tipo na coluna "Tipo": ícone pequeno + extensão. */
export function TypeBadge({ extension, className }: { extension: string; className?: string }) {
  const s = STYLE[extension] ?? FALLBACK
  return (
    <span
      className={cn("inline-flex h-[22px] items-center gap-1 rounded-full px-1.5 text-[10.5px] font-semibold tracking-wide", s.tile, className)}
      style={{ color: s.color }}
    >
      <FileTypeGlyph extension={extension} className="h-3 w-2.5" />
      {extension.toUpperCase()}
    </span>
  )
}
