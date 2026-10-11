export const youtubeEmbed = (key: string, opts: { muted?: boolean; loop?: boolean; controls?: boolean } = {}) => {
  const q = new URLSearchParams({
    autoplay: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
    mute: opts.muted ? "1" : "0",
    controls: opts.controls === false ? "0" : "1",
    ...(opts.loop ? { loop: "1", playlist: key } : {}),
  });
  return `https://www.youtube-nocookie.com/embed/${key}?${q}`;
};
