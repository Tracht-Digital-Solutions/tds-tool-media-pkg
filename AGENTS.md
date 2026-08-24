# AGENTS.md — tds-tool-media-pkg

A **tool package** for the TDS tools platform (image compressor + premium PDF
toolkit). Read `tds-tools-contract-pkg`'s AGENTS.md for the platform model.

## Shape

- `src/index.ts` — the `ToolPackManifest` (two tools). Only file tsup compiles +
  `tsc` type-checks.
- `tools/*.astro` — shells the site's `/tools/[slug]` template renders.
- `islands/*.tsx` — hydrated React islands, fully client-side. Image compression
  via canvas (no dep); PDF merge/split/rotate via `pdf-lib` (a real dependency,
  installed transitively at the site).

## Tests

`npm run test:run` (vitest). Islands opt into jsdom via a `@vitest-environment`
docblock; the manifest suite runs in node.

- **pdf-lib is exercised for real** — it runs under Node, so `PdfTools.test.tsx`
  builds genuine PDFs, runs merge/split/rotate, and loads the output back to
  assert page count, page order and rotation. Only `URL.createObjectURL` and the
  anchor click are stubbed, and `createObjectURL` doubles as the capture point
  for the produced bytes.
- **`test-setup.ts` shims `Blob.arrayBuffer`** — jsdom 25 does not implement it,
  and both islands read the chosen file with it. Without the shim every test
  fails with `f.arrayBuffer is not a function`. Browsers have had it for years;
  this is a test-DOM gap, not a tool bug.
- **Canvas is stubbed for `ImageCompress`** (jsdom has no 2D context). The
  assertions are about the arithmetic the tool owns — the resize rule, the
  never-upscale clamp, the format/quality passed to `toBlob` — not the stub.
- **The premium fields are checked both ways**: nothing free may carry a price,
  nothing premium may lack one. Dropping `premiumDefault` from the PDF tool
  fails the suite (verified); otherwise a paid tool silently becomes free.
- Rotation must **accumulate** onto the existing page angle and wrap at 360°.
  Both directions are pinned — replacing instead of adding fails two tests.

## Gotchas

- **This pack ships NO CSS — every control must carry a shared class.** The tools
  site renders on the `blog` surface (it moved there 2026-08-17; it was `panel`
  before, and both are token-only layers), and a surface layer only sets tokens: they
  reach an element through `btn` / `chip` / `field-boxed` / `tds-card`. A
  `<button>` without `btn` therefore has no padding, no radius and no 44px touch
  target, and an `<input>` without `field-boxed` renders **invisible**, because
  Tailwind preflight zeroes borders.
  Until 2026-08-16 every button in this pack was bare and the markup wrote its own
  radii — `rounded-full` tabs (the *marketing* pill) and `rounded-lg` inputs, long
  after the site had left the marketing surface. That is why the tools rounded
  differently from everything around them. `npm run lint:primitives` runs in CI and fails on a bare
  control; the script is a byte-identical copy of the seed in `tds-ext-template-pkg`.
- **Never hand-author a radius, and do not reach for `rounded-[var(--tds-radius-*)]`
  either.** Tailwind does not generate arbitrary values out of a package inside
  `node_modules`, so from here that ships as no rule at all. Use the shared class.
- **Attribute order no longer matters, and neither does what you name a class
  constant** (fixed 2026-08-16). `lint-primitives` used to match a tag with
  `[^>]*>`, which stops at the first `>` — and an arrow handler
  (`onClick={() => …}`) supplies one, so a correctly classed control written after
  its handler was reported as bare. It also read `className={x}` as the literal
  text `x`, so `{field}` passed and `{area}` did not. The script now walks the tag
  tracking quotes and brace depth, and resolves a local `const` to its string.
  Both workarounds are gone; all 20 repos carry the identical fixed script.
- **`islands/` is NOT type-checked here** (`tsconfig` covers `src/**/*` only). The
  islands are compiled by the tds-tools-frontend build — that build is the real
  gate for a markup change, not `npm run type-check`.

- `component` = package subpath via `exports`, never relative.
- Tool `id` + `slug` globally unique across composed packs.
- `pdf-tools` declares `premiumDefault: true` — the paywall itself lives in the
  site tool page (login + entitlement) + `tds-ext-tools-pkg` (Stripe), NOT here. This
  package just marks the default.
- Islands/.astro compile at the site build (not in tsconfig `include`).
- Version stays in the `0.1.x` line (site pins `^0.1.x`).
