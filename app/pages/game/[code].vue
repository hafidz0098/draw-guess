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
const canvasWrap = ref<HTMLElement | null>(null)
const tool = ref<'pen' | 'brush' | 'marker' | 'eraser'>('pen')
const ink = ref('#000000') // black ink on white canvas
const brushSize = ref(8)
const painting = ref(false)

/**
 * Fixed logical drawing surface — same aspect on phone & desktop.
 * CSS only scales (letterbox); never stretch the bitmap.
 * 16:10 landscape feels natural for draw & guess.
 */
const LOGICAL_W = 800
const LOGICAL_H = 500
const CANVAS_ASPECT = LOGICAL_W / LOGICAL_H

let ctx: CanvasRenderingContext2D | null = null
let last: StrokePoint | null = null
let pts: StrokePoint[] = []
let liveSeq = 0
let liveThrottle: ReturnType<typeof setTimeout> | null = null
/** Index of last point already relayed in current stroke (gap-free live) */
let liveSentIdx = 0
/** Poll cursor for server stroke buffer */
let pollAfterSeq = 0
let strokePollTimer: ReturnType<typeof setInterval> | null = null
let resizeObs: ResizeObserver | null = null
/** Dedupe remote live paints by seq */
const seenLiveSeq = new Set<number>()
const seenCommitKey = new Set<string>()
/**
 * Shared drawing session id (from word_selected).
 * Both drawer & guesser must use the same value for stroke relay.
 */
const drawingSessionId = ref('')
/** While true, setupCanvas must not wipe pixels (live strokes in flight) */
let protectCanvas = false

const channel = useRoomChannel(computed(() => room.value?.id))

// Only show store choices — never a hard-coded list (that caused repeated words)
const words = computed((): WordChoice[] => wordChoices.value || [])

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

// —— Realtime + poll: apply remote strokes to canvas ——
let offStrokes: (() => void) | null = null
let offGame: (() => void) | null = null
let offBus: (() => boolean) | null = null

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

    // Do NOT auto-start from game page — only host may start from lobby after all ready
    if (room.value && room.value.status !== 'playing') {
      toast.error('Game belum dimulai. Tunggu host start dari lobby.')
      await navigateTo(`/lobby/${code.value}`)
      return
    }

    // Wire realtime handlers ASAP
    await channel.waitSubscribed()
    offStrokes = channel.onStrokes((remote) => {
      handleRemoteStrokes(remote)
    })
    offGame = channel.onGame((type, data) => {
      handleGameEvent(type, data)
    })

    // Bridge store stroke bus → channel + server
    const bus = useStrokeBus()
    offBus = bus.on((batch) => {
      if (!batch?.length || !isDrawer.value) return
      void relayCommitStrokes(batch)
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

    startStrokePoll()

    // Keep CSS box correct on rotate / keyboard open (bitmap stays logical size)
    if (import.meta.client && typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => {
        layoutCanvasCss()
      })
      nextTick(() => {
        if (canvasWrap.value) resizeObs?.observe(canvasWrap.value)
        layoutCanvasCss()
        setupCanvas(true)
      })
    }

    statusMsg.value = `${isDrawer.value ? 'DRAWER' : 'GUESSER'} · rt:${channel.channelStatus()}`
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
  offBus?.()
  stopStrokePoll()
  resizeObs?.disconnect()
  resizeObs = null
  if (liveThrottle) clearTimeout(liveThrottle)
})

/**
 * Blank the board completely (store + pixels + dedupe).
 * broadcast=true also clears server stroke buffer so poll won't re-stack old art.
 */
function resetDrawingSurface(opts?: { broadcast?: boolean }) {
  protectCanvas = false
  game.wipeStrokes()
  seenLiveSeq.clear()
  seenCommitKey.clear()
  // Do NOT set pollAfterSeq=0 (that reloads ALL historical buffer strokes)
  if (opts?.broadcast) {
    void channel.sendClear()
    void postStrokeServer({ kind: 'clear' })
  }
  // Force white bitmap even if setup thinks size unchanged
  const c = canvasEl.value
  if (c && ctx) {
    const dpr = getDpr()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  }
  setupCanvas(true)
}

function handleGameEvent(type: string, data: Record<string, unknown>) {
  if (type === 'next_round' || type === 'round_start') {
    // ALL non-initiating clients (and host if echo): leave scoreboard → selecting
    const dId = String(data.drawerId || '')
    const rn = Number(data.roundNumber) || 1

    drawingSessionId.value = ''
    // Wipe previous drawer's art for everyone (including host)
    resetDrawingSurface({ broadcast: type === 'next_round' && isHost.value })

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
      resetDrawingSurface({ broadcast: false })
      statusMsg.value = game.isDrawer ? 'DRAWER ronde ' + rn : 'GUESSER ronde ' + rn
      toast.message(
        game.isDrawer
          ? `Ronde ${rn}: giliranmu menggambar!`
          : `Ronde ${rn}: tunggu drawer pilih kata`,
      )
    })
  } else if (type === 'word_selected') {
    const dId = String(data.drawerId || '')
    if (auth.user?.id && dId === auth.user.id) {
      // Drawer already picked locally — still lock drawing session id
      const rid = String(data.roundId || roomStore.currentRound?.id || '')
      if (rid) drawingSessionId.value = rid
      protectCanvas = true
      return
    }
    const rid = String(data.roundId || '')
    drawingSessionId.value = rid || drawingSessionId.value
    // Fresh canvas once — NO delayed setupCanvas (that wiped live strokes)
    resetDrawingSurface({ broadcast: false })
    game.onRemoteWordSelected({
      word: String(data.word || ''),
      drawerId: dId,
      drawTime: Number(data.drawTime) || 60,
      roundId: rid || undefined,
    })
    protectCanvas = true
    nextTick(() => {
      setupCanvas(true)
      protectCanvas = true
    })
  } else if (type === 'canvas_clear' || type === 'clear_canvas') {
    // Drawer cleared board mid-round
    game.wipeStrokes()
    seenLiveSeq.clear()
    seenCommitKey.clear()
    setupCanvas(true)
    protectCanvas = phase.value === 'drawing'
  } else if (type === 'game_over') {
    if (Array.isArray(data.scores)) {
      for (const s of data.scores as { user_id: string; score: number }[]) {
        const m = roomStore.members.find(x => x.user_id === s.user_id)
        if (m) m.score = s.score
      }
    }
    protectCanvas = false
    resetDrawingSurface({ broadcast: false })
    game.finishGame()
  }
}

/**
 * Accept strokes for the active draw turn.
 * Prefer matching drawingSessionId, but NEVER drop strokes while drawing
 * if session ids diverged (that was the main realtime bug).
 */
function strokeBelongsToActiveDraw(s: DrawingStroke): boolean {
  if (phase.value !== 'drawing' && phase.value !== 'revealing') {
    // Outside drawing, only allow clear
    return !!(s.shape_data as { clear?: boolean } | null)?.clear
  }
  const rid = s.round_id
  if (!rid || rid === 'live' || rid === 'clear') return true
  const session = drawingSessionId.value || roomStore.currentRound?.id || ''
  // Matching session → always ok
  if (session && rid === session) return true
  // During active draw: accept strokes even if ids drifted (sync bug safety)
  // Stale previous-round strokes should have been cleared from server buffer.
  return true
}

function handleRemoteStrokes(remote: DrawingStroke[]) {
  // Clear signal — wipe board (drawer Clear button / new word buffer clear)
  if (remote.some(s => s.shape_data && (s.shape_data as { clear?: boolean }).clear)) {
    game.wipeStrokes()
    seenLiveSeq.clear()
    seenCommitKey.clear()
    setupCanvas(true)
    protectCanvas = phase.value === 'drawing'
    return
  }

  // Drawer paints locally only — ignore remote ink
  if (isDrawer.value) return
  // Must be in drawing to show ink
  if (phase.value !== 'drawing' && phase.value !== 'revealing') return

  if (!ensureCtxReady()) {
    setupCanvas(true)
  }
  protectCanvas = true

  let painted = 0
  for (const s of remote) {
    if (!s.points || s.points.length < 2) continue
    if (!strokeBelongsToActiveDraw(s)) continue

    const meta = (s.shape_data || {}) as {
      live?: boolean
      canvas_w?: number
      canvas_h?: number
      normalized?: boolean
    }
    const isLive = !!meta.live || s.sequence < 0

    if (isLive) {
      // Dedupe by seq only (negative ids)
      if (seenLiveSeq.has(s.sequence)) continue
      seenLiveSeq.add(s.sequence)
      if (seenLiveSeq.size > 4000) {
        const arr = [...seenLiveSeq].slice(-800)
        seenLiveSeq.clear()
        arr.forEach(n => seenLiveSeq.add(n))
      }
    } else {
      const key = `${s.sequence}:${Math.round(s.timestamp_ms || 0)}`
      if (seenCommitKey.has(key)) continue
      seenCommitKey.add(key)
      // Store for replay on resize — mark as normalized
      game.applyRemoteStrokes([{
        ...s,
        shape_data: {
          ...(s.shape_data || {}),
          normalized: meta.normalized ?? true,
          canvas_w: meta.canvas_w,
          canvas_h: meta.canvas_h,
        },
      }])
    }

    const localPts = toLocalPoints(s.points, {
      ...meta,
      normalized: meta.normalized ?? true,
    })
    paintSegment(
      localPts,
      s.color || '#000000',
      s.size || 6,
      !!(s.is_eraser || s.tool === 'eraser'),
    )
    painted++
  }

  if (painted) {
    statusMsg.value = `stroke+${painted} · rt:${channel.channelStatus()}`
  }
}

/** Map remote points (normalized 0–1 or raw px) → logical canvas pixels */
function toLocalPoints(
  points: StrokePoint[],
  meta: { canvas_w?: number; canvas_h?: number; normalized?: boolean },
): StrokePoint[] {
  const looksNormalized = meta.normalized
    ?? points.every(p => p.x <= 1.5 && p.y <= 1.5 && p.x >= -0.1 && p.y >= -0.1)

  if (looksNormalized) {
    return points.map(p => ({
      x: p.x * LOGICAL_W,
      y: p.y * LOGICAL_H,
      ...(p.p !== undefined ? { p: p.p } : {}),
    }))
  }

  // Legacy: scale from drawer canvas size into fixed logical space
  const sw = meta.canvas_w || LOGICAL_W
  const sh = meta.canvas_h || LOGICAL_H
  return points.map(p => ({
    x: (p.x / sw) * LOGICAL_W,
    y: (p.y / sh) * LOGICAL_H,
    ...(p.p !== undefined ? { p: p.p } : {}),
  }))
}

function canvasSize() {
  // Always report logical size so multiplayer aspect stays consistent
  return { w: LOGICAL_W, h: LOGICAL_H }
}

function normalizePoints(points: StrokePoint[]): StrokePoint[] {
  return points.map(p => ({
    x: p.x / LOGICAL_W,
    y: p.y / LOGICAL_H,
    ...(p.p !== undefined ? { p: p.p } : {}),
  }))
}

/** Fit canvas CSS box into wrap without changing aspect (no stretch) */
function layoutCanvasCss() {
  const c = canvasEl.value
  const wrap = canvasWrap.value
  if (!c) return

  let availW = wrap?.clientWidth || 0
  if (availW < 40) {
    availW = Math.max(280, Math.min(window.innerWidth - 24, 900))
  }

  // Cap height on short phones so canvas + chat still fit
  const maxH = Math.min(
    Math.floor(window.innerHeight * 0.42),
    480,
    Math.floor(availW / CANVAS_ASPECT),
  )
  let displayW = availW
  let displayH = Math.round(displayW / CANVAS_ASPECT)
  if (displayH > maxH) {
    displayH = Math.max(180, maxH)
    displayW = Math.round(displayH * CANVAS_ASPECT)
  }

  c.style.width = `${displayW}px`
  c.style.height = `${displayH}px`
  c.style.maxWidth = '100%'
  c.style.aspectRatio = `${LOGICAL_W} / ${LOGICAL_H}`
}

async function postStrokeServer(body: Record<string, unknown>) {
  if (!room.value?.id) return
  const token = await auth.getAccessToken()
  if (!token) return
  try {
    await $fetch('/api/rooms/strokes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { room_id: room.value.id, ...body },
    })
  } catch (e) {
    console.warn('[stroke] server post failed', e)
  }
}

function currentDrawSessionId(): string {
  return drawingSessionId.value
    || roomStore.currentRound?.id
    || 'live'
}

function relayLiveSegment(slice: StrokePoint[]) {
  if (slice.length < 2 || !isDrawer.value) return
  if (phase.value !== 'drawing') return
  const { w, h } = canvasSize()
  const norm = normalizePoints(slice)
  const roundId = currentDrawSessionId()
  const seq = liveSeq++
  const payload = {
    round_id: roundId,
    color: ink.value,
    size: brushSize.value,
    tool: tool.value,
    is_eraser: tool.value === 'eraser',
    points: norm.map(pt => ({ x: pt.x, y: pt.y })),
    seq,
    canvas_w: w,
    canvas_h: h,
    normalized: true as const,
  }
  // Fire-and-forget both paths for reliability
  void channel.sendLiveStroke(payload)
  void postStrokeServer({
    kind: 'live',
    round_id: roundId,
    tool: tool.value,
    color: ink.value,
    size: brushSize.value,
    is_eraser: tool.value === 'eraser',
    points: payload.points,
    canvas_w: w,
    canvas_h: h,
  })
}

async function relayCommitStrokes(batch: DrawingStroke[]) {
  if (!batch.length || !isDrawer.value) return
  const { w, h } = canvasSize()
  const session = currentDrawSessionId()
  // Normalize points for cross-device scale; force session round_id
  const normalized = batch.map(s => ({
    ...s,
    round_id: session,
    points: normalizePoints(s.points),
    shape_data: { ...(s.shape_data || {}), normalized: true, canvas_w: w, canvas_h: h },
  }))
  void channel.sendStrokes(normalized, { canvas_w: w, canvas_h: h, normalized: true })
  for (const s of normalized) {
    void postStrokeServer({
      kind: 'commit',
      round_id: session,
      tool: s.tool,
      color: s.color,
      size: s.size,
      is_eraser: s.is_eraser,
      points: s.points,
      canvas_w: w,
      canvas_h: h,
    })
  }
}

function startStrokePoll() {
  stopStrokePoll()
  // Faster poll for smoother fallback when Realtime drops live frames
  strokePollTimer = setInterval(() => {
    void pollStrokes()
  }, 160)
}

function stopStrokePoll() {
  if (strokePollTimer) {
    clearInterval(strokePollTimer)
    strokePollTimer = null
  }
}

async function pollStrokes() {
  // Guesser only — drawer already has local ink
  if (isDrawer.value || !room.value?.id) return
  if (phase.value !== 'drawing' && phase.value !== 'revealing') return
  try {
    const res = await $fetch<{
      strokes: Array<{
        seq: number
        kind: string
        round_id: string
        tool: string
        color: string
        size: number
        is_eraser: boolean
        points: StrokePoint[]
        canvas_w?: number
        canvas_h?: number
        user_id: string
      }>
      last_seq: number
    }>(`/api/rooms/strokes?room_id=${encodeURIComponent(room.value.id)}&after=${pollAfterSeq}`)

    if (typeof res.last_seq === 'number' && res.last_seq > pollAfterSeq) {
      pollAfterSeq = res.last_seq
    }
    if (!res.strokes?.length) return

    const batch: DrawingStroke[] = []
    for (const s of res.strokes) {
      // Skip own
      if (s.user_id && s.user_id === auth.user?.id) continue

      if (s.kind === 'clear') {
        // Apply clear (drawer wiped board). After word pick, buffer is only [clear]+new strokes.
        game.wipeStrokes()
        seenLiveSeq.clear()
        seenCommitKey.clear()
        setupCanvas(true)
        protectCanvas = true
        continue
      }

      batch.push({
        round_id: s.round_id || drawingSessionId.value || 'live',
        sequence: s.kind === 'live' ? -(1000000 + s.seq) : s.seq,
        tool: (s.tool as DrawingStroke['tool']) || 'pen',
        color: s.color || '#000',
        size: s.size || 6,
        opacity: 1,
        points: s.points || [],
        is_eraser: !!s.is_eraser,
        timestamp_ms: Date.now(),
        shape_data: {
          live: s.kind === 'live',
          canvas_w: s.canvas_w,
          canvas_h: s.canvas_h,
          normalized: true,
        },
      })
    }
    if (batch.length) handleRemoteStrokes(batch)
  } catch {
    // silent — Realtime may still work
  }
}

function pick(w: WordChoice) {
  if (!isDrawer.value) {
    toast.error('Bukan giliranmu menggambar')
    return
  }
  // Stable session id shared with guessers via word_selected
  const sessionId = roomStore.currentRound?.id || crypto.randomUUID()
  if (roomStore.currentRound) {
    roomStore.currentRound.id = sessionId
  }
  drawingSessionId.value = sessionId

  // Wipe local + server buffer so previous round's art never stacks for guessers
  resetDrawingSurface({ broadcast: true })
  game.selectWord(w)
  // Keep session id after selectWord (wipeStrokes doesn't touch round)
  drawingSessionId.value = sessionId
  if (roomStore.currentRound) roomStore.currentRound.id = sessionId

  channel.sendGame('word_selected', {
    word: w.text,
    drawerId: drawerId.value || auth.user?.id,
    drawTime: room.value?.draw_time ?? 60,
    roundId: sessionId,
  })
  protectCanvas = true
  toast.success(`Gambar: ${w.text}`)
  // Single setup only — no delayed wipe that erases first strokes
  requestAnimationFrame(() => {
    setupCanvas(true)
    protectCanvas = true
  })
}

watch(phase, async (p) => {
  if (p === 'selecting' || p === 'scoreboard' || p === 'winner') {
    protectCanvas = false
    drawingSessionId.value = ''
    // Leaving a draw turn — blank board so role swap never shows old ink
    resetDrawingSurface({ broadcast: false })
  }
  if (p === 'selecting' && isDrawer.value) {
    // New selecting turn as drawer → always re-roll unused words
    await game.reloadWordChoices()
  }
  if (p === 'drawing') {
    play('countdown')
    // One canvas init only. Delayed re-setup was wiping live remote strokes.
    nextTick(() => {
      if (!ctx) setupCanvas(true)
      else layoutCanvasCss()
      protectCanvas = true
    })
  }
})

// Role flip (drawer ↔ guesser) always needs a clean surface + fresh word options
watch(isDrawer, async (now, was) => {
  if (was === undefined) return
  if (now !== was) {
    resetDrawingSurface({ broadcast: false })
    if (now && phase.value === 'selecting') {
      await game.reloadWordChoices()
    }
  }
})

watch(drawerId, async (now, was) => {
  if (was && now && was !== now) {
    resetDrawingSurface({ broadcast: false })
    if (isDrawer.value && phase.value === 'selecting') {
      await game.reloadWordChoices()
    }
  }
})

function getDpr() {
  if (!import.meta.client) return 1
  return Math.min(window.devicePixelRatio || 1, 2.5)
}

/**
 * Fixed logical resolution 800×500 (16:10).
 * CSS scales with correct aspect — never stretch on mobile.
 * forceResize=true rebuilds bitmap (white + replay store).
 * While protectCanvas && drawing, refuse accidental full wipes unless forceResize
 * was requested from resetDrawingSurface (which clears protect first).
 */
function setupCanvas(forceResize = true) {
  const c = canvasEl.value
  if (!c) return

  const dpr = getDpr()
  const bufW = Math.round(LOGICAL_W * dpr)
  const bufH = Math.round(LOGICAL_H * dpr)
  const sizeMismatch = c.width !== bufW || c.height !== bufH
  // If protected mid-draw and canvas already valid, only refresh CSS layout
  if (protectCanvas && phase.value === 'drawing' && ctx && !sizeMismatch && !forceResize) {
    layoutCanvasCss()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return
  }

  const needsInit = forceResize || !ctx || sizeMismatch

  layoutCanvasCss()
  c.style.backgroundColor = '#ffffff'
  c.style.display = 'block'
  c.style.touchAction = 'none'
  c.style.objectFit = 'contain'

  if (needsInit) {
    // Setting width/height resets the bitmap
    c.width = bufW
    c.height = bufH
  }

  // Do NOT use { alpha: false } — causes black canvas in some browsers
  ctx = c.getContext('2d')
  if (!ctx) return

  // Draw in logical coordinates; DPR scales the buffer for retina
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  if (needsInit) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    statusMsg.value = `canvas ${LOGICAL_W}×${LOGICAL_H} · rt:${channel.channelStatus()}`

    for (const s of strokes.value) {
      if (s.points?.length >= 2) {
        const meta = (s.shape_data || {}) as { canvas_w?: number; canvas_h?: number; normalized?: boolean }
        // Do not force normalized:true — local (own) strokes have no shape_data and are
        // already in raw canvas-pixel space; toLocalPoints() auto-detects via point range.
        const local = toLocalPoints(s.points, meta)
        paintSegmentRaw(local, s.color, s.size, !!(s.is_eraser || s.tool === 'eraser'))
      }
    }
  }
}

/** Get ctx without wiping existing drawing */
function ensureCtxReady() {
  if (ctx && canvasEl.value && canvasEl.value.width > 0) {
    const dpr = getDpr()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return true
  }
  setupCanvas(true)
  return !!ctx
}

function paintSegmentRaw(points: StrokePoint[], col: string, sz: number, erase: boolean) {
  if (!ctx || points.length < 1) return
  const dpr = getDpr()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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

function paintSegment(points: StrokePoint[], col: string, sz: number, erase: boolean) {
  if (!ensureCtxReady() || !ctx || points.length < 1) return
  paintSegmentRaw(points, col, sz, erase)
}

/** Map pointer → logical canvas coords (aspect-correct, no stretch) */
function pos(e: PointerEvent): StrokePoint {
  const c = canvasEl.value!
  const r = c.getBoundingClientRect()
  const rw = Math.max(1, r.width)
  const rh = Math.max(1, r.height)
  return {
    x: ((e.clientX - r.left) / rw) * LOGICAL_W,
    y: ((e.clientY - r.top) / rh) * LOGICAL_H,
  }
}

function styleLocal() {
  if (!ctx) return
  const dpr = getDpr()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
  liveSentIdx = 0
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

  // Live relay every ~55ms — gap-free (from last sent index)
  if (!liveThrottle) {
    liveThrottle = setTimeout(() => {
      liveThrottle = null
      if (pts.length - liveSentIdx >= 1) {
        // Overlap 1 point so segments connect on receiver
        const from = Math.max(0, liveSentIdx - 1)
        const slice = pts.slice(from)
        if (slice.length >= 2) {
          relayLiveSegment(slice)
          liveSentIdx = pts.length
        }
      }
    }, 55)
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
  // Flush remaining live segment
  if (pts.length - liveSentIdx >= 1) {
    const from = Math.max(0, liveSentIdx - 1)
    const slice = pts.slice(from)
    if (slice.length >= 2) relayLiveSegment(slice)
  }
  if (pts.length > 1 && canDraw.value) {
    // Commit full stroke to store (bus → channel + server)
    game.addStroke({
      tool: tool.value,
      color: ink.value,
      size: brushSize.value,
      opacity: 1,
      points: [...pts],
      is_eraser: tool.value === 'eraser',
    })
    // Immediate send (don't wait for bus batch timer)
    const lastStroke = game.strokes[game.strokes.length - 1]
    if (lastStroke) {
      void relayCommitStrokes([lastStroke])
    }
  }
  last = null
  pts = []
  liveSentIdx = 0
  if (ctx) ctx.globalCompositeOperation = 'source-over'
}

/** Wipe + redraw local canvas, then resync remaining strokes (if any) to server + peer */
function broadcastResync() {
  channel.sendClear()
  void postStrokeServer({ kind: 'clear' })
  seenLiveSeq.clear()
  seenCommitKey.clear()
  protectCanvas = false
  setupCanvas(true)
  protectCanvas = true
  if (game.strokes.length) {
    void relayCommitStrokes(game.strokes)
  }
}

function clearAll() {
  if (!canDraw.value) return
  game.clearCanvas()
  broadcastResync()
}

function undoLast() {
  if (!canDraw.value) return
  game.undo()
  broadcastResync()
}

function redoLast() {
  if (!canDraw.value) return
  game.redo()
  broadcastResync()
}
</script>

<template>
  <div style="min-height:100vh;background:#0f172a;color:#f8fafc;padding:12px;">
    <div v-if="loading" style="text-align:center;padding:48px;color:#94a3b8">
      Memuat... {{ statusMsg }}
    </div>

    <!-- SELECT -->
    <div v-show="!loading && isSelecting">
      <div v-if="showWordPicker" style="max-width:480px;margin:0 auto;background:#1e293b;border:2px solid #475569;border-radius:16px;padding:24px;text-align:center;">
        <h2 style="font-size:24px;font-weight:900;margin:0 0 8px;">Giliranmu menggambar!</h2>
        <p style="color:#94a3b8;font-size:14px;">Pilih kata — lawan menebak</p>
        <p style="color:#fb923c;font-weight:800;">⏱ {{ timeLeft }}s</p>
        <p v-if="!words.length" style="color:#94a3b8;margin:16px 0;">Memuat pilihan kata...</p>
        <button
          v-for="w in words"
          :key="w.id + '-' + w.text"
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
          :disabled="!game.undoStack.length"
          :style="{
            marginLeft: 'auto', background: '#334155', color: '#fff', border: 'none', borderRadius: '10px',
            padding: '8px 14px', fontWeight: 800,
            opacity: game.undoStack.length ? 1 : 0.4, cursor: game.undoStack.length ? 'pointer' : 'not-allowed',
          }"
          @click="undoLast"
        >
          ↩️ Undo
        </button>
        <button
          type="button"
          :disabled="!game.redoStack.length"
          :style="{
            background: '#334155', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 14px', fontWeight: 800,
            opacity: game.redoStack.length ? 1 : 0.4, cursor: game.redoStack.length ? 'pointer' : 'not-allowed',
          }"
          @click="redoLast"
        >
          ↪️ Redo
        </button>
        <button
          type="button"
          style="background:#dc2626;color:#fff;border:none;border-radius:10px;padding:8px 14px;font-weight:800;cursor:pointer;"
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

      <!-- WHITE CANVAS — fixed 16:10 logical aspect, CSS scales without stretch -->
      <div
        ref="canvasWrap"
        class="game-canvas-wrap"
      >
        <canvas
          ref="canvasEl"
          width="800"
          height="500"
          class="game-canvas"
          :style="{
            cursor: canDraw ? 'crosshair' : 'default',
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
