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

- `component` = package subpath via `exports`, never relative.
- Tool `id` + `slug` globally unique across composed packs.
- `pdf-tools` declares `premiumDefault: true` — the paywall itself lives in the
  site tool page (login + entitlement) + `tds-ext-tools-pkg` (Stripe), NOT here. This
  package just marks the default.
- Islands/.astro compile at the site build (not in tsconfig `include`).
- Version stays in the `0.1.x` line (site pins `^0.1.x`).
