# AGENTS.md — tds-tool-media-pkg

Tool pack for the public tools platform: image compressor (free) and PDF toolkit
(premium: merge, split, rotate). It builds against
`@tracht-digital-solutions/tds-tools-contract` and is composed into `tds-tools-frontend`
at build time. Both tools run fully in the browser.

The platform rules (unique ids, package-subpath components, contract stability)
live in `tds-tools-contract-pkg/AGENTS.md`. Read that first.

## Commands

```bash
npm install --no-package-lock   # never npm ci; CI has no lockfile
npm run build                   # tsup, compiles src/index.ts only
npm run type-check              # tsc, covers src/** only
npm run test:run                # vitest
npm run lint:primitives         # fails on a control without a shared class
```

## Hard rules

- **Every push to `main` publishes a `@latest` patch** and rebuilds `tds-tools-frontend`.
  Don't bump the version by hand for a patch. A docs-only commit carries `[skip ci]`.
- Ship no CSS. Every control carries a shared `tds-shared` class.
- `component` in the manifest is a package subpath resolved via `exports`, never a relative path.
- Tool `id` and `slug` stay unique across all composed packs.
- This pack only **marks** `pdf-tools` as premium. The paywall lives in the site and in `tds-ext-tools-pkg`.
- Stay inside the `0.2.x` line. The site pins `^0.2.0`, so a minor bump needs a coordinated repin.
- The real gate for `islands/` and `tools/` is the `tds-tools-frontend` build, not `type-check` here.

## Topic files

| File | Read before |
|---|---|
| [docs/agents/architecture.md](docs/agents/architecture.md) | Changing the manifest, premium flags, layout or dependencies |
| [docs/agents/conventions.md](docs/agents/conventions.md) | Touching any markup or styling in `islands/` or `tools/` |
| [docs/agents/testing.md](docs/agents/testing.md) | Writing or changing tests, PDF or compression logic |

Workspace rules: `../CLAUDE.md`. Cross-repo state: `../MIGRATION-STATUS.md`.
