<script setup lang="ts">
import { toast } from 'vue-sonner'
import { storeToRefs } from 'pinia'
import type { WordChoice, StrokePoint, DrawingStroke } from '~/types'
import { COLOR_PALETTE, BRUSH_SIZES, WORD_SELECT_TIME } from '~/utils/constants'

definePageMeta({ layout: 'game' })

const route = useRoute()
const auth = useAuthStore()
const roomStore = useRoomStore()
const game = useGameStore()
const { play } = useSound()

const {
  phase, selectedWord, isDrawer, canDraw, timeLeft,
  wordChoices, drawerId, wordHint, strokes,
} = storeToRefs(game)
const { room, isHost, connectedPlayers } = storeToRefs(roomStore)

const code = computed(() => String(route.params.code || '').toUpperCase())
const loading = ref(true)
const statusMsg = ref('init')

const canvasEl = ref<HTMLCanvasElement | null>(null)
const tool = ref<'pen' | 'brush' | 'marker' | 'eraser'>('pen')
const ink = ref('#000000') // black ink on white canvas
const brushSize = ref(8)
const painting = ref(false)

let ctx: CanvasRenderingContext2D | null = null
let last: StrokePoint | null = null
let pts: StrokePoint[] = []
let liveSeq = 0
let liveThrottle: ReturnType<typeof setTimeout> | null = null

const channel = useRoomChannel(computed(() => room.value?.id))

const words = computed((): WordChoice[] => {
  if (wordChoices.value?.length) return wordChoices.value as WordChoice[]
  return [
    { id: '1', text: 'Kucing', difficulty: 'easy' },
    { id: '2', text: 'Pesawat', difficulty: 'easy' },
    { id: '3', text: 'Helikopter', difficulty: 'medium' },
  ]
})

const isSelecting = computed(() => phase.value === 'selecting')
const isDrawing = computed(() => phase.value === 'drawing' || phase.value === 'revealing')
const showWordPicker = computed(() => isSelecting.value && isDrawer.value)

const drawerName = computed(() => {
  const m = connectedPlayers.value.find(p => p.user_id === drawerId.value)
  return m?.profile?.nickname || (isDrawer.value ? 'Kamu' : 'Pemain lain')
})

const hintDisplay = computed(() => {
  if (isDrawer.value) return selectedWord.value || ''
  if (wordHint.value?.length) return wordHint.value.join(' ')
  if (selectedWord.value) return selectedWord.value.replace(/[^ ]/g, '_').split('').join(' ')
  return '…'
})

// —— Realtime: apply remote strokes to canvas immediately ——
let offStrokes: (() => void) | null = null
let offGame: (() => void) | null = null

onMounted(async () => {
  try {
    statusMsg.value = 'auth'
    await auth.init()
    await auth.ensureSupabaseUser()

    statusMsg.value = 'room'
    if (!room.value || room.value.code !== code.value) {
      try { await roomStore.joinRoom(code.value) } catch { /* */ }
    }
    await roomStore.refreshLobbyState()

    if (room.value && room.value.status !== 'playing') {
      try { await roomStore.startGame() }
      catch { if (room.value) room.value.status = 'playing' }
    }

    // Wire realtime handlers
    offStrokes = channel.onStrokes((remote) => {
      handleRemoteStrokes(remote)
    })
    offGame = channel.onGame((type, data) => {
      handleGameEvent(type, data)
    })

    statusMsg.value = 'round'
    game.reset()

    const alone = connectedPlayers.value.length <= 1
    if (isHost.value || alone) {
      await game.beginRound()
      channel.sendGame('round_start', {
        roundNumber: game.roundNumber,
        drawerId: game.drawerId,
        timeLeft: WORD_SELECT_TIME,
        roundId: roomStore.currentRound?.id,
      })
    } else {
      statusMsg.value = 'wait round'
      await new Promise(r => setTimeout(r, 600))
      if (phase.value === 'idle') await game.beginRound()
    }

    statusMsg.value = isDrawer.value ? 'DRAWER' : 'GUESSER'
    toast.success(
      isDrawer.value ? 'Giliranmu menggambar — pilih kata!' : `${drawerName.value} memilih kata...`,
    )
  } catch (e: unknown) {
    statusMsg.value = e instanceof Error ? e.message : 'error'
    toast.error(statusMsg.value)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  offStrokes?.()
  offGame?.()
})

function handleGameEvent(type: string, data: Record<string, unknown>) {
  if (type === 'next_round' || type === 'round_start') {
    // ALL non-initiating clients (and host if echo): leave scoreboard → selecting
    const dId = String(data.drawerId || '')
    const rn = Number(data.roundNumber) || 1

    // Host already ran nextRound locally for next_round — skip double begin
    if (type === 'next_round' && isHost.value) {
      // Host already in selecting from nextRound(); ensure phase
      if (phase.value === 'scoreboard' || phase.value === 'revealing') {
        game.$patch({ phase: 'selecting' })
      }
      return
    }

    // Non-host (or late join): force transition off scoreboard
    game.startRemoteNextRound({
      roundNumber: rn,
      drawerId: dId,
      scores: data.scores as { user_id: string; score: number }[] | undefined,
    }).then(() => {
      statusMsg.value = game.isDrawer ? 'DRAWER ronde ' + rn : 'GUESSER ronde ' + rn
      toast.message(
        game.isDrawer
          ? `Ronde ${rn}: giliranmu menggambar!`
          : `Ronde ${rn}: tunggu drawer pilih kata`,
      )
    })
  } else if (type === 'word_selected') {
    const dId = String(data.drawerId || '')
    if (auth.user?.id && dId === auth.user.id) return
    game.onRemoteWordSelected({
      word: String(data.word || ''),
      drawerId: dId,
      drawTime: Number(data.drawTime) || 60,
      roundId: data.roundId as string | undefined,
    })
    nextTick(() => setupCanvas(true))
  } else if (type === 'game_over') {
    if (Array.isArray(data.scores)) {
      for (const s of data.scores as { user_id: string; score: number }[]) {
        const m = roomStore.members.find(x => x.user_id === s.user_id)
        if (m) m.score = s.score
      }
    }
    game.finishGame()
  }
}

function handleRemoteStrokes(remote: DrawingStroke[]) {
  // Clear signal
  if (remote.some(s => s.shape_data && (s.shape_data as { clear?: boolean }).clear)) {
    game.strokes.splice(0, game.strokes.length)
    setupCanvas(true)
    return
  }

  if (!ctx) setupCanvas(true)

  // Committed strokes (sequence >= 0) go to store
  const fullOnly = remote.filter(
    s => s.points.length >= 2
      && typeof s.sequence === 'number'
      && s.sequence >= 0
      && !(s.shape_data as { live?: boolean } | null)?.live,
  )
  if (fullOnly.length) {
    game.applyRemoteStrokes(fullOnly)
  }

  // Paint every remote segment immediately (live + final) so guessers see drawing
  if (!ctx) setupCanvas(true)
  for (const s of remote) {
    if (!s.points || s.points.length < 2) continue
    paintSegment(
      s.points,
      s.color || '#000000',
      s.size || 6,
      !!(s.is_eraser || s.tool === 'eraser'),
    )
  }
}

function pick(w: WordChoice) {
  if (!isDrawer.value) {
    toast.error('Bukan giliranmu menggambar')
    return
  }
  game.selectWord(w)
  channel.sendGame('word_selected', {
    word: w.text,
    drawerId: drawerId.value || auth.user?.id,
    drawTime: room.value?.draw_time ?? 60,
    roundId: roomStore.currentRound?.id,
  })
  toast.success(`Gambar: ${w.text}`)
  requestAnimationFrame(() => {
    setupCanvas(true)
    setTimeout(() => setupCanvas(true), 50)
    setTimeout(() => setupCanvas(true), 200)
  })
}

watch(phase, (p) => {
  if (p === 'drawing') {
    play('countdown')
    nextTick(() => setupCanvas(true))
  }
})

/** Setup white canvas. forceFill=true always paints white background */
function setupCanvas(forceFill = true) {
  const c = canvasEl.value
  if (!c) return

  const box = c.parentElement
  const w = Math.max(300, Math.floor(box?.clientWidth || window.innerWidth - 40))
  const h = 400

  // Setting width/height resets the bitmap — always re-fill white after
  c.width = w
  c.height = h
  c.style.width = '100%'
  c.style.height = `${h}px`
  c.style.backgroundColor = '#ffffff'
  c.style.display = 'block'

  // Do NOT use { alpha: false } — causes black canvas in some browsers
  ctx = c.getContext('2d')
  if (!ctx) return

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  statusMsg.value = `canvas putih ${w}x${h}`

  if (forceFill) {
    for (const s of strokes.value) {
      if (s.points?.length >= 2) {
        paintSegment(s.points, s.color, s.size, !!(s.is_eraser || s.tool === 'eraser'))
      }
    }
  }
}

function ensureCtx() {
  if (!ctx || !canvasEl.value) setupCanvas(false)
  return !!ctx
}

function paintSegment(points: StrokePoint[], col: string, sz: number, erase: boolean) {
  if (!ensureCtx() || !ctx || points.length < 1) return
  ctx.save()
  if (erase) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.lineWidth = Math.max(4, sz * 2)
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = col || '#111111'
    ctx.lineWidth = Math.max(1, sz || 6)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.stroke()
  ctx.restore()
}

function pos(e: PointerEvent): StrokePoint {
  const c = canvasEl.value!
  const r = c.getBoundingClientRect()
  return {
    x: (e.clientX - r.left) * (c.width / Math.max(1, r.width)),
    y: (e.clientY - r.top) * (c.height / Math.max(1, r.height)),
  }
}

function styleLocal() {
  if (!ctx) return
  if (tool.value === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineWidth = brushSize.value * 3
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = ink.value
    ctx.lineWidth = tool.value === 'marker' ? brushSize.value * 2 : brushSize.value
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

function down(e: PointerEvent) {
  if (!canDraw.value) return
  if (!ctx) setupCanvas(true)
  if (!ctx) return
  e.preventDefault()
  try { canvasEl.value?.setPointerCapture(e.pointerId) } catch { /* */ }
  painting.value = true
  last = pos(e)
  pts = [last]
  styleLocal()
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
}

function move(e: PointerEvent) {
  if (!painting.value || !ctx || !last || !canDraw.value) return
  e.preventDefault()
  const p = pos(e)
  pts.push(p)
  styleLocal()
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()

  // Live broadcast every ~40ms so guessers see drawing in real-time
  if (!liveThrottle) {
    liveThrottle = setTimeout(() => {
      liveThrottle = null
      const roundId = roomStore.currentRound?.id || 'live'
      // send last segment (last few points)
      const slice = pts.slice(-12)
      if (slice.length >= 2) {
        channel.sendLiveStroke({
          round_id: roundId,
          color: ink.value,
          size: brushSize.value,
          tool: tool.value,
          is_eraser: tool.value === 'eraser',
          points: slice.map(pt => ({ x: pt.x, y: pt.y })),
          seq: liveSeq++,
        })
      }
    }, 40)
  }

  last = p
}

function up(e: PointerEvent) {
  if (!painting.value) return
  e.preventDefault()
  painting.value = false
  if (liveThrottle) {
    clearTimeout(liveThrottle)
    liveThrottle = null
  }
  if (pts.length > 1 && canDraw.value) {
    // Commit full stroke to store + reliable broadcast
    game.addStroke({
      tool: tool.value,
      color: ink.value,
      size: brushSize.value,
      opacity: 1,
      points: [...pts],
      is_eraser: tool.value === 'eraser',
    })
    // Also send immediately via channel (don't wait only on bus)
    const lastStroke = game.strokes[game.strokes.length - 1]
    if (lastStroke) {
      channel.sendStrokes([lastStroke])
    }
  }
  last = null
  pts = []
  if (ctx) ctx.globalCompositeOperation = 'source-over'
}

function clearAll() {
  if (!canDraw.value) return
  game.clearCanvas()
  channel.sendClear()
  setupCanvas(true)
}

// Bridge store stroke bus → realtime channel
onMounted(() => {
  const bus = useStrokeBus()
  const off = bus.on((batch) => {
    if (batch?.length) channel.sendStrokes(batch)
  })
  onUnmounted(() => { off() })
})
</script>

<template>
  <div style="min-height:100vh;background:#0f172a;color:#f8fafc;padding:12px;">
    <div style="background:#000;border:1px solid #475569;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-family:monospace;font-size:12px;">
      phase=<b style="color:#fb923c">{{ phase }}</b>
      · role=<b :style="{ color: isDrawer ? '#4ade80' : '#60a5fa' }">{{ isDrawer ? 'DRAWER' : 'GUESSER' }}</b>
      · {{ isDrawer ? (selectedWord || '—') : hintDisplay }}
      · ⏱{{ timeLeft }}s · {{ statusMsg }}
    </div>

    <div v-if="loading" style="text-align:center;padding:48px;color:#94a3b8">
      Memuat... {{ statusMsg }}
    </div>

    <!-- SELECT -->
    <div v-show="!loading && isSelecting">
      <div v-if="showWordPicker" style="max-width:480px;margin:0 auto;background:#1e293b;border:2px solid #475569;border-radius:16px;padding:24px;text-align:center;">
        <h2 style="font-size:24px;font-weight:900;margin:0 0 8px;">Giliranmu menggambar!</h2>
        <p style="color:#94a3b8;font-size:14px;">Pilih kata — lawan menebak</p>
        <p style="color:#fb923c;font-weight:800;">⏱ {{ timeLeft }}s</p>
        <button
          v-for="w in words"
          :key="w.id"
          type="button"
          style="display:block;width:100%;margin:10px 0;padding:16px;border-radius:12px;border:2px solid #64748b;background:#0f172a;color:#fff;font-size:20px;font-weight:900;cursor:pointer;text-align:left;"
          @click="pick(w)"
        >
          {{ w.text }}
          <small style="color:#94a3b8;font-size:12px;margin-left:8px;">{{ w.difficulty }}</small>
        </button>
      </div>
      <div v-else style="max-width:480px;margin:0 auto;background:#1e293b;border:2px solid #475569;border-radius:16px;padding:32px;text-align:center;">
        <p style="font-size:40px;margin:0;">🎨</p>
        <h2 style="font-size:20px;font-weight:900;">{{ drawerName }} memilih kata...</h2>
        <p style="color:#94a3b8;">Kamu akan menebak</p>
      </div>
    </div>

    <!-- DRAW / GUESS -->
    <div v-show="!loading && isDrawing">
      <div
        :style="{
          background: isDrawer ? '#f97316' : '#2563eb',
          color: '#fff', borderRadius: '12px', padding: '16px',
          textAlign: 'center', marginBottom: '12px',
        }"
      >
        <div style="font-size:20px;font-weight:900;">
          <template v-if="isDrawer">✏️ GAMBAR: {{ selectedWord }}</template>
          <template v-else>👀 TEBAK: {{ hintDisplay }} · ⏱ {{ timeLeft }}s</template>
        </div>
        <div style="font-size:13px;margin-top:4px;opacity:0.9;">
          Drawer: {{ drawerName }}
          <span v-if="!isDrawer"> · Ketik tebakan di chat</span>
        </div>
      </div>

      <div
        v-if="canDraw"
        style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#1e293b;border-radius:12px;padding:10px;margin-bottom:10px;"
      >
        <button
          v-for="t in [
            { id: 'pen', l: '✏️ Pen' },
            { id: 'brush', l: '🖌️ Brush' },
            { id: 'marker', l: '🖊️ Marker' },
            { id: 'eraser', l: '🧽 Hapus' },
          ]"
          :key="t.id"
          type="button"
          :style="{
            padding: '8px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 800,
            background: tool === t.id ? '#f97316' : '#334155', color: '#fff',
          }"
          @click="tool = t.id as any"
        >
          {{ t.l }}
        </button>
        <button
          v-for="c in COLOR_PALETTE.slice(0, 10)"
          :key="c"
          type="button"
          :style="{
            width: '28px', height: '28px', borderRadius: '6px', background: c, cursor: 'pointer',
            border: ink === c ? '3px solid #f97316' : '2px solid #64748b',
          }"
          @click="ink = c"
        />
        <select
          v-model.number="brushSize"
          style="background:#0f172a;color:#fff;border:1px solid #475569;border-radius:8px;padding:6px;"
        >
          <option v-for="s in BRUSH_SIZES" :key="s" :value="s">{{ s }}px</option>
        </select>
        <button
          type="button"
          style="margin-left:auto;background:#dc2626;color:#fff;border:none;border-radius:10px;padding:8px 14px;font-weight:800;cursor:pointer;"
          @click="clearAll"
        >
          Clear
        </button>
      </div>
      <div
        v-else
        style="background:#1e293b;border-radius:12px;padding:10px;margin-bottom:10px;text-align:center;font-weight:700;color:#93c5fd;"
      >
        👀 Mode tebak — goresan muncul realtime · ketik jawaban di chat
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <span
          v-for="m in connectedPlayers"
          :key="m.user_id"
          style="background:#1e293b;border-radius:8px;padding:6px 10px;font-size:13px;font-weight:700;"
        >
          {{ m.profile?.nickname || 'P' }}
          <span v-if="m.user_id === drawerId"> 🎨</span>
          <span v-else> 💬</span>
          <span style="color:#fb923c;margin-left:6px;">{{ m.score }}</span>
        </span>
      </div>

      <!-- WHITE CANVAS -->
      <div
        style="width:100%;height:420px;background:#ffffff !important;border:8px solid #f97316;border-radius:16px;overflow:hidden;"
      >
        <canvas
          ref="canvasEl"
          width="800"
          height="400"
          :style="{
            width: '100%',
            height: '420px',
            display: 'block',
            backgroundColor: '#ffffff',
            cursor: canDraw ? 'crosshair' : 'default',
            touchAction: 'none',
          }"
          @pointerdown="down"
          @pointermove="move"
          @pointerup="up"
          @pointercancel="up"
          @pointerleave="up"
        />
      </div>

      <p style="text-align:center;margin-top:10px;font-weight:700;color:#94a3b8;">
        <template v-if="canDraw">Geser di area putih untuk menggambar (terkirim realtime)</template>
        <template v-else>Gambar muncul otomatis saat drawer menggambar</template>
      </p>

      <div style="margin-top:16px;height:220px;">
        <GameChat />
      </div>
    </div>

    <div v-if="!loading && phase === 'scoreboard'" style="padding:24px;"><Scoreboard /></div>
    <div v-if="!loading && phase === 'winner'" style="padding:24px;"><WinnerScreen /></div>
  </div>
</template>
