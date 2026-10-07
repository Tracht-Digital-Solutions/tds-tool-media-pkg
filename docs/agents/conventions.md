# Markup and styling conventions

The tools site renders the `blog` surface in its flat variant (`data-flat`). A surface
layer only sets tokens. Tokens reach an element through shared classes.

## Every control carries a shared class

- This pack ships **no CSS**. Use `btn` / `chip` / `field-boxed` / `tds-card`.
- A `<button>` without `btn` has no padding, no radius and no 44px touch target.
  An `<input>` without `field-boxed` renders **invisible**, because Tailwind preflight
  zeroes borders.
- `npm run lint:primitives` runs in CI and fails on a bare control. The script is a
  byte-identical copy of the seed in `tds-ext-template-pkg`; change it there.
  It walks each tag tracking quotes and brace depth and resolves a local `const` to its
  string, so attribute order and constant names don't matter.

## Radii and lines

- Never hand-author a radius. Don't use `rounded-[var(--tds-radius-*)]` either: Tailwind
  doesn't generate arbitrary values from a package inside `node_modules`, so it ships as
  no rule at all. Use the shared class.
- **Don't draw a line.** The site is borderless (`data-flat` sets
  `--tds-border-hairline` to 0). Separate by fill, tone and spacing. `lint-primitives`
  and the build don't catch a `border-*`; check the rendered page at 1280 and 375 px
  and count `borderWidth > 0`.
## Status and feedback

- `status-pill` is a one-word label, not a message. It has `white-space: nowrap` and
  uppercase, so a long message widens the document past the viewport. `body {
  overflow-x: hidden }` hides that; only `document.documentElement.scrollWidth` shows it.
  Use `tds-alert` (`--success` / `--warning` / `--danger`) for a multi-line message.
- `tds-appear` belongs to `tds-shared` (≥ 0.38.8). It fades a result in when the
  element is **inserted**, with no script, which is the only motion a public tool may
  carry. An element that only changes its text doesn't re-animate, so a permanent
  output box needs a `key` on the value.
