import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  note,
  monophonic,
  validateMelody,
  type NoteEvent,
  type PieceMetadata,
  type Melody,
} from "../music";
const list = (value: any): any[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
export function musicxmlVoices(
  xml: string,
): { id: string; notes: NoteEvent[] }[] {
  if (xml.length > 10_000_000 || /<!ENTITY/i.test(xml))
    throw new Error("Unsupported or oversized XML");
  if (XMLValidator.validate(xml) !== true) throw new Error("Invalid MusicXML");
  const root = new XMLParser({
    ignoreAttributes: false,
    preserveOrder: true,
    parseTagValue: false,
  }).parse(xml);
  const score = root.find((n: any) => n["score-partwise"])?.["score-partwise"];
  if (!score)
    throw new Error("Import requires uncompressed score-partwise MusicXML");
  const parts = score.filter((n: any) => n.part);
  const result: { id: string; notes: NoteEvent[] }[] = [];
  const text = (children: any[], tag: string) => {
    const n = children.find((c) => c[tag]);
    return n ? String(n[tag][0]?.["#text"] ?? "") : undefined;
  };
  for (let pi = 0; pi < parts.length; pi++) {
    const groups = new Map<string, NoteEvent[]>();
    let divisions = 1,
      measureStart = 0;
    for (const measure of parts[pi].part.filter((n: any) => n.measure)) {
      let cursor = 0,
        maxEnd = 0,
        lastOnset = 0;
      for (const entry of measure.measure) {
        if (entry.attributes) {
          const d = text(entry.attributes, "divisions");
          if (d) divisions = Number(d);
          if (!(divisions > 0)) throw new Error("Invalid divisions");
        }
        if (entry.backup)
          cursor -= Number(text(entry.backup, "duration") ?? 0) / divisions;
        if (entry.forward) {
          cursor += Number(text(entry.forward, "duration") ?? 0) / divisions;
          maxEnd = Math.max(maxEnd, cursor);
        }
        if (!entry.note) continue;
        const children = entry.note;
        const duration = Number(text(children, "duration") ?? 0) / divisions;
        if (children.some((c: any) => c.grace)) continue;
        if (!Number.isFinite(duration) || duration <= 0)
          throw new Error("Invalid note duration");
        const chord = children.some((c: any) => Object.hasOwn(c, "chord"));
        const onset = measureStart + (chord ? lastOnset : cursor);
        if (!chord) {
          lastOnset = cursor;
          cursor += duration;
        }
        maxEnd = Math.max(maxEnd, cursor);
        const pitch = children.find((c: any) => c.pitch)?.pitch;
        if (!pitch) continue;
        const step = text(pitch, "step");
        const semitone = (
          { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as Record<
            string,
            number
          >
        )[step ?? ""];
        if (semitone === undefined) throw new Error("Invalid MusicXML pitch");
        const midi =
          12 * (Number(text(pitch, "octave")) + 1) +
          semitone +
          Number(text(pitch, "alter") ?? 0);
        const voice = `${pi}:${text(children, "voice") ?? "1"}:${text(children, "staff") ?? "1"}`;
        const notes = groups.get(voice) ?? [];
        groups.set(voice, notes);
        const tieStop = children.some(
          (c: any) => c.tie && c[":@"]?.["@_type"] === "stop",
        );
        const previous = notes.at(-1);
        if (
          tieStop &&
          previous?.midi === midi &&
          Math.abs(previous.onset + previous.duration - onset) < 1e-7
        )
          previous.duration += duration;
        else notes.push(note(midi, duration, onset));
      }
      measureStart += maxEnd;
    }
    for (const [id, notes] of groups)
      if (notes.length) result.push({ id, notes });
  }
  return result;
}
export function loadMusicXML(
  xml: string,
  metadata: PieceMetadata,
  selected?: string,
): Melody {
  const voices = musicxmlVoices(xml);
  if (!voices.length) throw new Error("MusicXML contains no pitched voice");
  const ranked = voices
    .slice()
    .sort(
      (a, b) =>
        b.notes.reduce((s, n) => s + n.midi, 0) / b.notes.length -
        a.notes.reduce((s, n) => s + n.midi, 0) / a.notes.length,
    );
  const voice = selected ? voices.find((v) => v.id === selected) : ranked[0];
  if (!voice) throw new Error("Selected MusicXML voice unavailable");
  const notes = monophonic(voice.notes);
  return validateMelody({
    id: metadata.id,
    notes,
    metadata: {
      ...metadata,
      voices: voices.length,
      selectedVoice: voice.id,
      final: metadata.final ?? notes.at(-1)!.midi,
      extraction:
        "Highest mean-pitch part/voice by default; ties merged, chords reduced and overlaps clipped",
    },
  });
}
