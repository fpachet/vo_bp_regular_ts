import ToneMidi from "@tonejs/midi";
import type { NoteEvent } from "../music";
const { Midi } = ToneMidi;
export const escapeXML = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export function exportMidi(notes: NoteEvent[], bpm = 96): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const track = midi.addTrack();
  track.name = "Generated melody";
  track.instrument.number = 0;
  for (const n of notes)
    track.addNote({
      midi: n.midi,
      ticks: Math.round(n.onset * midi.header.ppq),
      durationTicks: Math.round(n.duration * midi.header.ppq),
      velocity: 0.65,
    });
  return midi.toArray();
}
/** Modern 4/4 display grid, preserving timing through rests and tied bar splits. */
export function exportMusicXML(
  notes: NoteEvent[],
  title = "Machaut melody study",
): string {
  const divisions = 480,
    bar = 4 * divisions,
    measures: string[][] = [[]];
  let cursor = 0;
  const emit = (pitch: number | null, duration: number) => {
    let remaining = duration,
      segment = 0;
    while (remaining > 0) {
      const measure = Math.floor(cursor / bar);
      while (measures.length <= measure) measures.push([]);
      const ticks = Math.min(remaining, bar - (cursor % bar));
      const tiedStart = pitch !== null && remaining > ticks,
        tiedStop = pitch !== null && segment > 0;
      const pitchXML =
        pitch === null
          ? "<rest/>"
          : (() => {
              const classes = [
                ["C", 0],
                ["C", 1],
                ["D", 0],
                ["E", -1],
                ["E", 0],
                ["F", 0],
                ["F", 1],
                ["G", 0],
                ["A", -1],
                ["A", 0],
                ["B", -1],
                ["B", 0],
              ] as const;
              const [step, alter] = classes[pitch % 12];
              return `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${Math.floor(pitch / 12) - 1}</octave></pitch>`;
            })();
      const type = (
        {
          1920: "whole",
          960: "half",
          480: "quarter",
          240: "eighth",
          120: "16th",
          60: "32nd",
        } as Record<number, string>
      )[ticks];
      measures[measure].push(
        `<note>${pitchXML}<duration>${ticks}</duration>${tiedStop ? '<tie type="stop"/>' : ""}${tiedStart ? '<tie type="start"/>' : ""}<voice>1</voice>${type ? `<type>${type}</type>` : ""}${tiedStart || tiedStop ? `<notations>${tiedStop ? '<tied type="stop"/>' : ""}${tiedStart ? '<tied type="start"/>' : ""}</notations>` : ""}</note>`,
      );
      cursor += ticks;
      remaining -= ticks;
      segment++;
    }
  };
  for (const n of notes) {
    const start = Math.round(n.onset * divisions),
      duration = Math.round(n.duration * divisions);
    if (start < cursor || duration < 1)
      throw new Error(
        "MusicXML export requires monophonic positive-duration notes",
      );
    if (start > cursor) emit(null, start - cursor);
    emit(n.midi, duration);
  }
  if (cursor % bar) emit(null, bar - (cursor % bar));
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${escapeXML(title)}</work-title></work><identification><creator type="composer">Markov melody study</creator></identification><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1">${measures.map((m, i) => `<measure number="${i + 1}">${i === 0 ? `<attributes><divisions>${divisions}</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>` : ""}${m.join("")}${i === measures.length - 1 ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : ""}</measure>`).join("")}</part></score-partwise>`;
}
export function exportJSON(value: unknown) {
  return JSON.stringify(
    value,
    (_key, value) =>
      typeof value === "number" && !Number.isFinite(value) ? null : value,
    2,
  );
}
