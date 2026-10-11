import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/nativeTabs", () => ({}));
vi.mock("@/store/player", () => ({ usePlayer: () => false }));

const { tabIndexFor } = await import("./useNativeTabBar");

const tabs = ["/", "/live", "/movies", "/series", "/favorites", "/more"].map((to) => ({ to }));

describe("tabIndexFor", () => {
  it("maps top-level routes", () => {
    expect(tabIndexFor("/", tabs)).toBe(0);
    expect(tabIndexFor("/movies", tabs)).toBe(2);
    expect(tabIndexFor("/favorites", tabs)).toBe(4);
  });

  it("maps detail and secondary routes to their parent tab", () => {
    expect(tabIndexFor("/title/abc", tabs)).toBe(2);
    expect(tabIndexFor("/series/xyz", tabs)).toBe(3);
    expect(tabIndexFor("/guide", tabs)).toBe(1);
    expect(tabIndexFor("/settings", tabs)).toBe(5);
  });

  it("never falls back to Home for unknown routes", () => {
    expect(tabIndexFor("/unknown", tabs)).toBe(-1);
  });
});
