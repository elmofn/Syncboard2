import { useState } from 'react';

// Feedback sonoro sutil, sintetizado via Web Audio (sem arquivos). Sons curtos
// e suaves, disparados em ações do usuário (respeitando um mute persistido).
const KEY = 'sb-sound';
// Multiplicador de volume global do feedback sonoro.
const MASTER = 2.25;
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
}
export function setMuted(m: boolean) {
  try {
    localStorage.setItem(KEY, m ? 'off' : 'on');
  } catch {
    /* ignore */
  }
}

interface Note {
  f: number;
  t: number;
  d: number;
  type?: OscillatorType;
  g?: number;
}

function tone(audio: AudioContext, { f, t, d, type = 'sine', g = 0.05 }: Note) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = f;
  osc.connect(gain);
  gain.connect(audio.destination);
  const start = audio.currentTime + t;
  const peak = Math.min(g * MASTER, 0.9);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + d);
  osc.start(start);
  osc.stop(start + d + 0.03);
}

export type SoundType = 'success' | 'send' | 'error' | 'notify' | 'move' | 'toggle';

const SEQUENCES: Record<SoundType, Note[]> = {
  // Acorde ascendente "resolvido" (como um cubo montado)
  success: [
    { f: 523.25, t: 0, d: 0.13 },
    { f: 659.25, t: 0.08, d: 0.15 },
    { f: 783.99, t: 0.16, d: 0.26, g: 0.06 },
  ],
  send: [
    { f: 660, t: 0, d: 0.07, type: 'triangle' },
    { f: 990, t: 0.045, d: 0.1, type: 'triangle' },
  ],
  error: [
    { f: 196, t: 0, d: 0.18, type: 'sawtooth', g: 0.045 },
    { f: 147, t: 0.09, d: 0.24, type: 'sawtooth', g: 0.045 },
  ],
  notify: [
    { f: 880, t: 0, d: 0.12 },
    { f: 1174.66, t: 0.1, d: 0.2 },
  ],
  move: [{ f: 440, t: 0, d: 0.05, type: 'square', g: 0.03 }],
  toggle: [{ f: 523.25, t: 0, d: 0.07, type: 'triangle' }],
};

export function play(type: SoundType) {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  for (const note of SEQUENCES[type]) tone(audio, note);
}

export function useSound() {
  const [muted, setM] = useState(isMuted());
  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setM(next);
    if (!next) play('toggle');
  };
  return [muted, toggle] as const;
}
