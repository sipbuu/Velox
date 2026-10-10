import { describe, expect, it } from "vitest";
import { assToVtt, srtToVtt } from "./subtitles";

describe("subtitle conversion", () => {
  it("converts SRT to VTT", () => {
    const vtt = srtToVtt("1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nWorld\r\n");
    expect(vtt).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\n\n00:00:03.000 --> 00:00:04.000\nWorld\n");
  });

  it("converts ASS dialogue lines", () => {
    const ass = `[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,{\\i1}Hi,\\Nthere`;
    expect(assToVtt(ass)).toBe("WEBVTT\n\n00:00:01.500 --> 00:00:03.000\nHi,\nthere\n");
  });
});
