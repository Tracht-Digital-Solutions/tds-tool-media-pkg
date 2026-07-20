# AGENTS.md — tds-tool-media

A **tool package** for the TDS tools platform (image compressor + premium PDF
toolkit). Read `tds-tools-contract`'s AGENTS.md for the platform model.

## Shape

- `src/index.ts` — the `ToolPackManifest` (two tools). Only file tsup compiles +
  `tsc` type-checks.
- `tools/*.astro` — shells the site's `/tools/[slug]` template renders.
- `islands/*.tsx` — hydrated React islands, fully client-side. Image compression
  via canvas (no dep); PDF merge/split/rotate via `pdf-lib` (a real dependency,
  installed transitively at the site).

## Gotchas

- `component` = package subpath via `exports`, never relative.
- Tool `id` + `slug` globally unique across composed packs.
- `pdf-tools` declares `premiumDefault: true` — the paywall itself lives in the
  site tool page (login + entitlement) + `tds-ext-tools` (Stripe), NOT here. This
  package just marks the default.
- Islands/.astro compile at the site build (not in tsconfig `include`).
- Version stays in the `0.1.x` line (site pins `^0.1.x`).
