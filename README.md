# @tracht-digital-solutions/tds-tool-media

Media utilities for the **TDS tools platform** (`tds-tools-frontend`). Fully client-side —
nothing is uploaded.

## Tools

| id | slug | premium | description |
|---|---|---|---|
| `image-compress` | `bild-komprimieren` | no | Several images at once: fit to max width/height, re-encode as JPEG/WebP/PNG/AVIF at a quality or down to a target size in KB, presets, before/after view, ZIP download |
| `pdf-tools` | `pdf-werkzeuge` | **yes** | Merge / split / rotate PDFs (pdf-lib) |

`pdf-tools` ships `premiumDefault: true` + `priceCentsDefault: 500`; the admin
catalog decides the final gating + price. The paywall (login + purchase) is
enforced by the site's tool page, not this package.

## Develop

```bash
npm install
npm run type-check
npm run test:run     # vitest — manifest + both islands
npm run build
```

## Tests

- **`src/index.test.ts`** — manifest contract plus the **monetisation fields**:
  `premiumDefault` drives the site's `ToolGate` and `priceCentsDefault` seeds
  Stripe Checkout, so a flag lost in an edit silently makes a paid tool free.
  Cross-checks both ways: nothing free may carry a price, nothing premium may
  lack one.
- **`islands/PdfTools.test.tsx`** — runs **pdf-lib for real**. The tests build
  genuine PDFs, push them through merge / split / rotate, and load the produced
  file back to assert page counts, page order and rotation. Covers the range
  parser (`1-3,5`, de-duping, clamping, junk fragments) and that rotation
  *accumulates* onto an existing angle and wraps past 360°.
- **`islands/compressCore.test.ts`** — the compressor's arithmetic in node: the
  fit rule (never upscale), the target-size search (quality first, then
  pixels), file naming and a byte-level check of the stored ZIP writer.
- **`islands/ImageCompress.test.tsx`** — the wiring: limits and format/quality
  reaching the canvas, white fill under JPEG, several files, drop, presets,
  the ZIP download, "keep the original when re-encoding would grow it", and
  object-URL release. Canvas and image decoding are stubbed (jsdom has neither).

`test-setup.ts` shims `Blob.arrayBuffer`, which jsdom lacks — a limitation of
the test DOM, not of the tool.

The `.astro` shells + `.tsx` islands are validated at the **site** build. Release
on push to `main` (auto-release @latest; the manual button is for minor/major). See `tds-tools-contract-pkg` for the platform model.
