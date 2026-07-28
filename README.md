# @tracht-digital-solutions/tds-tool-media

Media utilities for the **TDS tools platform** (`tds-tools-frontend`). Fully client-side —
nothing is uploaded.

## Tools

| id | slug | premium | description |
|---|---|---|---|
| `image-compress` | `bild-komprimieren` | no | Resize + re-encode images (JPEG/WebP) with a quality slider |
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
- **`islands/ImageCompress.test.tsx`** — the resize arithmetic, including the
  "never upscale a smaller image" branch, the format/quality handed to
  `toBlob`, and the size/percentage readout. Canvas and image decoding are
  stubbed (jsdom has neither); the arithmetic under test is the tool's own.

`test-setup.ts` shims `Blob.arrayBuffer`, which jsdom lacks — a limitation of
the test DOM, not of the tool.

The `.astro` shells + `.tsx` islands are validated at the **site** build. Release
on push to `main` (auto-release @latest; the manual button is for minor/major). See `tds-tools-contract-pkg` for the platform model.
