import type { Category, MediaItem } from "@/types/media";

const ADULT_RE = /(^|[^a-z])(adults?|xxx|porn\w*|erotic\w*|18\s*\+|\+\s*18|for adults|after dark|nsfw|hentai|playboy)([^a-z]|$)/i;

export const looksAdult = (name: string) => ADULT_RE.test(name);

export const categoryKey = (c: Pick<Category, "sourceId" | "id">) => `${c.sourceId}::${c.id}`;

export interface ContentFilter {
  hiddenCategories: Set<string>;
  hiddenItems: Set<string>;
  hideAdult: boolean;
  bypass: boolean;
}

export function isCategoryHidden(c: Category, f: ContentFilter): boolean {
  if (f.bypass) return false;
  if (f.hiddenCategories.has(categoryKey(c))) return true;
  return f.hideAdult && (c.adult === true || looksAdult(c.name));
}

export function isItemHidden(item: MediaItem, hiddenCategoryKeys: Set<string>, f: ContentFilter): boolean {
  if (f.bypass) return false;
  if (f.hiddenItems.has(item.uid)) return true;
  if (f.hideAdult && (item.extra?.adult === true || looksAdult(item.title))) return true;
  return item.categoryIds.length > 0 && item.categoryIds.every((id) => hiddenCategoryKeys.has(`${item.sourceId}::${id}`));
}

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`velox-pin:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
