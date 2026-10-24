import { Extension } from "@tiptap/core"
import { Selection } from "@tiptap/pm/state"

/** Alt+Shift+↑/↓ move o bloco do cursor (reordenação pelo teclado; o mouse usa a alça). */
export const MoveBlock = Extension.create({
  name: "moveBlock",
  addKeyboardShortcuts() {
    const move = (dir: -1 | 1) => () => {
      const { state, view } = this.editor
      const { $from } = state.selection
      if ($from.depth < 1) return false
      const index = $from.index(0)
      const doc = state.doc
      const target = index + dir
      if (target < 0 || target >= doc.childCount) return false
      const node = doc.child(index)
      let start = 0
      for (let i = 0; i < index; i++) start += doc.child(i).nodeSize
      const offsetInNode = $from.pos - start
      const neighbour = doc.child(target)
      const tr = state.tr.delete(start, start + node.nodeSize)
      const insertAt = dir === -1 ? start - neighbour.nodeSize : start + neighbour.nodeSize
      tr.insert(insertAt, node)
      tr.setSelection(Selection.near(tr.doc.resolve(Math.min(insertAt + offsetInNode, tr.doc.content.size))))
      view.dispatch(tr.scrollIntoView())
      return true
    }
    return { "Alt-Shift-ArrowUp": move(-1), "Alt-Shift-ArrowDown": move(1) }
  },
})
