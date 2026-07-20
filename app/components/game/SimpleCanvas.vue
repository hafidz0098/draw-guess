<script setup lang="ts">
/**
 * Simple HTML5 canvas drawer — no Konva dependency.
 * Reliable fallback so drawing phase always works.
 */
import type { DrawTool, StrokePoint } from '~/types'
import { COLOR_PALETTE, BRUSH_SIZES } from '~/utils/constants'

const props = defineProps<{ readonly?: boolean }>()
const game = useGameStore()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const tool = ref<DrawTool>('pen')
const color = ref('#111111')
const size = ref(6)
const drawing = ref(false)

const simpleTools = [
  { id: 'pen' as const, label: 'Pen', icon: '✏️' },
  { id: 'brush' as const, label: 'Brush', icon: '🖌️' },
  { id: 'marker' as const, label: 'Marker', icon: '🖊️' },
  { id: 'eraser' as const, label: 'Hapus', icon: '🧽' },
]

let ctx: CanvasRenderingContext2D | null = null
let last: StrokePoint | null = null
let points: StrokePoint[] = []

const canDraw = computed(() => !props.readonly && game.phase === 'drawing' && game.canDraw)

onMounted(() => {
  const c = canvasEl.value
  if (!c) return
  resize()
  ctx = c.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }
  window.addEventListener('resize', resize)
  // Replay existing strokes
  redrawFromStore()
})

onUnmounted(() => {
  window.removeEventListener('resize', resize)
})

watch(() => game.strokes.length, () => {
  if (!drawing.value) redrawFromStore()
})

watch(() => game.phase, (p) => {
  if (p === 'selecting') clearLocal()
  if (p === 'drawing') {
    nextTick(() => {
      resize()
      redrawFromStore()
    })
  }
})

function resize() {
  const c = canvasEl.value
  if (!c) return
  const parent = c.parentElement
  const w = parent?.clientWidth || 800
  const h = Math.max(360, Math.round(w * 0.56))
  // Preserve drawing when resizing
  const prev = c.toDataURL()
  c.width = w
  c.height = h
  ctx = c.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    const img = new Image()
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, w, h)
    }
    img.src = prev
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }
}

function pos(e: PointerEvent): StrokePoint {
  const c = canvasEl.value!
  const r = c.getBoundingClientRect()
  return {
    x: (e.clientX - r.left) * (c.width / r.width),
    y: (e.clientY - r.top) * (c.height / r.height),
  }
}

function onDown(e: PointerEvent) {
  if (!canDraw.value || !ctx) return
  e.preventDefault()
  canvasEl.value?.setPointerCapture(e.pointerId)
  drawing.value = true
  last = pos(e)
  points = [last]
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  applyStyle()
}

function onMove(e: PointerEvent) {
  if (!drawing.value || !ctx || !last) return
  e.preventDefault()
  const p = pos(e)
  points.push(p)
  applyStyle()
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  last = p
}

function onUp(e: PointerEvent) {
  if (!drawing.value) return
  e.preventDefault()
  drawing.value = false
  if (points.length) {
    game.addStroke({
      tool: tool.value,
      color: color.value,
      size: size.value,
      opacity: 1,
      points: [...points],
      is_eraser: tool.value === 'eraser',
    })
  }
  last = null
  points = []
}

function applyStyle() {
  if (!ctx) return
  if (tool.value === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.lineWidth = size.value * 2
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = color.value
    ctx.lineWidth = tool.value === 'marker' ? size.value * 1.5 : tool.value === 'brush' ? size.value * 1.2 : size.value
  }
}

function clearLocal() {
  const c = canvasEl.value
  if (!c || !ctx) return
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
}

function onClear() {
  game.clearCanvas()
  clearLocal()
}

function redrawFromStore() {
  const c = canvasEl.value
  if (!c || !ctx) return
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  for (const s of game.strokes) {
    if (!s.points?.length) continue
    ctx.beginPath()
    if (s.is_eraser || s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth = s.size * 2
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.size
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.moveTo(s.points[0].x, s.points[0].y)
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y)
    }
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- Toolbar -->
    <div
      v-if="canDraw"
      class="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-600 bg-slate-800 p-2"
    >
      <button
        v-for="t in simpleTools"
        :key="t.id"
        type="button"
        class="rounded-xl px-3 py-2 text-sm font-bold transition"
        :class="tool === t.id ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'"
        @click="tool = t.id"
      >
        {{ t.icon }} {{ t.label }}
      </button>

      <div class="mx-1 h-6 w-px bg-slate-600" />

      <button
        v-for="c in COLOR_PALETTE.slice(0, 12)"
        :key="c"
        type="button"
        class="h-6 w-6 rounded-md border-2"
        :class="color === c ? 'border-orange-400 scale-110' : 'border-slate-500'"
        :style="{ backgroundColor: c }"
        @click="color = c"
      />
      <input v-model="color" type="color" class="h-8 w-8 cursor-pointer rounded bg-transparent">

      <label class="flex items-center gap-1 text-xs font-bold text-slate-300">
        Size
        <select v-model.number="size" class="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-white">
          <option v-for="s in BRUSH_SIZES" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>

      <button
        type="button"
        class="ml-auto rounded-xl bg-red-500/20 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-500/30"
        @click="onClear"
      >
        Clear
      </button>
    </div>

    <div
      v-else
      class="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-center text-sm font-bold text-slate-300"
    >
      👀 Mode tonton — menunggu drawer menggambar
    </div>

    <!-- White canvas — always visible -->
    <div class="overflow-hidden rounded-2xl border-4 border-orange-500 bg-white shadow-lg">
      <canvas
        ref="canvasEl"
        class="block w-full cursor-crosshair touch-none"
        style="min-height: 360px; background: #fff;"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      />
    </div>
  </div>
</template>
