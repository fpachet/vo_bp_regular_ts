import type { NoteEvent } from "../music";
let context: AudioContext | null = null;
export function stop() {
  const old = context;
  context = null;
  if (old) void old.close().catch(() => {});
}
export async function play(notes: NoteEvent[], bpm: number) {
  stop();
  const audio = new AudioContext();
  context = audio;
  await Promise.race([
    audio.resume(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Audio output unavailable; try MIDI download")),
        3000,
      ),
    ),
  ]);
  if (context !== audio) return;
  const now = audio.currentTime + 0.06,
    beat = 60 / bpm;
  for (const n of notes) {
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = "triangle";
    osc.frequency.value = 440 * 2 ** ((n.midi - 69) / 12);
    const start = now + n.onset * beat,
      end = start + n.duration * beat;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
    gain.gain.setValueAtTime(0.1, Math.max(start + 0.015, end - 0.04));
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
  setTimeout(
    () => {
      if (context === audio) stop();
    },
    (notes.at(-1)!.onset + notes.at(-1)!.duration) * beat * 1000 + 200,
  );
}
