import { describe, expect, it } from "vitest";
import { buildCatchupUrl, fillCatchupTemplate } from "./catchup";

const start = Date.UTC(2025, 0, 1, 10, 0, 0);
const now = start + 3 * 3600_000;

describe("catch-up urls", () => {
  it("fills utc/duration templates", () => {
    expect(fillCatchupTemplate("?utc={utc}&lutc={lutc}&dur={duration}", start, 60, now)).toBe(`?utc=${start / 1000}&lutc=${now / 1000}&dur=3600`);
    expect(fillCatchupTemplate("/${start}-${duration}.m3u8", start, 30, now)).toBe(`/${start / 1000}-1800.m3u8`);
  });

  it("supports append, default and shift types", () => {
    expect(buildCatchupUrl("http://x/live.m3u8", { type: "append", source: "?utc={utc}" }, start, 60, now)).toBe(`http://x/live.m3u8?utc=${start / 1000}`);
    expect(buildCatchupUrl("http://x/live.m3u8", { type: "default", source: "http://x/archive/{utc}/{duration}.ts" }, start, 60, now)).toBe(`http://x/archive/${start / 1000}/3600.ts`);
    expect(buildCatchupUrl("http://x/live.m3u8?token=1", { type: "shift" }, start, 60, now)).toBe(`http://x/live.m3u8?token=1&utc=${start / 1000}&lutc=${now / 1000}`);
  });

  it("supports flussonic paths", () => {
    expect(buildCatchupUrl("http://x/ch/index.m3u8", { type: "flussonic" }, start, 60, now)).toBe(`http://x/ch/index-${start / 1000}-3600.m3u8`);
  });
});
