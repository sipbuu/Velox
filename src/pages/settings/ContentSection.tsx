import { useMemo, useState } from "react";
import { Eye, KeyRound, Lock } from "lucide-react";
import { useFilters } from "@/store/filters";
import { useRawLibrary } from "@/store/library";
import { requirePin } from "@/lib/requirePin";
import { categoryKey } from "@/lib/contentFilter";
import { Row, Section, Toggle } from "@/components/ui/SettingsRows";

export function ContentSection() {
  const f = useFilters();
  const raw = useRawLibrary();
  const [pinDraft, setPinDraft] = useState("");
  const [editingPin, setEditingPin] = useState(false);

  const catNames = useMemo(() => new Map(raw.categories.map((c) => [categoryKey(c), `${c.name} · ${c.kind === "live" ? "Live" : c.kind === "movie" ? "Movies" : "Series"}`])), [raw.categories]);

  const guarded = async (reason: string, fn: () => void) => {
    if (await requirePin(reason)) fn();
  };

  return (
    <Section title="Content & Parental Controls">
      <Toggle
        label="Hide adult content"
        hint="Hides categories and channels that look like adult content (XXX, 18+, For Adults…) across every source."
        value={f.hideAdult}
        onChange={(v) => (v ? f.setHideAdult(true) : guarded("Turn off the adult content filter", () => f.setHideAdult(false)))}
      />
      <Toggle
        label="Show hidden content this session"
        hint="Temporarily reveals everything you've hidden. Resets when the app restarts."
        value={f.showHidden}
        onChange={(v) => (v ? guarded("Reveal hidden content", () => f.setShowHidden(true)) : f.setShowHidden(false))}
      />
      <Row label="Parental PIN">
        {editingPin ? (
          <form
            className="flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await f.setPin(pinDraft);
              setPinDraft("");
              setEditingPin(false);
            }}
          >
            <input
              className="input !w-28 text-center tracking-widest"
              inputMode="numeric"
              type="password"
              placeholder="4–8 digits"
              maxLength={8}
              autoFocus
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ""))}
            />
            <button className="btn-primary !px-3" disabled={pinDraft.length < 4}>
              Save
            </button>
          </form>
        ) : (
          <div className="flex gap-2">
            <button className="btn-glass" onClick={() => guarded("Change the parental PIN", () => setEditingPin(true))}>
              <KeyRound size={14} /> {f.pinHash ? "Change" : "Set PIN"}
            </button>
            {f.pinHash && (
              <button className="btn-glass text-live" onClick={() => guarded("Remove the parental PIN", () => void f.setPin(null))}>
                Remove
              </button>
            )}
          </div>
        )}
      </Row>

      {f.hiddenCategories.length + f.hiddenItems.length > 0 && (
        <div className="py-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Lock size={14} /> Hidden ({f.hiddenCategories.length + f.hiddenItems.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {f.hiddenCategories.map((k) => (
              <HiddenChip key={k} label={catNames.get(k) ?? "Category (source offline)"} onUnhide={() => guarded("Unhide this category", () => f.unhideCategory(k))} />
            ))}
            {f.hiddenItems.map((uid) => (
              <HiddenChip key={uid} label={raw.byUid.get(uid)?.title ?? "Item (source offline)"} onUnhide={() => guarded("Unhide this item", () => f.unhideItem(uid))} />
            ))}
          </div>
        </div>
      )}
      <p className="py-3 text-xs text-ink-muted">Tip: long-press (or right-click) any channel, title or category chip to hide it.</p>
    </Section>
  );
}

function HiddenChip({ label, onUnhide }: { label: string; onUnhide: () => void }) {
  return (
    <span className="glass-pill flex items-center gap-2 py-1 pl-3 pr-1 text-xs">
      {label}
      <button aria-label={`Unhide ${label}`} className="grid h-6 w-6 place-items-center rounded-full hover:bg-ink/10" onClick={onUnhide}>
        <Eye size={13} />
      </button>
    </span>
  );
}
