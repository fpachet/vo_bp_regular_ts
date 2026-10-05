import { Reverb, Soundfont } from "smplr";
import type { NoteEvent } from "../music";
import { renderPerformance } from "../audio/performance";

export const instruments = {
  recorder: "Recorder", orchestral_harp: "Harp", fiddle: "Fiddle",
  church_organ: "Organ", choir_aahs: "Voice",
} as const;
export type InstrumentId = keyof typeof instruments;
let context: AudioContext | undefined;
let master: GainNode;
let reverb: Reverb | undefined;
const cache = new Map<InstrumentId, Soundfont>();
let revision = 0;
let active: Soundfont | undefined;
const effected = new WeakSet<Soundfont>();

export function stop() {
  revision++;
  active?.stop();
  active = undefined;
  if (context) master.gain.setValueAtTime(0, context.currentTime);
}

export function setReverb(amount: number) {
  active?.output.setEffectMix("room", Math.max(0, Math.min(0.3, amount)));
}

export async function play(notes: NoteEvent[], bpm: number, options: {
  instrument?: InstrumentId; natural?: boolean; reverb?: number;
  loading?: (value: boolean) => void;
} = {}) {
  stop();
  if (!notes.length) return;
  const request = revision;
  // Called directly from Play: create/resume before any network await.
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
  }
  const audio = context;
  options.loading?.(true);
  try {
    await audio.resume();
    const id = options.instrument ?? "recorder";
    let instrument = cache.get(id);
    if (!instrument) {
      instrument = Soundfont(audio, { instrument: id, kit: "MusyngKite", destination: master });
      cache.set(id, instrument);
      try { await instrument.ready; }
      catch (error) { cache.delete(id); throw error; }
    } else await instrument.ready;
    if (request !== revision) return;
    if (!reverb) {
      const room = Reverb(audio);
      await room.ready();
      room.getParam("decay")?.setValueAtTime(0.35, audio.currentTime);
      room.connect(master);
      reverb = room;
    }
    if (request !== revision) return;
    if (!effected.has(instrument)) {
      instrument.output.addEffect("room", reverb, 0);
      effected.add(instrument);
    }
    instrument.output.setEffectMix("room", options.reverb ?? 0.12);
    active = instrument;
    master.gain.setValueAtTime(1, audio.currentTime);
    const start = audio.currentTime + 0.06;
    for (const note of renderPerformance(notes, bpm, options.natural ?? true)) {
      instrument.start({ note: note.midi, time: start + note.onset, duration: note.duration, velocity: note.velocity });
    }
  } finally {
    options.loading?.(false);
  }
}
