import { describe, expect, it } from "vitest";
import { isCategoryHidden, isItemHidden, looksAdult, type ContentFilter } from "./contentFilter";
import type { Category, MediaItem } from "@/types/media";

const filter = (over: Partial<ContentFilter> = {}): ContentFilter => ({
  hiddenCategories: new Set(),
  hiddenItems: new Set(),
  hideAdult: true,
  bypass: false,
  ...over,
});

const cat = (name: string, id = "live:1"): Category => ({ id, sourceId: "s", kind: "live", name });
const item = (title: string, categoryIds = ["live:1"]): MediaItem => ({
  uid: `s:live:${title}`, id: title, sourceId: "s", kind: "live", title, categoryIds, artwork: {},
});

describe("content filter", () => {
  it("detects adult category names without false positives", () => {
    expect(looksAdult("XXX | Adult")).toBe(true);
    expect(looksAdult("FOR ADULTS 18+")).toBe(true);
    expect(looksAdult("Adults Only")).toBe(true);
    expect(looksAdult("Sports")).toBe(false);
    expect(looksAdult("Kids 1080p")).toBe(false);
    expect(looksAdult("Middlesex News")).toBe(false);
  });

  it("hides categories by key or adult flag and honours bypass", () => {
    expect(isCategoryHidden(cat("Adult"), filter())).toBe(true);
    expect(isCategoryHidden(cat("Adult"), filter({ hideAdult: false }))).toBe(false);
    expect(isCategoryHidden(cat("News"), filter({ hiddenCategories: new Set(["s::live:1"]) }))).toBe(true);
    expect(isCategoryHidden(cat("Adult"), filter({ bypass: true }))).toBe(false);
  });

  it("hides items whose categories are all hidden", () => {
    const hidden = new Set(["s::live:1"]);
    expect(isItemHidden(item("A"), hidden, filter())).toBe(true);
    expect(isItemHidden(item("A", ["live:1", "live:2"]), hidden, filter())).toBe(false);
    expect(isItemHidden(item("B", ["live:2"]), hidden, filter({ hiddenItems: new Set(["s:live:B"]) }))).toBe(true);
  });
});
