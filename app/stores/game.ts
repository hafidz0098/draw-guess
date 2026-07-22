import { defineStore } from 'pinia'
import type { DrawingStroke, Round, WordChoice, CursorPosition, EmoteEvent } from '~/types'
import {
  calculateGuessPoints,
  calculateDrawerPoints,
  isCorrectGuess,
  buildWordHint,
  letterCountMask,
} from '~/utils/scoring'
import { SCORE, WORD_SELECT_TIME } from '~/utils/constants'
import { prepareStrokeForSync } from '~/utils/stroke'
import { useStrokeBus } from '~/utils/strokeBus'

export const useGameStore = defineStore('game', () => {
  // Lazy nested stores — avoid calling other stores before Pinia is active
  const roomStore = useRoomStore()
  const auth = useAuthStore()

  const phase = ref<'idle' | 'selecting' | 'drawing' | 'revealing' | 'scoreboard' | 'winner'>('idle')
  const roundNumber = ref(0)
  const drawerId = ref<string | null>(null)
  const wordChoices = ref<WordChoice[]>([])
  const selectedWord = ref<string | null>(null)
  const wordHint = ref<string[]>([])
  const strokes = ref<DrawingStroke[]>([])
  const strokeSequence = ref(0)
  const correctGuessers = ref<Set<string>>(new Set())
  const timerEndsAt = ref<number | null>(null)
  const timeLeft = ref(0)
  const remoteCursors = ref<Map<string, CursorPosition>>(new Map())
  const emotes = ref<EmoteEvent[]>([])
  const lastScores = ref<{ userId: string; points: number; nickname: string }[]>([])
  const winnerId = ref<string | null>(null)
  const undoStack = ref<DrawingStroke[][]>([])
  const redoStack = ref<DrawingStroke[][]>([])
  /** Words already drawn this match — avoid repeats when roles rotate */
  const usedWordKeys = ref<Set<string>>(new Set())
  const usedWordIds = ref<Set<string>>(new Set())

  let timerInterval: ReturnType<typeof setInterval> | null = null
  let hintInterval: ReturnType<typeof setInterval> | null = null
  let strokeBuffer: DrawingStroke[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function wordKey(text: string): string {
    return text.trim().toLowerCase()
  }

  function markWordUsed(text: string | null | undefined, id?: string | null) {
    if (text?.trim()) usedWordKeys.value.add(wordKey(text))
    if (id) usedWordIds.value.add(id)
  }

  function clearUsedWords() {
    usedWordKeys.value = new Set()
    usedWordIds.value = new Set()
  }

  /** Fisher–Yates shuffle (unbiased) */
  function shuffleInPlace<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  const isDrawer = computed(() =>
    !!auth.user?.id && !!drawerId.value && drawerId.value === auth.user.id,
  )
  const canGuess = computed(() =>
    phase.value === 'drawing'
    && !isDrawer.value
    && !roomStore.isSpectator
    && !correctGuessers.value.has(auth.user?.id ?? ''),
  )
  /** ONLY the assigned drawer may draw */
  const canDraw = computed(() => phase.value === 'drawing' && isDrawer.value)

  const displayWord = computed(() => {
    if (isDrawer.value && selectedWord.value) return selectedWord.value
    if (wordHint.value.length) return wordHint.value.join(' ')
    // Guesser: never show full word as plain text
    if (selectedWord.value && !isDrawer.value) {
      return letterCountMask(selectedWord.value)
    }
    return ''
  })


  function clearTimers() {
    if (timerInterval) clearInterval(timerInterval)
    if (hintInterval) clearInterval(hintInterval)
    timerInterval = null
    hintInterval = null
  }

  function startTimer(seconds: number) {
    clearTimers()
    timerEndsAt.value = Date.now() + seconds * 1000
    timeLeft.value = seconds
    timerInterval = setInterval(() => {
      if (!timerEndsAt.value) return
      const left = Math.max(0, Math.ceil((timerEndsAt.value - Date.now()) / 1000))
      timeLeft.value = left
      if (left <= 0) {
        clearTimers()
        onTimerEnd()
      }
    }, 200)
  }

  function onTimerEnd() {
    if (phase.value === 'selecting') {
      // Auto-pick first word
      if (wordChoices.value.length && isDrawer.value) {
        selectWord(wordChoices.value[0])
      }
    } else if (phase.value === 'drawing') {
      endRound()
    }
  }

  async function beginRound(opts?: { broadcast?: boolean; roundNumber?: number }) {
    const room = roomStore.room
    if (!room) {
      console.warn('[game] beginRound: no room')
      phase.value = 'selecting'
      return
    }

    // Ensure session exists
    if (!roomStore.session) {
      try {
        await roomStore.refreshLobbyState()
      } catch { /* ignore */ }
    }
    if (!roomStore.session) {
      roomStore.session = {
        id: crypto.randomUUID(),
        room_id: room.id,
        status: 'active',
        started_at: new Date().toISOString(),
        ended_at: null,
        winner_id: null,
        total_rounds: room.total_rounds,
      }
    }

    // Prefer explicit round number (nextRound) over server state which may lag
    const forcedRound = opts?.roundNumber
    if (!forcedRound) {
      try {
        await roomStore.refreshLobbyState()
      } catch { /* ignore */ }
    }

    roundNumber.value = forcedRound || room.current_round || 1
    room.current_round = roundNumber.value

    wipeStrokes()
    correctGuessers.value = new Set()
    selectedWord.value = null
    wordHint.value = []
    lastScores.value = []
    wordChoices.value = []

    // New match (round 1) → allow full word pool again
    if (roundNumber.value <= 1) {
      clearUsedWords()
    }

    let players = [...roomStore.connectedPlayers]
    if (!players.length) {
      players = roomStore.members.filter(m => m.role !== 'spectator')
    }
    if (!players.length && auth.user) {
      players = [{
        id: 'local',
        room_id: room.id,
        user_id: auth.user.id,
        role: 'host',
        is_ready: true,
        is_connected: true,
        score: 0,
        ping: 0,
        joined_at: new Date().toISOString(),
        profile: auth.profile || undefined,
      }]
    }

    players = [...players].sort((a, b) =>
      (a.joined_at || a.user_id).localeCompare(b.joined_at || b.user_id),
    )

    // Rotate drawer each round: round 1 → player0, round 2 → player1, ...
    const drawerIndex = (Math.max(1, roundNumber.value) - 1) % Math.max(1, players.length)
    drawerId.value = players[drawerIndex]?.user_id || auth.user?.id || null

    // Fresh random options every round / role change (excludes used words)
    wordChoices.value = await fetchWordChoices(room.language || 'id', room.word_difficulty || 'medium')
    phase.value = 'selecting' // leave scoreboard / revealing
    startTimer(WORD_SELECT_TIME)

    const roundId = crypto.randomUUID()
    roomStore.currentRound = {
      id: roundId,
      session_id: roomStore.session.id,
      room_id: room.id,
      round_number: roundNumber.value,
      drawer_id: drawerId.value || auth.user?.id || '',
      word_id: null,
      word_text: null,
      word_hint: null,
      status: 'selecting',
      word_choices: wordChoices.value,
      started_at: new Date().toISOString(),
      drawing_started_at: null,
      ended_at: null,
      draw_time: room.draw_time || 60,
    }
  }

  /** Apply remote round state (from host broadcast) — preserves drawer assignment */
  async function applyRemoteRound(payload: {
    phase: typeof phase.value
    roundNumber: number
    drawerId: string
    wordChoices?: WordChoice[]
    selectedWord?: string | null
    wordHint?: string[]
    timeLeft?: number
    roundId?: string
  }) {
    phase.value = payload.phase
    roundNumber.value = payload.roundNumber
    // Trust host's drawer id
    if (payload.drawerId) {
      drawerId.value = payload.drawerId
    }
    selectedWord.value = null
    wordHint.value = []
    strokes.value = []
    correctGuessers.value = new Set()

    if (payload.wordChoices?.length) {
      // Still re-shuffle if payload is stale/shared; prefer exclusive unused set for local drawer
      if (payload.drawerId && payload.drawerId === auth.user?.id) {
        const room = roomStore.room
        wordChoices.value = await fetchWordChoices(
          room?.language || 'id',
          room?.word_difficulty || 'medium',
        )
      } else {
        wordChoices.value = payload.wordChoices
      }
    } else if (payload.drawerId && payload.drawerId === auth.user?.id) {
      // We are the drawer but host didn't send choices — load fresh random set
      const room = roomStore.room
      wordChoices.value = await fetchWordChoices(
        room?.language || 'id',
        room?.word_difficulty || 'medium',
      )
    } else {
      wordChoices.value = []
    }

    if (payload.selectedWord !== undefined) {
      selectedWord.value = payload.selectedWord
    }
    if (payload.wordHint) wordHint.value = payload.wordHint
    if (payload.timeLeft !== undefined) {
      startTimer(payload.timeLeft)
    } else if (payload.phase === 'selecting') {
      startTimer(WORD_SELECT_TIME)
    }
    if (payload.roundId && roomStore.room) {
      roomStore.currentRound = {
        id: payload.roundId,
        session_id: roomStore.session?.id || '',
        room_id: roomStore.room.id,
        round_number: payload.roundNumber,
        drawer_id: payload.drawerId,
        word_id: null,
        word_text: payload.selectedWord || null,
        word_hint: null,
        status: payload.phase === 'drawing' ? 'drawing' : 'selecting',
        word_choices: payload.wordChoices || [],
        started_at: new Date().toISOString(),
        drawing_started_at: payload.phase === 'drawing' ? new Date().toISOString() : null,
        ended_at: null,
        draw_time: roomStore.room.draw_time,
      }
    }
  }

  async function fetchWordChoices(lang: string, difficulty: string): Promise<WordChoice[]> {
    const isId = lang === 'id'
    const client = useSupabase()
    if (client) {
      let q = client.from('words').select('id, word_en, word_id, difficulty').eq('is_active', true).limit(50)
      if (difficulty !== 'mixed') {
        q = q.eq('difficulty', difficulty)
      }
      const { data } = await q
      if (data?.length) {
        const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, 3)
        return shuffled.map(w => ({
          id: w.id,
          text: isId ? w.word_id : w.word_en,
          difficulty: w.difficulty as WordChoice['difficulty'],
        }))
      }
    }

    // Demo fallback
    const demo = [
      { id: '1', text: isId ? 'Kucing' : 'Cat', difficulty: 'easy' as const },
      { id: '2', text: isId ? 'Pesawat' : 'Airplane', difficulty: 'easy' as const },
      { id: '3', text: isId ? 'Pizza' : 'Pizza', difficulty: 'easy' as const },
      { id: '4', text: isId ? 'Gajah' : 'Elephant', difficulty: 'medium' as const },
      { id: '5', text: isId ? 'Robot' : 'Robot', difficulty: 'easy' as const },
      { id: '6', text: isId ? 'Sepeda' : 'Bicycle', difficulty: 'easy' as const },
      { id: '7', text: isId ? 'Rumah' : 'House', difficulty: 'easy' as const },
      { id: '8', text: isId ? 'Pohon' : 'Tree', difficulty: 'easy' as const },
      { id: '9', text: isId ? 'Mobil' : 'Car', difficulty: 'easy' as const },
      { id: '10', text: isId ? 'Bola' : 'Ball', difficulty: 'easy' as const },
      { id: '11', text: isId ? 'Ikan' : 'Fish', difficulty: 'easy' as const },
      { id: '12', text: isId ? 'Matahari' : 'Sun', difficulty: 'easy' as const },
      { id: '13', text: isId ? 'Gunung' : 'Mountain', difficulty: 'medium' as const },
      { id: '14', text: isId ? 'Payung' : 'Umbrella', difficulty: 'medium' as const },
      { id: '15', text: isId ? 'Gitar' : 'Guitar', difficulty: 'medium' as const },
      { id: '16', text: isId ? 'Kamera' : 'Camera', difficulty: 'medium' as const },
      { id: '17', text: isId ? 'Nanas' : 'Pineapple', difficulty: 'medium' as const },
      { id: '18', text: isId ? 'Kepiting' : 'Crab', difficulty: 'medium' as const },
      { id: '19', text: isId ? 'Helikopter' : 'Helicopter', difficulty: 'hard' as const },
      { id: '20', text: isId ? 'Perpustakaan' : 'Library', difficulty: 'hard' as const },
      { id: '21', text: isId ? 'Jembatan' : 'Bridge', difficulty: 'medium' as const },
      { id: '22', text: isId ? 'Pelangi' : 'Rainbow', difficulty: 'medium' as const },
      { id: '23', text: isId ? 'Dinosaurus' : 'Dinosaur', difficulty: 'hard' as const },
      { id: '24', text: isId ? 'Sepatu' : 'Shoe', difficulty: 'easy' as const },
    ]
    return demo.sort(() => Math.random() - 0.5).slice(0, 3)
  }

  /** Public re-roll for current drawer (selecting phase only) */
  async function reloadWordChoices() {
    const room = roomStore.room
    wordChoices.value = await fetchWordChoices(
      room?.language || 'id',
      room?.word_difficulty || 'medium',
    )
    if (roomStore.currentRound) {
      roomStore.currentRound.word_choices = wordChoices.value
    }
    return wordChoices.value
  }

  function selectWord(choice: WordChoice) {
    // Only assigned drawer may pick (don't steal drawer role)
    if (auth.user?.id && drawerId.value && drawerId.value !== auth.user.id) {
      console.warn('[game] non-drawer tried selectWord')
      return
    }
    // If no drawer set yet, claim only if we are supposed to (solo or already assigned)
    if (!drawerId.value && auth.user?.id) {
      drawerId.value = auth.user.id
    }

    // New word = blank canvas (drop leftover strokes from previous turn)
    wipeStrokes()
    markWordUsed(choice.text, choice.id)
    selectedWord.value = choice.text
    wordHint.value = buildWordHint(choice.text, 0)
    phase.value = 'drawing' // ← critical UI switch

    if (!roomStore.currentRound && roomStore.room) {
      roomStore.currentRound = {
        id: crypto.randomUUID(),
        session_id: roomStore.session?.id || crypto.randomUUID(),
        room_id: roomStore.room.id,
        round_number: roundNumber.value || 1,
        drawer_id: drawerId.value || auth.user?.id || '',
        word_id: choice.id,
        word_text: choice.text,
        word_hint: null,
        status: 'drawing',
        word_choices: wordChoices.value,
        started_at: new Date().toISOString(),
        drawing_started_at: new Date().toISOString(),
        ended_at: null,
        draw_time: roomStore.room.draw_time || 60,
      }
    } else if (roomStore.currentRound) {
      roomStore.currentRound.word_text = choice.text
      roomStore.currentRound.word_id = choice.id
      roomStore.currentRound.status = 'drawing'
      roomStore.currentRound.drawing_started_at = new Date().toISOString()
      roomStore.currentRound.drawer_id = drawerId.value || auth.user?.id || roomStore.currentRound.drawer_id
    } else {
      // No room at all — still allow local draw for UX
      roomStore.currentRound = {
        id: crypto.randomUUID(),
        session_id: roomStore.session?.id || crypto.randomUUID(),
        room_id: 'local',
        round_number: 1,
        drawer_id: drawerId.value || auth.user?.id || '',
        word_id: choice.id,
        word_text: choice.text,
        word_hint: null,
        status: 'drawing',
        word_choices: [],
        started_at: new Date().toISOString(),
        drawing_started_at: new Date().toISOString(),
        ended_at: null,
        draw_time: 60,
      }
    }

    const drawTime = roomStore.room?.draw_time ?? 60
    startTimer(drawTime)
    startHintProgression(choice.text, drawTime)
  }

  /** Guesser side: drawer picked a word (do NOT become drawer) */
  function onRemoteWordSelected(payload: {
    word: string
    drawerId: string
    drawTime?: number
    roundId?: string
  }) {
    // Fresh board every time a word is picked (prevents stacked old drawings)
    wipeStrokes()
    // Track so next local fetch as drawer won't offer the same word
    markWordUsed(payload.word)
    // Keep remote drawer — never overwrite with self
    if (payload.drawerId) {
      drawerId.value = payload.drawerId
    }
    // Store word for guess validation only; UI uses hints/mask for non-drawer
    selectedWord.value = payload.word
    wordHint.value = buildWordHint(payload.word, 0)
    phase.value = 'drawing'
    const drawTime = payload.drawTime ?? roomStore.room?.draw_time ?? 60
    startTimer(drawTime)
    startHintProgression(payload.word, drawTime)

    // CRITICAL: sync round id with drawer so stroke relay is not filtered out
    const rid = payload.roundId || roomStore.currentRound?.id || crypto.randomUUID()
    if (roomStore.currentRound) {
      roomStore.currentRound.id = rid
      roomStore.currentRound.status = 'drawing'
      roomStore.currentRound.drawer_id = payload.drawerId
      roomStore.currentRound.word_text = payload.word
      roomStore.currentRound.drawing_started_at = new Date().toISOString()
    } else if (roomStore.room) {
      roomStore.currentRound = {
        id: rid,
        session_id: roomStore.session?.id || '',
        room_id: roomStore.room.id,
        round_number: roundNumber.value || 1,
        drawer_id: payload.drawerId,
        word_id: null,
        word_text: payload.word,
        word_hint: null,
        status: 'drawing',
        word_choices: [],
        started_at: new Date().toISOString(),
        drawing_started_at: new Date().toISOString(),
        ended_at: null,
        draw_time: drawTime,
      }
    }
  }

  function startHintProgression(word: string, drawTime: number) {
    if (hintInterval) clearInterval(hintInterval)
    const letters = word.replace(/ /g, '').length
    const maxReveal = Math.max(0, Math.floor(letters / 2))
    if (maxReveal === 0) {
      wordHint.value = [word]
      return
    }
    const intervalMs = Math.max(800, (drawTime * 1000) / (maxReveal + 1)) // min 800ms per reveal
    let revealed = 0
    hintInterval = setInterval(() => {
      revealed++
      if (revealed > maxReveal) {
        if (hintInterval) clearInterval(hintInterval)
        return
      }
      wordHint.value = buildWordHint(word, revealed)
    }, intervalMs)
  }

  /** Manual reveal all letters (guesser button) */
  function revealAllHint() {
    const letters = selectedWord.value?.replace(/ /g, '') || ''
    wordHint.value = [letters]
    clearTimers()
  }

  function addStroke(stroke: Omit<DrawingStroke, 'sequence' | 'timestamp_ms' | 'round_id'>) {
    // Allow strokes during drawing even if canDraw flaps; require phase drawing
    if (phase.value !== 'drawing') return
    if (!roomStore.currentRound) {
      roomStore.currentRound = {
        id: crypto.randomUUID(),
        session_id: roomStore.session?.id || crypto.randomUUID(),
        room_id: roomStore.room?.id || 'local',
        round_number: roundNumber.value || 1,
        drawer_id: drawerId.value || auth.user?.id || '',
        word_id: null,
        word_text: selectedWord.value,
        word_hint: null,
        status: 'drawing',
        word_choices: [],
        started_at: new Date().toISOString(),
        drawing_started_at: new Date().toISOString(),
        ended_at: null,
        draw_time: 60,
      }
    }
    const full: DrawingStroke = prepareStrokeForSync({
      ...stroke,
      round_id: roomStore.currentRound.id,
      sequence: strokeSequence.value++,
      timestamp_ms: Date.now(),
    })
    strokes.value.push(full)
    undoStack.value.push([full])
    redoStack.value = []
    queueStrokeSync(full)
  }

  function queueStrokeSync(stroke: DrawingStroke) {
    strokeBuffer.push(stroke)
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushStrokes()
      flushTimer = null
    }, 50) // batch every 50ms
  }

  async function flushStrokes() {
    if (!strokeBuffer.length) return
    const batch = [...strokeBuffer]
    strokeBuffer = []
    // Broadcast via realtime channel (composable handles subscription)
    const bus = useStrokeBus()
    bus.emit(batch)

    const client = useSupabase()
    if (client && roomStore.currentRound) {
      // Persist optionally (can be heavy — consider only final snapshot)
      // await client.from('drawing_strokes').insert(batch)
    }
  }

  function applyRemoteStrokes(remote: DrawingStroke[]) {
    for (const s of remote) {
      if (s.sequence >= strokeSequence.value) {
        strokeSequence.value = s.sequence + 1
      }
      if (!strokes.value.find(x => x.sequence === s.sequence && x.timestamp_ms === s.timestamp_ms)) {
        strokes.value.push(s)
      }
    }
    strokes.value.sort((a, b) => a.sequence - b.sequence)
  }

  function undo() {
    if (!canDraw.value || !undoStack.value.length) return
    const last = undoStack.value.pop()!
    redoStack.value.push(last)
    const seqs = new Set(last.map(s => s.sequence))
    strokes.value = strokes.value.filter(s => !seqs.has(s.sequence))
  }

  function redo() {
    if (!canDraw.value || !redoStack.value.length) return
    const next = redoStack.value.pop()!
    undoStack.value.push(next)
    strokes.value.push(...next)
    strokes.value.sort((a, b) => a.sequence - b.sequence)
  }

  function clearCanvas() {
    if (!canDraw.value) return
    undoStack.value.push([...strokes.value])
    redoStack.value = []
    strokes.value = []
  }

  /** Force wipe strokes (round change / role swap) — no canDraw gate */
  function wipeStrokes() {
    strokes.value = []
    strokeSequence.value = 0
    undoStack.value = []
    redoStack.value = []
  }

  async function submitGuess(text: string): Promise<{
    correct: boolean
    points: number
    allDone: boolean
    isFirst: boolean
  }> {
    if (!canGuess.value || !selectedWord.value || !auth.user) {
      return { correct: false, points: 0, allDone: false, isFirst: false }
    }

    // Already correct this round
    if (correctGuessers.value.has(auth.user.id)) {
      return { correct: true, points: 0, allDone: false, isFirst: false }
    }

    const correct = isCorrectGuess(text, selectedWord.value)

    if (!correct) {
      return { correct: false, points: 0, allDone: false, isFirst: false }
    }

    const isFirst = correctGuessers.value.size === 0
    const drawTime = roomStore.room?.draw_time ?? 60
    const ratio = timeLeft.value / drawTime
    const timeTaken = (drawTime - timeLeft.value) * 1000
    const { points } = calculateGuessPoints({
      timeRemainingRatio: ratio,
      isFirst,
      timeTakenMs: timeTaken,
    })

    applyCorrectGuess({
      userId: auth.user.id,
      points,
      nickname: auth.profile?.nickname || 'Player',
    })

    const guessers = roomStore.connectedPlayers.filter(m => m.user_id !== drawerId.value)
    const allDone = correctGuessers.value.size >= Math.max(1, guessers.length)
    if (allDone) {
      endRound()
    }

    return { correct: true, points, allDone, isFirst }
  }

  /** Apply a correct guess from local or remote client */
  function applyCorrectGuess(payload: { userId: string; points: number; nickname?: string }) {
    if (correctGuessers.value.has(payload.userId)) return
    correctGuessers.value.add(payload.userId)
    const member = roomStore.members.find(m => m.user_id === payload.userId)
    if (member) member.score += payload.points
  }

  function endRound() {
    if (phase.value === 'revealing' || phase.value === 'scoreboard' || phase.value === 'winner') {
      return // already ended
    }
    clearTimers()
    phase.value = 'revealing'

    // Drawer points
    if (drawerId.value) {
      const guessers = roomStore.connectedPlayers.filter(m => m.user_id !== drawerId.value)
      const { points } = calculateDrawerPoints(correctGuessers.value.size, guessers.length)
      const drawer = roomStore.members.find(m => m.user_id === drawerId.value)
      if (drawer) {
        drawer.score += points
      }
    }

    lastScores.value = roomStore.sortedByScore.map(m => ({
      userId: m.user_id,
      points: m.score,
      nickname: m.profile?.nickname ?? 'Player',
    }))

    setTimeout(() => {
      if (phase.value === 'revealing') {
        phase.value = 'scoreboard'
      }
      roomStore.persistLocal()
    }, 2500)
  }

  /**
   * Advance to next round (call on ALL clients, or host then broadcast).
   * Returns payload for realtime sync.
   */
  async function nextRound(): Promise<{
    done: boolean
    roundNumber: number
    drawerId: string | null
    totalRounds: number
    scores: { user_id: string; score: number }[]
  } | null> {
    const room = roomStore.room
    if (!room) return null

    // Ensure session exists
    if (!roomStore.session) {
      roomStore.session = {
        id: crypto.randomUUID(),
        room_id: room.id,
        status: 'active',
        started_at: new Date().toISOString(),
        ended_at: null,
        winner_id: null,
        total_rounds: room.total_rounds,
      }
    }

    const scores = roomStore.members.map(m => ({ user_id: m.user_id, score: m.score }))

    if (roundNumber.value >= room.total_rounds) {
      finishGame()
      return {
        done: true,
        roundNumber: roundNumber.value,
        drawerId: drawerId.value,
        totalRounds: room.total_rounds,
        scores,
      }
    }

    const nextNum = (roundNumber.value || 1) + 1
    room.current_round = nextNum
    clearTimers()

    await beginRound({ roundNumber: nextNum })

    return {
      done: false,
      roundNumber: roundNumber.value,
      drawerId: drawerId.value,
      totalRounds: room.total_rounds,
      scores,
    }
  }

  function finishGame() {
    clearTimers()
    phase.value = 'winner'
    const top = roomStore.sortedByScore[0]
    winnerId.value = top?.user_id ?? null
    if (roomStore.room) roomStore.room.status = 'finished'
    if (roomStore.session) {
      roomStore.session.status = 'finished'
      roomStore.session.ended_at = new Date().toISOString()
      roomStore.session.winner_id = winnerId.value
    }
    roomStore.persistLocal()
  }

  /** Force enter selecting for a new round from remote host */
  async function startRemoteNextRound(payload: {
    roundNumber: number
    drawerId: string
    scores?: { user_id: string; score: number }[]
  }) {
    // Idempotent: already on this round in selecting
    if (
      phase.value === 'selecting'
      && roundNumber.value === payload.roundNumber
      && drawerId.value === payload.drawerId
    ) {
      return
    }

    if (payload.scores) {
      for (const s of payload.scores) {
        const m = roomStore.members.find(x => x.user_id === s.user_id)
        if (m) m.score = s.score
      }
    }

    if (roomStore.room) {
      roomStore.room.current_round = payload.roundNumber
    }
    roundNumber.value = payload.roundNumber
    selectedWord.value = null
    wordHint.value = []
    wipeStrokes()
    correctGuessers.value = new Set()
    clearTimers()

    // Force leave scoreboard / winner → selecting with new drawer
    // Empty wordChoices → drawer re-fetches a fresh random set (unused words)
    await applyRemoteRound({
      phase: 'selecting',
      roundNumber: payload.roundNumber,
      drawerId: payload.drawerId,
      wordChoices: [],
      timeLeft: WORD_SELECT_TIME,
    })
  }

  function playAgain() {
    if (!roomStore.room) return
    roomStore.room.status = 'waiting'
    roomStore.room.current_round = 0
    roomStore.members = roomStore.members.map(m => ({
      ...m,
      score: 0,
      is_ready: m.role === 'host',
    }))
    roomStore.session = null
    phase.value = 'idle'
    drawerId.value = null
    selectedWord.value = null
    strokes.value = []
    clearUsedWords()
    wordChoices.value = []
    winnerId.value = null
    roomStore.persistLocal()
  }

  function pushEmote(emoji: string) {
    if (!auth.user || !auth.profile) return
    const event: EmoteEvent = {
      user_id: auth.user.id,
      emoji,
      nickname: auth.profile.nickname,
      timestamp: Date.now(),
    }
    emotes.value.push(event)
    setTimeout(() => {
      emotes.value = emotes.value.filter(e => e.timestamp !== event.timestamp)
    }, 3000)
  }

  function reset() {
    clearTimers()
    phase.value = 'idle'
    roundNumber.value = 0
    drawerId.value = null
    wordChoices.value = []
    selectedWord.value = null
    wordHint.value = []
    strokes.value = []
    strokeSequence.value = 0
    correctGuessers.value = new Set()
    timerEndsAt.value = null
    timeLeft.value = 0
    remoteCursors.value = new Map()
    emotes.value = []
    lastScores.value = []
    winnerId.value = null
    clearUsedWords()
  }

  return {
    phase,
    roundNumber,
    drawerId,
    wordChoices,
    selectedWord,
    wordHint,
    strokes,
    undoStack,
    redoStack,
    correctGuessers,
    timeLeft,
    remoteCursors,
    emotes,
    lastScores,
    winnerId,
    isDrawer,
    canGuess,
    canDraw,
    displayWord,
    beginRound,
    applyRemoteRound,
    fetchWordChoices,
    reloadWordChoices,
    selectWord,
    revealAllHint,
    onRemoteWordSelected,
    markWordUsed,
    clearUsedWords,
    addStroke,
    applyRemoteStrokes,
    undo,
    redo,
    clearCanvas,
    wipeStrokes,
    submitGuess,
    applyCorrectGuess,
    endRound,
    nextRound,
    startRemoteNextRound,
    finishGame,
    playAgain,
    pushEmote,
    reset,
  }
})

