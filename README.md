# Velox

A fast, multi-source media player and streaming client for **iOS, macOS, Windows, Linux and the Web**, built with Tauri v2, React, Tailwind and Rust.

Velox isn't tied to one provider. You can mix any of these in a single library:

| Source | What you get |
| --- | --- |
| **Xtream Codes** | Live TV, VOD movies, series with seasons/episodes, short EPG, catch-up (`/timeshift`) |
| **M3U / M3U8** | Playlist URL or imported file, `group-title` categories, `tvg-logo`, `#EXTVLCOPT` headers, XMLTV EPG via `url-tvg` |
| **Direct URLs** | Bookmarked HLS / MPEG-TS / MP4 / MKV streams |
| **Local files** | Folders on the device, sidecar subtitles (`movie.en.srt`, `movie.vtt`) picked up automatically |

New backends (Plex, Jellyfin, custom scrapers) are plugins: implement `MediaSource` and call `registerSourceFactory()`.

## Features

- **Liquid Glass UI**: frosted translucent surfaces, inner highlights, hairline borders, bento layouts, spring hover/tap animations. Light, dark and system themes, accent colours and a reduce-transparency option.
- **Artwork fallbacks**: logos and posters from Xtream/M3U metadata. Broken, 404 or 1×1 images get replaced by a generated gradient SVG with the channel's initials.
- **Playback**: hls.js, mpegts.js, or native HTML5/AVPlayer (hardware-accelerated) is picked per platform. On iOS and Safari, HLS goes through the native pipeline so AirPlay and PiP work.
- **Live time-shift**
  - *Native*: rewinds within the DVR window of HLS streams that provide one.
  - *Memory* (web): keeps the player's back-buffer for the configured window.
  - *Software Buffer Cache* (native apps, opt-in): the Rust relay records the live stream into a rolling HLS window in RAM or temp disk. Pause and rewind 10–300 s, even on raw MPEG-TS streams. Segments are evicted as the window slides. The cache is deleted when you leave the stream, and the whole cache directory is purged on quit and on the next launch.
- **Captions**: HLS WebVTT/IMSC1 and CEA-608/708, Xtream subtitle tracks, sidecar files, and drag-in `.srt` / `.vtt` / `.ass` (converted to WebVTT on the fly). You can change caption size, background and font.
- **Offline downloads** (native): a Rust download engine with concurrency limits, pause/resume via HTTP Range, progress events, and state that survives restarts. On iOS, files go to *Documents/Downloads* (visible in the Files app).
- **Credentials**: stored in the macOS/iOS Keychain, Windows Credential Manager, or Linux Secret Service via `keyring`. If no keychain service is available, an app-local 0600 file is used. The web build encrypts with AES-GCM in browser storage.
- **Native relay**: a token-protected localhost proxy that bypasses CORS, adds custom headers or User-Agent, and rewrites HLS playlists.

## Project structure

```
.
├── .github/
│   ├── workflows/
│   │   ├── ci.yml            # lint, typecheck, vitest, web build, cargo fmt/clippy/test on 3 OSes, iOS cross-compile
│   │   ├── release.yml       # tag v*.*.* → draft release: macOS universal, Windows, Linux, signed iOS IPA (if secrets), web zip
│   │   ├── nightly.yml       # daily if main changed → rolling "nightly" pre-release
│   │   └── pages.yml         # publish the web SPA to GitHub Pages when a release is published
│   └── dependabot.yml
├── public/velox.svg          # app icon source (npm run icons)
├── src/                      # React + TypeScript frontend
│   ├── types/media.ts        # unified media model (Category, LiveChannel, Movie, Series, Episode, PlaybackRequest…)
│   ├── sources/
│   │   ├── types.ts          # MediaSource / SourceFactory plugin interface
│   │   ├── registry.ts       # plugin registry
│   │   ├── xtream.ts         # Xtream Codes player_api client
│   │   ├── m3u.ts, m3uParser.ts
│   │   ├── local.ts          # native folder scan / browser folder picker
│   │   └── direct.ts
│   ├── store/                # Zustand: settings, sources, library (unified view), player, downloads
│   ├── components/
│   │   ├── player/           # VeloxPlayer, engine selection (hls.js / mpegts.js / native), TrackMenu (subs + audio)
│   │   ├── media/            # Artwork (fallbacks), PosterCard, ChannelTile, VirtualGrid
│   │   ├── layout/           # AppShell (sidebar / iOS tab bar), PlayerHost
│   │   └── ui/
│   ├── pages/                # Home (bento), Browse (live/movies/series), SeriesDetail, Search, Downloads, Sources, Settings
│   ├── hooks/                # theme sync, stream resolution (relay / time-shift), EPG
│   ├── lib/                  # IPC, HTTP, credentials, kv storage, subtitles, fallback art, media server client
│   └── styles/index.css      # theme tokens (light/dark) + glass components
├── src-tauri/                # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── Info.plist, Info.ios.plist   # ATS / local networking / background audio / Files app sharing
│   └── src/
│       ├── lib.rs            # app setup, state, command registration, purge on exit
│       ├── server.rs         # axum localhost relay: /proxy, /ts/{id}/index.m3u8, /ts/{id}/{seg}
│       ├── timeshift/        # rolling buffer: session window, HLS follower, MPEG-TS → HLS segmenter (PCR/keyframe aware)
│       ├── downloads.rs      # background download engine
│       └── commands/         # http, credentials, local scan, XMLTV EPG, media, downloads
├── tailwind.config.ts        # Liquid Glass tokens, shadows, blur, animations, grid templates
└── vite.config.ts
```

## Getting started

Prerequisites: Node 22+, Rust stable, and the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS. iOS development also needs Xcode 15+.

```bash
npm install

npm run dev            # web SPA at http://localhost:1420
npm run tauri:dev      # desktop app
npm run ios:init       # once: generates src-tauri/gen/apple
npm run ios:dev        # simulator or connected iPhone

npm run build:web      # static SPA in dist/ (relative base, hash routing)
npm run tauri:build    # desktop bundles
npm run ios:build      # IPA (needs signing)

npm test && npm run lint && npm run typecheck
cd src-tauri && cargo test && cargo clippy --all-targets
```

## Releases

Versions follow semver. The version lives in three places that must match: `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`. The release workflow checks this.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Optional repository secrets:

| Secret | Purpose |
| --- | --- |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | macOS code signing and notarization |
| `APPLE_DEVELOPMENT_TEAM`, `IOS_CERTIFICATE`, `IOS_CERTIFICATE_PASSWORD`, `IOS_MOBILE_PROVISION` | Signed iOS IPA (`vars.IOS_EXPORT_METHOD` defaults to `release-testing`) |

For the web deploy, set **Settings → Pages → Source** to *GitHub Actions*.

## Platform notes and known limitations

- **MKV** playback depends on the WebView. Chromium-based WebView2 (Windows) handles most MKV/H.264 files. WKWebView (macOS/iOS) and WebKitGTK generally can't play MKV, so use MP4/HLS there.
- **Raw MPEG-TS live** needs MSE. On iOS, Velox automatically routes TS streams through the Rust relay, which repackages them as HLS.
- **Encrypted HLS** (AES-128/SAMPLE-AES) works with native time-shift but not with the Software Buffer Cache.
- **iCloud Keychain sync**: credentials go to the device keychain. Syncing them across devices needs the `kSecAttrSynchronizable` attribute. That attribute isn't set by `keyring`, so it's planned as a small Swift plugin.
- **iOS background downloads** continue while the app is in the foreground or briefly backgrounded. Fully suspended transfers need a `URLSession` background-configuration plugin, which is also planned.
- **Web build**: Xtream and M3U servers often don't send CORS headers. Configure a CORS proxy in Settings, or use the native apps.
