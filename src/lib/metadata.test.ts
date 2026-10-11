import { describe, expect, it } from "vitest";
import { cleanTitle, youtubeKey } from "./metadata";

describe("metadata helpers", () => {
  it("cleans provider titles and extracts year", () => {
    expect(cleanTitle("EN - The Last Lighthouse (2023)")).toEqual({ title: "The Last Lighthouse", year: 2023 });
    expect(cleanTitle("|UK| Neon Harbor 4K HEVC 2019")).toEqual({ title: "Neon Harbor", year: 2019 });
    expect(cleanTitle("Blue.Hour.1080p")).toEqual({ title: "Blue Hour", year: undefined });
    expect(cleanTitle("Signal and Noise S01E02")).toEqual({ title: "Signal and Noise", year: undefined });
  });

  it("extracts youtube keys", () => {
    expect(youtubeKey("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeKey("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toBe("dQw4w9WgXcQ");
    expect(youtubeKey("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeKey("not a url")).toBeUndefined();
  });
});
