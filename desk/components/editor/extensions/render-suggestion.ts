import { ReactRenderer } from "@tiptap/react"
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion"
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "../suggestion-list"

/** Liga uma sugestão do Tiptap à lista React, posicionada junto ao cursor. */
export function renderSuggestion(empty?: string): NonNullable<SuggestionOptions<SuggestionItem, SuggestionItem>["render"]> {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle> | null = null
    let unmount: (() => void) | null = null
    const toProps = (p: SuggestionProps<SuggestionItem, SuggestionItem>) => ({ items: p.items, command: p.command, loading: p.loading, empty, query: p.query })
    return {
      onStart: (props) => {
        renderer = new ReactRenderer(SuggestionList, { props: toProps(props), editor: props.editor })
        const el = renderer.element as HTMLElement
        el.style.zIndex = "70"
        unmount = props.mount(el)
      },
      onUpdate: (props) => renderer?.updateProps(toProps(props)),
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          unmount?.()
          unmount = null
          return true
        }
        return renderer?.ref?.onKeyDown(props.event) ?? false
      },
      onExit: () => {
        unmount?.()
        renderer?.destroy()
        renderer = null
        unmount = null
      },
    }
  }
}
