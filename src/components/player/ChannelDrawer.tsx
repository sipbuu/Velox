import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { MediaItem } from "@/types/media";
import { Artwork } from "@/components/media/Artwork";
import { useEpg } from "@/hooks/useEpgNow";
import { cn } from "@/lib/cn";

interface Props {
  channels: MediaItem[];
  currentUid?: string;
  onPick: (item: MediaItem) => void;
  onClose: () => void;
}

export function ChannelDrawer({ channels, currentUid, onPick, onClose }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => activeRef.current?.scrollIntoView({ block: "center" }), []);
  return (
    <aside className="glass-dark absolute inset-y-3 right-3 z-30 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-glass-lg animate-fade-up" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <p className="font-semibold">Channels</p>
        <button aria-label="Close channel list" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-2 pb-3">
        {channels.map((c) => (
          <ChannelRow key={c.uid} item={c} active={c.uid === currentUid} innerRef={c.uid === currentUid ? activeRef : undefined} onPick={onPick} />
        ))}
      </div>
    </aside>
  );
}

function ChannelRow({ item, active, innerRef, onPick }: { item: MediaItem; active: boolean; innerRef?: React.Ref<HTMLButtonElement>; onPick: (i: MediaItem) => void }) {
  const { current } = useEpg(item);
  return (
    <button
      ref={innerRef}
      className={cn("flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors", active ? "bg-white/15" : "hover:bg-white/10")}
      onClick={() => onPick(item)}
    >
      <Artwork src={item.artwork.logo} title={item.title} variant="logo" fit="contain" className="h-10 w-16 shrink-0 rounded-lg bg-white/90" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {item.kind === "live" && item.number != null && <span className="mr-1.5 tabular-nums text-white/50">{item.number}</span>}
          {item.title}
        </span>
        {current && <span className="block truncate text-xs text-white/55">{current.title}</span>}
      </span>
      {active && <span className="h-2 w-2 shrink-0 rounded-full bg-live animate-live-pulse" />}
    </button>
  );
}
