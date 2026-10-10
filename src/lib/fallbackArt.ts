const PALETTES: [string, string][] = [
  ["#5b8cff", "#7a5cff"],
  ["#ff5ca8", "#ff8a5c"],
  ["#22c3a6", "#2a8cff"],
  ["#ffb020", "#ff5c5c"],
  ["#8e5cff", "#d65cff"],
  ["#2dd4bf", "#84cc16"],
  ["#f43f5e", "#a855f7"],
  ["#0ea5e9", "#6366f1"],
];

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const NOISE = /\b(hd|fhd|uhd|sd|4k|8k|hevc|h265|h\.265|raw|backup|vip|\d{3,4}p|\(.*?\)|\[.*?\])\b/gi;

export function initialsFor(title: string): string {
  const cleaned = title
    .replace(/^[A-Z]{2,3}\s*[|:\-–]\s*/, "")
    .replace(NOISE, " ")
    .replace(/[^\p{L}\p{N}\s&+]/gu, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export function fallbackArtwork(title: string, variant: "logo" | "poster" = "logo"): string {
  const [a, b] = PALETTES[hashString(title) % PALETTES.length];
  const initials = escapeXml(initialsFor(title));
  const w = variant === "poster" ? 400 : 400;
  const h = variant === "poster" ? 600 : 400;
  const fontSize = variant === "poster" ? 120 : 150;
  const caption =
    variant === "poster"
      ? `<text x="50%" y="88%" text-anchor="middle" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="26" font-weight="600" fill="#fff" fill-opacity="0.85">${escapeXml(title.slice(0, 28))}</text>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="50%" fill="url(#s)"/><circle cx="${w * 0.85}" cy="${h * 0.12}" r="${w * 0.35}" fill="#fff" fill-opacity=".08"/><text x="50%" y="${variant === "poster" ? "50%" : "54%"}" dominant-baseline="middle" text-anchor="middle" font-family="-apple-system,SF Pro Display,Segoe UI,Roboto,sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff" letter-spacing="-4">${initials}</text>${caption}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
