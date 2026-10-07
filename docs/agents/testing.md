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

- Canvas is stubbed (jsdom has no 2D context). Assertions cover the arithmetic the tool
  owns: the resize rule, the never-upscale clamp, and the format and quality passed to
  `toBlob`.

## Setup

- `test-setup.ts` shims `Blob.arrayBuffer`. jsdom 25 doesn't implement it, and both
  islands read the chosen file with it. Without the shim every test fails with
  `f.arrayBuffer is not a function`. This is a test-DOM gap, not a tool bug.

## Premium fields

Checked both ways: nothing free may carry a price, nothing premium may lack one.
Dropping `premiumDefault` from the PDF tool fails the suite; otherwise a paid tool
silently becomes free.
