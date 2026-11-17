/** Tiny WebAudio synth: no audio files, nothing to download. */

const STORAGE_KEY = 'arc-lucky-grid:muted'

let ctx: AudioContext | null = null

export function isMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
  } catch {
    // storage unavailable: mute applies for this session only through the caller's state
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx ??= new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface Note {
  freq: number
  at: number
  dur: number
  type?: OscillatorType
  gain?: number
}

function play(notes: Note[]): void {
  if (isMuted()) return
  const c = audio()
  if (!c) return
  const start = c.currentTime
  for (const note of notes) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = note.type ?? 'sine'
    osc.frequency.value = note.freq
    const peak = note.gain ?? 0.12
    const t0 = start + note.at
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + note.dur)
    osc.connect(g).connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + note.dur + 0.02)
  }
}

export const sfx = {
  tap: () => play([{ freq: 520, at: 0, dur: 0.09, type: 'triangle' }]),
  lock: () =>
    play([
      { freq: 330, at: 0, dur: 0.1, type: 'triangle' },
      { freq: 440, at: 0.08, dur: 0.12, type: 'triangle' },
    ]),
  win: () =>
    play([
      { freq: 523.25, at: 0, dur: 0.16, type: 'triangle' },
      { freq: 659.25, at: 0.1, dur: 0.16, type: 'triangle' },
      { freq: 783.99, at: 0.2, dur: 0.18, type: 'triangle' },
      { freq: 1046.5, at: 0.3, dur: 0.38, type: 'triangle', gain: 0.15 },
    ]),
  empty: () =>
    play([
      { freq: 311, at: 0, dur: 0.16, type: 'sine', gain: 0.1 },
      { freq: 233, at: 0.12, dur: 0.24, type: 'sine', gain: 0.1 },
    ]),
}
