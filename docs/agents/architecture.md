# Architecture

## Layout

- `src/index.ts` — the `ToolPackManifest` with two tools. It is the only file tsup
  compiles and the only file `tsc` type-checks.
- `tools/*.astro` — tool shells that the site's `/tools/[slug]` template renders.
- `islands/*.tsx` — hydrated React islands, fully client-side.
  - Image compression uses canvas, no dependency.
  - PDF merge/split/rotate uses `pdf-lib`, a real dependency that the site installs
    transitively.

## Manifest contract

- `component` is a package subpath resolved via `exports`, never relative.
- Tool `id` and `slug` must stay unique across all composed packs.
- `islands/` and `tools/` are not in this repo's tsconfig `include`. They compile in
  the `tds-tools-frontend` build, which is the real gate for a markup change.

## Premium

`pdf-tools` declares `premiumDefault: true`. The paywall itself (login and entitlement)
lives in the site's tool page and in `tds-ext-tools-pkg` (Stripe), **not** here. This
package only marks the default.
