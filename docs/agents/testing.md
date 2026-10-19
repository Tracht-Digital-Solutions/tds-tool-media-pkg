# Testing

`npm run test:run` runs vitest. Islands opt into jsdom with a `@vitest-environment`
docblock. The manifest suite runs in node.

## PDF tools

- **`pdf-lib` runs for real.** `PdfTools.test.tsx` builds genuine PDFs, runs
  merge/split/rotate and loads the output back to assert page count, order and rotation.
- Only `URL.createObjectURL` and the anchor click are stubbed. `createObjectURL` doubles
  as the capture point for the produced bytes.
- Rotation must **accumulate** onto the existing page angle and wrap at 360°. Both
  directions are pinned; replacing instead of adding fails two tests.

## Image compressor

- `compressCore.test.ts` runs in node: fit rule, target-size search, names, ZIP bytes.
- In the island suite canvas is stubbed (jsdom has no 2D context). The stub's `toBlob`
  falls back to PNG for types listed in `unwritable`, like a real browser, and its size
  can be a function of quality, which is how the target-size search is driven.
- The mount-time format probe draws on a 1×1 canvas; the stub ignores those calls when
  recording the last encode.

## Setup

- `test-setup.ts` holds no shim today (jsdom 30 implements `Blob.arrayBuffer`); it stays as the one place
  for the next environment gap, guarded so it never overwrites a real implementation.

## Premium fields

Checked both ways: nothing free may carry a price, nothing premium may lack one.
Dropping `premiumDefault` from the PDF tool fails the suite; otherwise a paid tool
silently becomes free.
