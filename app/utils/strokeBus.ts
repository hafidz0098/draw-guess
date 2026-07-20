import type { DrawingStroke } from '~/types'

/** Lightweight event bus for stroke batches (no Pinia). */
const strokeListeners = new Set<(strokes: DrawingStroke[]) => void>()

export function useStrokeBus() {
  return {
    emit(strokes: DrawingStroke[]) {
      strokeListeners.forEach(fn => fn(strokes))
    },
    on(fn: (strokes: DrawingStroke[]) => void) {
      strokeListeners.add(fn)
      return () => strokeListeners.delete(fn)
    },
  }
}
