/**
 * The image compressor's arithmetic, kept apart from the island so it can be
 * tested without a DOM: the resize rule, the target-size search, file naming
 * and the ZIP container for "download all".
 *
 * Nothing here touches a canvas. The island passes an `encode` callback, which
 * keeps the search testable with a fake encoder whose output size is a plain
 * function of scale and quality.
 */

/** Output formats the tool offers. `original` keeps the input's own type. */
export type OutputFormat = "image/jpeg" | "image/webp" | "image/png" | "image/avif" | "original";

/** Formats a canvas can write. PNG is lossless; the quality argument is ignored there. */
export type EncodableMime = Exclude<OutputFormat, "original">;

const ENCODABLE: readonly EncodableMime[] = ["image/jpeg", "image/webp", "image/png", "image/avif"];

/**
 * The type to encode to. `original` maps a JPG to JPG and a PNG to PNG; an
 * input the canvas cannot write back (GIF, BMP, HEIC on Safari) becomes JPEG.
 */
export function resolveMime(format: OutputFormat, inputType: string): EncodableMime {
  if (format !== "original") return format;
  const t = inputType === "image/jpg" ? "image/jpeg" : inputType;
  return (ENCODABLE as readonly string[]).includes(t) ? (t as EncodableMime) : "image/jpeg";
}

/** PNG has no quality knob — only fewer pixels make it smaller. */
export function isLossy(mime: EncodableMime): boolean {
  return mime !== "image/png";
}

/** File extension for a written type. */
export function extensionFor(mime: EncodableMime): string {
  switch (mime) {
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    case "image/avif":
      return "avif";
    default:
      return "jpg";
  }
}

/**
 * Output dimensions: fit inside `maxWidth` × `maxHeight`, keep the aspect
 * ratio, never upscale, never collapse an edge to zero.
 *
 * `null` or a non-positive bound means "no limit on that edge". The clamp to 1
 * is the branch that matters: inverting it stretches an 800 px image to
 * 1600 px, which makes it bigger AND blurrier.
 */
export function fitDimensions(
  width: number,
  height: number,
  maxWidth: number | null,
  maxHeight: number | null,
): { width: number; height: number; scale: number } {
  const limits = [1];
  if (maxWidth && maxWidth > 0 && width > 0) limits.push(maxWidth / width);
  if (maxHeight && maxHeight > 0 && height > 0) limits.push(maxHeight / height);
  const scale = Math.min(...limits);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/** Encodes at a relative scale (1 = the fitted size) and a quality in 0–1. */
export type Encoder = (scale: number, quality: number) => Promise<Blob | null>;

export interface TargetResult {
  blob: Blob;
  /** Relative scale finally used; below 1 when quality alone was not enough. */
  scale: number;
  quality: number;
  /** False when even the smallest attempt stayed above the target. */
  reached: boolean;
}

/** The lowest quality the search will go to. Below it a photo turns to blocks. */
export const MIN_QUALITY = 0.3;
/** Each downscale step keeps this share of the edge length. */
const SCALE_STEP = 0.85;
const MAX_SCALE_STEPS = 8;
const QUALITY_ITERATIONS = 7;

/**
 * Encode with no target: one pass at the chosen quality.
 */
export async function encodeOnce(encode: Encoder, quality: number): Promise<TargetResult> {
  const blob = await encode(1, quality);
  if (!blob) throw new Error("encode");
  return { blob, scale: 1, quality, reached: true };
}

/**
 * Encode to at most `targetBytes`.
 *
 * Quality first: a binary search between {@link MIN_QUALITY} and the user's
 * chosen quality (the ceiling — a target never makes an image *better* than
 * asked). Only when the floor still does not fit does it start dropping
 * pixels, 15 % of the edge per step, because a smaller sharp image beats a
 * full-size smeared one. A lossless format skips straight to the pixels.
 *
 * Returns the best attempt with `reached: false` rather than throwing when the
 * target is out of reach — the user still gets the smallest file there was.
 */
export async function encodeToTarget(
  encode: Encoder,
  opts: { targetBytes: number; maxQuality: number; lossy: boolean },
): Promise<TargetResult> {
  const { targetBytes, maxQuality, lossy } = opts;
  let best: TargetResult | null = null;
  let scale = 1;

  for (let step = 0; step <= MAX_SCALE_STEPS; step++) {
    const top = await encode(scale, maxQuality);
    if (!top) throw new Error("encode");
    if (top.size <= targetBytes) return { blob: top, scale, quality: maxQuality, reached: true };
    if (!best || top.size < best.blob.size) best = { blob: top, scale, quality: maxQuality, reached: false };

    if (lossy && maxQuality > MIN_QUALITY) {
      const floor = await encode(scale, MIN_QUALITY);
      if (!floor) throw new Error("encode");
      if (floor.size < best.blob.size) best = { blob: floor, scale, quality: MIN_QUALITY, reached: false };
      if (floor.size <= targetBytes) {
        // The target lies between floor and ceiling: find the highest quality that fits.
        let lo = MIN_QUALITY;
        let hi = maxQuality;
        let fit: TargetResult = { blob: floor, scale, quality: MIN_QUALITY, reached: true };
        for (let i = 0; i < QUALITY_ITERATIONS; i++) {
          const mid = (lo + hi) / 2;
          const blob = await encode(scale, mid);
          if (!blob) throw new Error("encode");
          if (blob.size <= targetBytes) {
            fit = { blob, scale, quality: mid, reached: true };
            lo = mid;
          } else {
            hi = mid;
          }
        }
        return fit;
      }
    }
    scale *= SCALE_STEP;
  }
  return best!;
}

/** Human file size, German or English decimal mark. */
export function formatSize(bytes: number, lang: "de" | "en" = "de"): string {
  const num = (n: number, digits: number) =>
    n.toLocaleString(lang === "de" ? "de-DE" : "en-GB", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${num(bytes / 1024, 1)} KB`;
  return `${num(bytes / (1024 * 1024), 2)} MB`;
}

/** Saving in whole percent; negative when the file grew. */
export function savingPercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round((1 - after / before) * 100);
}

/**
 * Download name: the original's base name plus a suffix and the new extension
 * — `urlaub.jpeg` → `urlaub-komprimiert.webp`. A file called just `.jpg`, or
 * one with characters a file system rejects, still yields something savable.
 */
export function outputName(original: string, suffix: string, ext: string): string {
  const dot = original.lastIndexOf(".");
  const base = (dot > 0 ? original.slice(0, dot) : original)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim();
  return `${base || "bild"}-${suffix}.${ext}`;
}

/**
 * Make names unique within one ZIP. Two `IMG_0001.jpg` from different folders
 * are common; the second would silently overwrite the first on extraction.
 */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf(".");
    const candidate = dot > 0 ? `${name.slice(0, dot)}-${count + 1}${name.slice(dot)}` : `${name}-${count + 1}`;
    seen.set(candidate.toLowerCase(), 1);
    return candidate;
  });
}

let crcTable: Uint32Array | null = null;

/** CRC-32 (IEEE), as the ZIP format requires for every entry. */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A ZIP archive with every entry STORED (no deflate).
 *
 * The entries are JPEG/WebP/PNG/AVIF — already compressed, so deflating them
 * again saves next to nothing and would need a dependency. Names are UTF-8
 * (general-purpose flag bit 11), so "Prüfbericht-komprimiert.jpg" survives.
 * Sizes are 32-bit: the island never gets near 4 GB in a browser tab.
 */
export function createZip(entries: { name: string; data: Uint8Array }[], date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + size;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
