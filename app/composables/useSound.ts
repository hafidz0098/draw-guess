type SoundName =
  | 'join'
  | 'leave'
  | 'correct'
  | 'wrong'
  | 'countdown'
  | 'victory'
  | 'lose'
  | 'notification'
  | 'typing'
  | 'draw'
  | 'click'

const FREQ: Record<SoundName, number[]> = {
  join: [440, 554],
  leave: [554, 440],
  correct: [523, 659, 784],
  wrong: [200, 150],
  countdown: [880],
  victory: [523, 659, 784, 1047],
  lose: [392, 349, 330],
  notification: [660, 880],
  typing: [1000],
  draw: [300],
  click: [600],
}

export function useSound() {
  let ctx: AudioContext | null = null

  function getCtx() {
    if (import.meta.server) return null
    if (!ctx) ctx = new AudioContext()
    return ctx
  }

  function play(name: SoundName, volume?: number) {
    // Lazy store access — only when playing (client, after Pinia ready)
    let soundEnabled = true
    let soundVolume = 0.7
    try {
      if (import.meta.client) {
        const ui = useUiStore()
        soundEnabled = ui.soundEnabled
        soundVolume = ui.soundVolume
      }
    } catch {
      // Pinia not ready — still allow default sound
    }

    if (!soundEnabled) return
    const audio = getCtx()
    if (!audio) return

    const freqs = FREQ[name]
    const vol = (volume ?? soundVolume) * 0.15
    const now = audio.currentTime

    freqs.forEach((freq, i) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = name === 'correct' || name === 'victory' ? 'triangle' : 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(vol, now + i * 0.08)
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2)
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.start(now + i * 0.08)
      osc.stop(now + i * 0.08 + 0.25)
    })
  }

  return { play }
}
