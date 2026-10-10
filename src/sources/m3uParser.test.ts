import { describe, expect, it } from "vitest";
import { parseM3U } from "./m3uParser";

const SAMPLE = `#EXTM3U url-tvg="http://epg.example/guide.xml"
#EXTINF:-1 tvg-id="bbc1.uk" tvg-name="BBC One" tvg-logo="http://logo/bbc1.png" group-title="UK | General",BBC One HD
#EXTVLCOPT:http-user-agent=VeloxTest/1.0
http://example.com/live/user/pass/1001.ts
#EXTINF:7200 tvg-logo="http://img/poster.jpg" group-title="Movies, Action",Some Movie (2024)
http://example.com/movie/user/pass/5001.mkv
#EXTINF:-1 group-title="Shows",Show S01 E02
http://example.com/series/user/pass/9001.mp4
`;

describe("parseM3U", () => {
  const pl = parseM3U(SAMPLE);

  it("reads header EPG url", () => {
    expect(pl.epgUrls).toEqual(["http://epg.example/guide.xml"]);
  });

  it("parses attributes and titles with commas inside quotes", () => {
    expect(pl.entries).toHaveLength(3);
    expect(pl.entries[0]).toMatchObject({ title: "BBC One HD", tvgId: "bbc1.uk", group: "UK | General", kind: "live" });
    expect(pl.entries[1]).toMatchObject({ title: "Some Movie (2024)", group: "Movies, Action", kind: "movie" });
  });

  it("captures per-entry headers and classifies series", () => {
    expect(pl.entries[0].headers["User-Agent"]).toBe("VeloxTest/1.0");
    expect(pl.entries[1].headers).toEqual({});
    expect(pl.entries[2].kind).toBe("series");
  });
});
