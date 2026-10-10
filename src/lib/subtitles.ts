import type { SubtitleTrackRef } from "@/types/media";
import { fetchText } from "./http";

export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .replace(/^\d+\n(?=\d{2}:\d{2}:\d{2}\.\d{3} -->)/gm, "")
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

export function assToVtt(ass: string): string {
  const lines = ass.replace(/\r\n?/g, "\n").split("\n");
  const fmtLine = lines.find((l) => /^Format:/i.test(l) && lines.indexOf(l) > lines.findIndex((x) => /^\[Events\]/i.test(x)));
  const fields = (fmtLine ?? "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text")
    .slice(7)
    .split(",")
    .map((f) => f.trim().toLowerCase());
  const iStart = fields.indexOf("start");
  const iEnd = fields.indexOf("end");
  const iText = fields.indexOf("text");
  const toVttTime = (t: string) => {
    const [h, m, s] = t.trim().split(":");
    const [sec, cs = "0"] = s.split(".");
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${sec.padStart(2, "0")}.${cs.padEnd(3, "0").slice(0, 3)}`;
  };
  const cues: string[] = [];
  for (const line of lines) {
    if (!/^Dialogue:/i.test(line)) continue;
    const parts = line.slice(9).split(",");
    const text = parts
      .slice(iText)
      .join(",")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\N/gi, "\n")
      .trim();
    if (text) cues.push(`${toVttTime(parts[iStart])} --> ${toVttTime(parts[iEnd])}\n${text}`);
  }
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

export function toVtt(text: string, format: SubtitleTrackRef["format"]): string {
  if (format === "srt") return srtToVtt(text);
  if (format === "ass") return assToVtt(text);
  return text.startsWith("WEBVTT") ? text : `WEBVTT\n\n${text}`;
}

export function subtitleFormatFromName(name: string): SubtitleTrackRef["format"] | undefined {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "vtt") return "vtt";
  if (ext === "srt") return "srt";
  if (ext === "ass" || ext === "ssa") return "ass";
  return undefined;
}

export async function subtitleBlobUrl(track: SubtitleTrackRef): Promise<string> {
  const raw = track.url.startsWith("blob:") || track.url.startsWith("data:")
    ? await (await fetch(track.url)).text()
    : await fetchText(track.url);
  return URL.createObjectURL(new Blob([toVtt(raw, track.format)], { type: "text/vtt" }));
}

export async function subtitleFromFile(file: File): Promise<SubtitleTrackRef | undefined> {
  const format = subtitleFormatFromName(file.name);
  if (!format) return undefined;
  const vtt = toVtt(await file.text(), format);
  return {
    id: `file:${file.name}:${file.size}`,
    label: file.name.replace(/\.[^.]+$/, ""),
    url: URL.createObjectURL(new Blob([vtt], { type: "text/vtt" })),
    format: "vtt",
  };
}
