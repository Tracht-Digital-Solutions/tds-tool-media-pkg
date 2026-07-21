# @tracht-digital-solutions/tds-tool-media

Media utilities for the **TDS tools platform** (`tds-tools`). Fully client-side —
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
npm run build
```

The `.astro` shells + `.tsx` islands are validated at the **site** build. Release
on push to `main` (auto-release @latest; the manual button is for minor/major). See `tds-tools-contract` for the platform model.
