import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { url: string; method?: string; body?: string }[] = [];
let routes: Record<string, unknown> = {};

vi.mock("@/lib/http", () => ({
  HttpError: class extends Error {
    status = 500;
  },
  requestJson: vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    calls.push({ url, method: opts.method, body: opts.body });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`no route for ${url}`);
    return routes[key];
  }),
  request: vi.fn(async () => ({ status: 204, text: "" })),
}));
vi.mock("@/lib/credentials", () => ({ saveSecrets: vi.fn(async () => {}) }));
vi.stubGlobal("__APP_VERSION__", "test");

const { JellyfinSource } = await import("./jellyfin");
const { PlexSource } = await import("./plex");

beforeEach(() => {
  calls.length = 0;
  routes = {};
});

describe("JellyfinSource", () => {
  const cfg = { id: "jf", kind: "jellyfin" as const, name: "JF", enabled: true, createdAt: 0, server: "http://jf:8096/", username: "me", deviceId: "dev1" };

  it("logs in, maps libraries and live TV", async () => {
    routes = {
      "/Users/AuthenticateByName": { AccessToken: "tok", User: { Id: "u1", Name: "me" } },
      "/Users/u1/Views": { Items: [{ Id: "v1", Name: "Movies", CollectionType: "movies" }, { Id: "v2", Name: "Shows", CollectionType: "tvshows" }] },
      "ParentId=v1": { Items: [{ Id: "m1", Name: "Film", Type: "Movie", ProductionYear: 2020, ImageTags: { Primary: "abc" }, RunTimeTicks: 72_000_000_000 }] },
      "ParentId=v2": { Items: [{ Id: "s1", Name: "Show", Type: "Series" }] },
      "/LiveTv/Channels": { Items: [{ Id: "c1", Name: "News", ChannelNumber: "4" }] },
    };
    const src = new JellyfinSource(cfg, { password: "pw" });
    const lib = await src.loadLibrary();
    expect(lib.categories.map((c) => c.name)).toEqual(["Movies", "Shows", "Live TV"]);
    const movie = lib.items.find((i) => i.kind === "movie")!;
    expect(movie).toMatchObject({ title: "Film", year: 2020, durationSec: 7200 });
    expect(movie.artwork.poster).toBe("http://jf:8096/Items/m1/Images/Primary?fillHeight=600&quality=90&tag=abc");
    expect(lib.items.find((i) => i.kind === "live")).toMatchObject({ title: "News", number: 4 });
    expect(calls[0].body).toContain('"Pw":"pw"');
  });

  it("prefers direct stream for mp4 and transcoding otherwise", async () => {
    routes = {
      "/Users/AuthenticateByName": { AccessToken: "tok", User: { Id: "u1", Name: "me" } },
      "/Items/m1/PlaybackInfo": { PlaySessionId: "ps", MediaSources: [{ Id: "ms1", Container: "mp4", SupportsDirectStream: true, MediaStreams: [{ Type: "Subtitle", Index: 3, Language: "eng", DisplayTitle: "English", DeliveryMethod: "External", DeliveryUrl: "/Videos/m1/ms1/Subtitles/3/0/Stream.vtt" }] }] },
      "/Items/m2/PlaybackInfo": { MediaSources: [{ Id: "ms2", Container: "mkv", SupportsDirectStream: true, TranscodingUrl: "/videos/m2/master.m3u8?api_key=tok&x=1" }] },
    };
    const src = new JellyfinSource(cfg, { password: "pw" });
    const item = { uid: "jf:movie:m1", id: "m1", sourceId: "jf", kind: "movie" as const, title: "Film", categoryIds: [], artwork: {} };
    const a = await src.resolvePlayback(item);
    expect(a.url).toContain("/Videos/m1/stream.mp4?Static=true&MediaSourceId=ms1&api_key=tok");
    expect(a.container).toBe("mp4");
    expect(a.subtitles?.[0]).toMatchObject({ label: "English", format: "vtt" });
    const b = await src.resolvePlayback({ ...item, id: "m2", uid: "jf:movie:m2" });
    expect(b.url).toBe("http://jf:8096/videos/m2/master.m3u8?api_key=tok&x=1");
    expect(b.container).toBe("hls");
  });
});

describe("PlexSource", () => {
  const cfg = { id: "px", kind: "plex" as const, name: "Plex", enabled: true, createdAt: 0, server: "http://plex:32400", clientId: "cid" };

  it("maps sections and chooses HLS for mkv", async () => {
    routes = {
      "/library/sections/1/all": { MediaContainer: { Metadata: [{ ratingKey: "10", key: "/library/metadata/10", type: "movie", title: "Plex Film", year: 2021, thumb: "/thumb/10", Media: [{ container: "mkv", Part: [{ id: 1, key: "/library/parts/1/file.mkv", container: "mkv" }] }] }] } },
      "/library/sections": { MediaContainer: { Directory: [{ key: "1", title: "Films", type: "movie" }, { key: "2", title: "Music", type: "artist" }] } },
      "/library/metadata/10": { MediaContainer: { Metadata: [{ ratingKey: "10", key: "/library/metadata/10", type: "movie", title: "Plex Film", Media: [{ container: "mkv", Part: [{ id: 1, key: "/library/parts/1/file.mkv", container: "mkv", Stream: [{ streamType: 3, key: "/library/streams/5", codec: "srt", languageCode: "eng", displayTitle: "English (SRT)" }] }] }] }] } },
    };
    const src = new PlexSource(cfg, { token: "ptok" });
    const lib = await src.loadLibrary();
    expect(lib.categories).toHaveLength(1);
    expect(lib.items[0]).toMatchObject({ title: "Plex Film", kind: "movie" });
    expect(lib.items[0].artwork.poster).toContain("/photo/:/transcode?width=400&height=600");
    const req = await src.resolvePlayback(lib.items[0]);
    expect(req.container).toBe("hls");
    expect(req.url).toContain("/video/:/transcode/universal/start.m3u8?");
    expect(req.url).toContain("X-Plex-Token=ptok");
    expect(req.subtitles?.[0]).toMatchObject({ format: "srt", url: "http://plex:32400/library/streams/5?X-Plex-Token=ptok" });
  });
});
