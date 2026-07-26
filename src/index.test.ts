import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import pack from "./index";

/**
 * Manifest contract tests. This is the only pack that declares a **premium**
 * tool, so alongside the usual id/slug/SEO checks these pin the monetisation
 * fields: `premiumDefault` decides whether the site's `ToolGate` demands a
 * login + entitlement, and `priceCentsDefault` seeds the Stripe Checkout
 * amount. A flag lost in an edit silently makes a paid tool free.
 */

const repoRoot = new URL("..", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", repoRoot), "utf8")) as {
  name: string;
  files: string[];
};

/** Categories the tools site renders a section for. */
const CATEGORIES = ["developer", "design", "marketing", "media", "security"];

describe("pack envelope", () => {
  it("declares a stable pack id and name", () => {
    expect(pack.id).toBe("media");
    expect(pack.name).toBe("Medien");
  });

  it("ships both documented tools", () => {
    expect(pack.tools.map((t) => t.id).sort()).toEqual(["image-compress", "pdf-tools"]);
  });
});

describe("tool ids and slugs", () => {
  it("has no duplicate id or slug within the pack", () => {
    const ids = pack.tools.map((t) => t.id);
    const slugs = pack.tools.map((t) => t.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses URL-safe slugs (they become /tools/<slug>)", () => {
    for (const t of pack.tools) {
      expect(t.slug, `slug of ${t.id}`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(encodeURIComponent(t.slug)).toBe(t.slug);
    }
  });

  it("keeps the German public slugs stable", () => {
    const bySlug = Object.fromEntries(pack.tools.map((t) => [t.id, t.slug]));
    expect(bySlug["image-compress"]).toBe("bild-komprimieren");
    expect(bySlug["pdf-tools"]).toBe("pdf-werkzeuge");
  });
});

describe("premium gating", () => {
  const tool = (id: string) => pack.tools.find((t) => t.id === id);

  it("keeps the image compressor free", () => {
    // The free tool carries ads and is the SEO entry point — gating it would
    // remove both.
    expect(tool("image-compress")?.premiumDefault ?? false).toBe(false);
    expect(tool("image-compress")?.priceCentsDefault).toBeUndefined();
  });

  it("marks the PDF toolkit premium with a price", () => {
    const pdf = tool("pdf-tools");
    expect(pdf?.premiumDefault).toBe(true);
    expect(pdf?.priceCentsDefault).toBe(500);
  });

  it("states the price in whole cents", () => {
    for (const t of pack.tools) {
      const price = t.priceCentsDefault;
      if (price === undefined) continue;
      expect(Number.isInteger(price), `${t.id} price must be an integer`).toBe(true);
      expect(price).toBeGreaterThan(0);
    }
  });

  it("never prices a tool that is not premium", () => {
    // A price on a free tool is contradictory and would confuse the catalog.
    for (const t of pack.tools) {
      if (!t.premiumDefault) {
        expect(t.priceCentsDefault, `${t.id} is free but priced`).toBeUndefined();
      }
    }
  });

  it("always prices a tool that IS premium", () => {
    for (const t of pack.tools) {
      if (t.premiumDefault) {
        expect(t.priceCentsDefault, `${t.id} is premium but unpriced`).toBeGreaterThan(0);
      }
    }
  });
});

describe("required tool fields", () => {
  it.each([["image-compress"], ["pdf-tools"]])("%s is fully described", (id) => {
    const tool = pack.tools.find((t) => t.id === id);
    if (!tool) throw new Error(`tool ${id} is missing from the pack`);

    expect(tool.name.length).toBeGreaterThan(3);
    expect(tool.description.length).toBeGreaterThan(20);
    expect(tool.icon).toBeTruthy();
    expect(CATEGORIES).toContain(tool.category);

    const { keywords } = tool;
    if (!keywords) throw new Error(`tool ${id} has no keywords`);
    expect(keywords.length).toBeGreaterThan(2);
  });

  it("carries SEO metadata within search-result budgets", () => {
    for (const t of pack.tools) {
      const { title, description } = t.seo ?? {};
      if (!title || !description) throw new Error(`tool ${t.id} has an incomplete seo block`);
      expect(title.length, `seo.title of ${t.id}`).toBeLessThanOrEqual(70);
      expect(description.length, `seo.description of ${t.id}`).toBeGreaterThan(50);
      expect(description.length, `seo.description of ${t.id}`).toBeLessThanOrEqual(170);
    }
  });
});

describe("component wiring", () => {
  it("points every component at this package's own tools/ directory", () => {
    for (const t of pack.tools) {
      expect(t.component.startsWith(`${pkg.name}/tools/`), `${t.id} component`).toBe(true);
      expect(t.component.endsWith(".astro")).toBe(true);
    }
  });

  it("resolves every component to a file that actually exists", () => {
    for (const t of pack.tools) {
      const rel = t.component.slice(`${pkg.name}/`.length);
      expect(existsSync(fileURLToPath(new URL(rel, repoRoot))), `missing ${rel}`).toBe(true);
    }
  });

  it("publishes the directories the site consumes as source", () => {
    expect(pkg.files).toContain("tools");
    expect(pkg.files).toContain("islands");
  });
});

describe("i18n", () => {
  it("provides the same keys in German and English", () => {
    const de = Object.keys(pack.i18n?.de ?? {}).sort();
    const en = Object.keys(pack.i18n?.en ?? {}).sort();
    expect(de).toEqual(en);
    expect(de.length).toBeGreaterThan(0);
  });

  it("namespaces every i18n key under the pack id", () => {
    for (const key of Object.keys(pack.i18n?.de ?? {})) {
      expect(key.startsWith(`${pack.id}.`), `key "${key}"`).toBe(true);
    }
  });
});
