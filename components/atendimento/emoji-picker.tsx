"use client"

import { Smile } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const GROUPS: { label: string; emojis: string[] }[] = [
  { label: "Frequentes", emojis: ["👍", "🙏", "😊", "🙂", "😉", "✅", "👏", "🤝", "👋", "❤️", "🎉", "😅"] },
  {
    label: "Expressões",
    emojis: ["😀", "😁", "😂", "🤣", "😃", "😄", "😆", "😍", "🥰", "😘", "😎", "🤗", "🤔", "🤨", "😐", "😶", "🙄", "😮", "😯", "😲", "😴", "😌", "😔", "😢", "😭", "😤", "😡", "🥺", "😬", "🤐"],
  },
  { label: "Gestos", emojis: ["👌", "✌️", "🤞", "👊", "✊", "🤙", "💪", "🙌", "👐", "🤲", "☝️", "👆", "👇", "👉", "👈", "✍️"] },
  { label: "Escritório", emojis: ["⚖️", "📄", "📑", "📎", "📌", "📅", "🗓️", "⏰", "⏳", "📞", "📱", "💼", "🏛️", "🖊️", "📝", "📬", "📦", "🔒", "🔑", "💰", "🧾", "🏠", "🚗", "🩺"] },
  { label: "Símbolos", emojis: ["✔️", "❌", "⚠️", "❗", "❓", "⭐", "✨", "🔔", "💡", "🔥", "💬", "➡️", "⬅️", "🔴", "🟢", "🟡"] },
]

export function EmojiPicker({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        aria-label="Inserir emoji"
        className="flex size-9 shrink-0 items-center justify-center rounded-[9px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 disabled:opacity-50 aria-expanded:bg-accent aria-expanded:text-foreground"
      >
        <Smile className="size-[18px]" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[292px] gap-0 p-0">
        <div className="max-h-[280px] overflow-y-auto p-2 thin-scrollbar">
          {GROUPS.map((group) => (
            <section key={group.label} className="mb-1.5 last:mb-0">
              <p className="px-1 pt-1 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">{group.label}</p>
              <div className="grid grid-cols-8">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onPick(emoji)}
                    className="flex size-8 items-center justify-center rounded-[7px] text-[18px] outline-none transition-transform hover:scale-110 hover:bg-accent focus-visible:ring-2 focus-visible:ring-gold/40"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
