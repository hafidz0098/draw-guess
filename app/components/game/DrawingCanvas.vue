<script setup lang="ts">
import type { DrawTool, DrawingStroke, StrokePoint } from '~/types'
import { COLOR_PALETTE, BRUSH_SIZES, DRAW_TOOLS } from '~/utils/constants'

const props = defineProps<{
  readonly?: boolean
}>()

const game = useGameStore()
const wrapRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLDivElement | null>(null)
const ready = ref(false)
const errorMsg = ref('')

const tool = ref<DrawTool>('pen')
const color = ref('#000000')
const size = ref(6)
const opacity = ref(1)
const isDrawing = ref(false)
const currentPoints = ref<StrokePoint[]>([])
const shapeStart = ref<StrokePoint | null>(null)

let Konva: typeof import('konva').default | null = null
let stage: import('konva').default.Stage | null = null
let layer: import('konva').default.Layer | null = null
let currentLine: import('konva').default.Line | null = null

const shapeTools: DrawTool[] = ['rectangle', 'circle', 'triangle', 'arrow', 'line']

const canDrawNow = computed(() => !props.readonly && game.canDraw)

onMounted(async () => {
  try {
    Konva = (await import('konva')).default
    await nextTick()
    initStage()
    ready.value = true
    window.addEventListener('resize', fitStage)
    // Fit again after layout settles
    requestAnimationFrame(() => fitStage())
    setTimeout(() => fitStage(), 100)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Gagal load canvas'
    console.error('[canvas]', e)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', fitStage)
  stage?.destroy()
  stage = null
  layer = null
})

watch(() => game.strokes.length, () => {
  if (!isDrawing.value) redrawAll()
})

watch(() => game.phase, (p) => {
  if (p === 'selecting') {
    clearStage()
  }
  // When entering drawing, re-fit
  if (p === 'drawing') {
    nextTick(() => {
      if (!stage) initStage()
      fitStage()
    })
  }
})

function initStage() {
  if (!canvasRef.value || !Konva) return
  // Destroy previous
  if (stage) {
    stage.destroy()
    stage = null
  }

  const w = wrapRef.value?.clientWidth || 800
  const h = Math.max(320, Math.round(w * (540 / 960)))

  stage = new Konva.Stage({
    container: canvasRef.value,
    width: w,
    height: h,
  })
  layer = new Konva.Layer()
  // White background so canvas is visible
  const bg = new Konva.Rect({
    x: 0,
    y: 0,
    width: w,
    height: h,
    fill: '#ffffff',
    listening: false,
    name: 'bg',
  })
  layer.add(bg)
  stage.add(layer)

  stage.on('mousedown touchstart', onPointerDown)
  stage.on('mousemove touchmove', onPointerMove)
  stage.on('mouseup touchend mouseleave', onPointerUp)

  layer.batchDraw()
}

function fitStage() {
  if (!wrapRef.value || !stage || !layer) return
  const w = wrapRef.value.clientWidth || 800
  const h = Math.max(320, Math.round(w * (540 / 960)))
  stage.width(w)
  stage.height(h)
  const bg = layer.findOne('.bg') as import('konva').default.Rect | undefined
  if (bg) {
    bg.width(w)
    bg.height(h)
  }
  stage.draw()
}

function getPos(): StrokePoint | null {
  if (!stage) return null
  const pos = stage.getPointerPosition()
  if (!pos) return null
  return { x: pos.x, y: pos.y, p: 0.5 }
}

function toolStyle(t: DrawTool) {
  const base = size.value
  switch (t) {
    case 'pencil':
      return { strokeWidth: Math.max(1, base * 0.6), lineCap: 'round' as const, globalCompositeOperation: 'source-over' as GlobalCompositeOperation, opacity: opacity.value * 0.85 }
    case 'marker':
      return { strokeWidth: base * 1.4, lineCap: 'square' as const, globalCompositeOperation: 'source-over' as GlobalCompositeOperation, opacity: opacity.value }
    case 'highlighter':
      return { strokeWidth: base * 2.5, lineCap: 'square' as const, globalCompositeOperation: 'source-over' as GlobalCompositeOperation, opacity: Math.min(0.4, opacity.value) }
    case 'brush':
      return { strokeWidth: base * 1.2, lineCap: 'round' as const, globalCompositeOperation: 'source-over' as GlobalCompositeOperation, opacity: opacity.value * 0.9 }
    case 'eraser':
      return { strokeWidth: base * 2, lineCap: 'round' as const, globalCompositeOperation: 'destination-out' as GlobalCompositeOperation, opacity: 1 }
    default:
      return { strokeWidth: base, lineCap: 'round' as const, globalCompositeOperation: 'source-over' as GlobalCompositeOperation, opacity: opacity.value }
  }
}

function onPointerDown(e?: { evt?: Event }) {
  e?.evt?.preventDefault?.()
  if (!canDrawNow.value || !Konva || !layer || !stage) return
  const pos = getPos()
  if (!pos) return

  if (tool.value === 'bucket') {
    const rect = new Konva.Rect({
      x: 0, y: 0, width: stage.width(), height: stage.height(),
      fill: color.value, opacity: opacity.value,
    })
    layer.add(rect)
    layer.batchDraw()
    game.addStroke({
      tool: 'bucket',
      color: color.value,
      size: size.value,
      opacity: opacity.value,
      points: [pos],
      is_eraser: false,
      shape_data: { fill: color.value },
    })
    return
  }

  isDrawing.value = true
  currentPoints.value = [pos]
  shapeStart.value = pos

  if (shapeTools.includes(tool.value)) return

  const style = toolStyle(tool.value)
  currentLine = new Konva.Line({
    stroke: color.value,
    strokeWidth: style.strokeWidth,
    lineCap: style.lineCap,
    lineJoin: 'round',
    globalCompositeOperation: style.globalCompositeOperation,
    opacity: style.opacity,
    points: [pos.x, pos.y],
    tension: tool.value === 'brush' ? 0.4 : 0,
  })
  layer.add(currentLine)
}

function onPointerMove(e?: { evt?: Event }) {
  e?.evt?.preventDefault?.()
  if (!isDrawing.value || !canDrawNow.value || !stage) return
  const pos = getPos()
  if (!pos) return

  currentPoints.value.push(pos)

  if (tool.value === 'spray' && Konva && layer) {
    for (let i = 0; i < 4; i++) {
      const dx = (Math.random() - 0.5) * size.value * 2
      const dy = (Math.random() - 0.5) * size.value * 2
      layer.add(new Konva.Circle({
        x: pos.x + dx,
        y: pos.y + dy,
        radius: Math.max(1, size.value / 6),
        fill: color.value,
        opacity: opacity.value * 0.4,
      }))
    }
    layer.batchDraw()
    return
  }

  if (shapeTools.includes(tool.value)) {
    redrawAll()
    drawPreviewShape(shapeStart.value!, pos)
    return
  }

  if (currentLine) {
    currentLine.points(currentLine.points().concat([pos.x, pos.y]))
    layer?.batchDraw()
  }
}

function onPointerUp() {
  if (!isDrawing.value || !canDrawNow.value) {
    isDrawing.value = false
    return
  }
  isDrawing.value = false

  const points = [...currentPoints.value]
  if (!points.length) return

  const end = points[points.length - 1]
  const start = shapeStart.value || points[0]

  if (shapeTools.includes(tool.value)) {
    game.addStroke({
      tool: tool.value,
      color: color.value,
      size: size.value,
      opacity: opacity.value,
      points: [start, end],
      is_eraser: false,
      shape_data: { x1: start.x, y1: start.y, x2: end.x, y2: end.y },
    })
    redrawAll()
  } else {
    game.addStroke({
      tool: tool.value,
      color: color.value,
      size: size.value,
      opacity: opacity.value,
      points,
      is_eraser: tool.value === 'eraser',
    })
  }

  currentLine = null
  currentPoints.value = []
  shapeStart.value = null
}

function drawPreviewShape(start: StrokePoint, end: StrokePoint) {
  if (!Konva || !layer) return
  const shape = makeShape(tool.value, start, end, color.value, size.value, opacity.value)
  if (shape) {
    layer.add(shape)
    layer.batchDraw()
  }
}

function makeShape(
  t: DrawTool,
  start: StrokePoint,
  end: StrokePoint,
  col: string,
  sz: number,
  op: number,
): import('konva').default.Shape | null {
  if (!Konva) return null
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const w = Math.abs(end.x - start.x)
  const h = Math.abs(end.y - start.y)

  switch (t) {
    case 'rectangle':
      return new Konva.Rect({ x, y, width: w, height: h, stroke: col, strokeWidth: sz, opacity: op })
    case 'circle':
      return new Konva.Ellipse({
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        radiusX: w / 2,
        radiusY: h / 2,
        stroke: col,
        strokeWidth: sz,
        opacity: op,
      })
    case 'line':
      return new Konva.Line({
        points: [start.x, start.y, end.x, end.y],
        stroke: col, strokeWidth: sz, opacity: op, lineCap: 'round',
      })
    case 'arrow':
      return new Konva.Arrow({
        points: [start.x, start.y, end.x, end.y],
        stroke: col, fill: col, strokeWidth: sz, opacity: op,
        pointerLength: 12, pointerWidth: 12,
      })
    case 'triangle':
      return new Konva.Line({
        points: [(start.x + end.x) / 2, start.y, end.x, end.y, start.x, end.y],
        closed: true, stroke: col, strokeWidth: sz, opacity: op,
      })
    default:
      return null
  }
}

function clearStage() {
  if (!layer || !stage || !Konva) return
  layer.destroyChildren()
  layer.add(new Konva.Rect({
    x: 0, y: 0, width: stage.width(), height: stage.height(),
    fill: '#ffffff', listening: false, name: 'bg',
  }))
  layer.batchDraw()
}

function redrawAll() {
  if (!Konva || !layer || !stage) return
  layer.destroyChildren()
  layer.add(new Konva.Rect({
    x: 0, y: 0, width: stage.width(), height: stage.height(),
    fill: '#ffffff', listening: false, name: 'bg',
  }))
  for (const stroke of game.strokes) {
    renderStroke(stroke)
  }
  layer.batchDraw()
}

function renderStroke(stroke: DrawingStroke) {
  if (!Konva || !layer || !stage) return

  if (stroke.tool === 'bucket' && stroke.shape_data) {
    layer.add(new Konva.Rect({
      x: 0, y: 0, width: stage.width(), height: stage.height(),
      fill: (stroke.shape_data.fill as string) || stroke.color,
      opacity: stroke.opacity,
    }))
    return
  }

  if (shapeTools.includes(stroke.tool) && stroke.points.length >= 2) {
    const shape = makeShape(
      stroke.tool,
      stroke.points[0],
      stroke.points[stroke.points.length - 1],
      stroke.color,
      stroke.size,
      stroke.opacity,
    )
    if (shape) layer.add(shape)
    return
  }

  if (stroke.tool === 'spray') {
    for (const p of stroke.points) {
      layer.add(new Konva.Circle({
        x: p.x, y: p.y,
        radius: Math.max(1, stroke.size / 6),
        fill: stroke.color,
        opacity: stroke.opacity * 0.4,
      }))
    }
    return
  }

  const flat: number[] = []
  for (const p of stroke.points) flat.push(p.x, p.y)
  const isEraser = stroke.is_eraser || stroke.tool === 'eraser'
  layer.add(new Konva.Line({
    points: flat,
    stroke: stroke.color,
    strokeWidth: stroke.tool === 'marker' ? stroke.size * 1.4 : stroke.size,
    lineCap: stroke.tool === 'marker' ? 'square' : 'round',
    lineJoin: 'round',
    opacity: stroke.tool === 'highlighter' ? Math.min(0.4, stroke.opacity) : stroke.opacity,
    globalCompositeOperation: isEraser ? 'destination-out' : 'source-over',
    tension: stroke.tool === 'brush' ? 0.4 : 0,
  }))
}

function setTool(t: string) {
  tool.value = t as DrawTool
}

function onClear() {
  game.clearCanvas()
  clearStage()
}
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <!-- Toolbar -->
    <div
      v-if="canDrawNow"
      class="card flex flex-wrap items-center gap-1 p-2"
    >
      <button
        v-for="t in DRAW_TOOLS"
        :key="t.id"
        type="button"
        class="rounded-lg p-2 transition-colors"
        :class="tool === t.id ? 'bg-orange-500/20 text-orange-300' : 'text-slate-300 hover:bg-slate-700'"
        :title="t.label"
        @click="setTool(t.id)"
      >
        <Icon :name="t.icon" class="h-5 w-5" />
      </button>

      <div class="mx-1 h-6 w-px bg-slate-600" />

      <button type="button" class="rounded-lg p-2 text-slate-300 hover:bg-slate-700" title="Undo" @click="game.undo(); redrawAll()">↶</button>
      <button type="button" class="rounded-lg p-2 text-slate-300 hover:bg-slate-700" title="Redo" @click="game.redo(); redrawAll()">↷</button>
      <button type="button" class="rounded-lg p-2 text-red-400 hover:bg-slate-700" title="Clear" @click="onClear">🗑</button>

      <div class="mx-1 h-6 w-px bg-slate-600" />

      <div class="flex flex-wrap gap-1">
        <button
          v-for="c in COLOR_PALETTE"
          :key="c"
          type="button"
          class="h-5 w-5 rounded-md border border-slate-600"
          :class="color === c ? 'ring-2 ring-orange-400 ring-offset-1 ring-offset-slate-800' : ''"
          :style="{ backgroundColor: c }"
          @click="color = c"
        />
      </div>
      <input v-model="color" type="color" class="h-7 w-7 cursor-pointer rounded border-0 bg-transparent">

      <label class="ml-2 flex items-center gap-1 text-xs font-bold text-slate-400">
        Size
        <select v-model.number="size" class="rounded-lg border border-slate-600 bg-slate-900 px-1 py-0.5 text-sm text-white">
          <option v-for="s in BRUSH_SIZES" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
    </div>

    <div v-else class="rounded-xl bg-slate-800 px-3 py-2 text-center text-xs font-bold text-slate-400">
      Mode tonton — kamu tidak menggambar di ronde ini
    </div>

    <!-- Canvas area — fixed min height so never 0 -->
    <div
      ref="wrapRef"
      class="relative w-full overflow-hidden rounded-2xl border-2 border-slate-600 bg-white"
      style="min-height: 360px; touch-action: none;"
    >
      <div
        ref="canvasRef"
        class="h-full w-full"
        style="min-height: 360px;"
      />
      <div v-if="!ready && !errorMsg" class="absolute inset-0 flex items-center justify-center bg-white text-slate-500">
        Memuat canvas...
      </div>
      <div v-if="errorMsg" class="absolute inset-0 flex items-center justify-center bg-red-50 text-red-600">
        {{ errorMsg }}
      </div>
      <!-- Emotes -->
      <div class="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          v-for="e in game.emotes"
          :key="e.timestamp + e.user_id"
          class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-4xl"
        >
          {{ e.emoji }}
        </div>
      </div>
    </div>
  </div>
</template>
