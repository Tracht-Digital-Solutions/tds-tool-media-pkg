import { describe, expect, it } from "vitest";
import {
  MIN_QUALITY,
  crc32,
  createZip,
  encodeToTarget,
  extensionFor,
  fitDimensions,
  formatSize,
  outputName,
  resolveMime,
  savingPercent,
  uniqueNames,
  type Encoder,
} from "./compressCore";

/**
 * The compressor's arithmetic without a DOM. The island tests cover the
 * wiring; these cover the rules the wiring relies on.
 */

describe("fitDimensions", () => {
  it("fits inside the width limit, keeping the aspect ratio", () => {
    expect(fitDimensions(3200, 2400, 1600, null)).toMatchObject({ width: 1600, height: 1200 });
  });

  it("applies whichever limit is tighter", () => {
    // Portrait: the height bound wins.
    expect(fitDimensions(3000, 4000, 1600, 1200)).toMatchObject({ width: 900, height: 1200 });
  });

  it("never upscales", () => {
    expect(fitDimensions(800, 600, 1600, 1600)).toEqual({ width: 800, height: 600, scale: 1 });
  });

  it("treats a missing or non-positive limit as no limit", () => {
    expect(fitDimensions(5000, 3000, null, 0)).toMatchObject({ width: 5000, height: 3000 });
  });

  it("keeps at least one pixel on an extreme aspect ratio", () => {
    expect(fitDimensions(4000, 1, 320, null).height).toBe(1);
  });
});

describe("formats", () => {
  it("maps 'original' to the input type when a canvas can write it", () => {
    expect(resolveMime("original", "image/png")).toBe("image/png");
    expect(resolveMime("original", "image/jpg")).toBe("image/jpeg");
    expect(resolveMime("original", "image/webp")).toBe("image/webp");
  });

  it("falls back to JPEG for inputs a canvas cannot write", () => {
    expect(resolveMime("original", "image/gif")).toBe("image/jpeg");
    expect(resolveMime("original", "image/heic")).toBe("image/jpeg");
    expect(resolveMime("original", "")).toBe("image/jpeg");
  });

  it("keeps an explicit choice", () => {
    expect(resolveMime("image/avif", "image/png")).toBe("image/avif");
  });

  it("names the extension after the written type", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/avif")).toBe("avif");
  });
});

describe("encodeToTarget", () => {
  /** A fake encoder: bytes grow with pixel count and quality. */
  const fake = (base: number) => {
    const calls: [number, number][] = [];
    const encode: Encoder = async (scale, quality) => {
      calls.push([scale, quality]);
      return new Blob([new Uint8Array(Math.round(base * scale * scale * quality))]);
    };
    return { encode, calls };
  };

  it("returns the first attempt when it already fits", async () => {
    const { encode, calls } = fake(100_000);
    const r = await encodeToTarget(encode, { targetBytes: 200_000, maxQuality: 0.8, lossy: true });
    expect(r).toMatchObject({ scale: 1, quality: 0.8, reached: true });
    expect(calls).toHaveLength(1);
  });

  it("lowers quality, not pixels, when quality alone is enough", async () => {
    const { encode } = fake(1_000_000);
    // 0.8 → 800 KB; the target of 500 KB lies above the floor (300 KB).
    const r = await encodeToTarget(encode, { targetBytes: 500_000, maxQuality: 0.8, lossy: true });
    expect(r.reached).toBe(true);
    expect(r.scale).toBe(1);
    expect(r.blob.size).toBeLessThanOrEqual(500_000);
    // The search finds the highest quality that fits, not merely one that fits.
    expect(r.quality).toBeGreaterThan(0.45);
    expect(r.quality).toBeLessThanOrEqual(0.5);
  });

  it("never raises quality above the user's choice", async () => {
    const { encode, calls } = fake(1_000_000);
    await encodeToTarget(encode, { targetBytes: 500_000, maxQuality: 0.7, lossy: true });
    for (const [, q] of calls) expect(q).toBeLessThanOrEqual(0.7);
  });

  it("drops pixels once the quality floor is not enough", async () => {
    const { encode } = fake(1_000_000);
    // Floor at full size is 300 KB; 100 KB needs a smaller image.
    const r = await encodeToTarget(encode, { targetBytes: 100_000, maxQuality: 0.8, lossy: true });
    expect(r.reached).toBe(true);
    expect(r.scale).toBeLessThan(1);
    expect(r.blob.size).toBeLessThanOrEqual(100_000);
  });

  it("only drops pixels for a lossless format", async () => {
    const { encode, calls } = fake(1_000_000);
    const r = await encodeToTarget(encode, { targetBytes: 400_000, maxQuality: 1, lossy: false });
    expect(r.reached).toBe(true);
    expect(new Set(calls.map(([, q]) => q))).toEqual(new Set([1]));
  });

  it("returns the smallest attempt when the target is out of reach", async () => {
    const { encode } = fake(1_000_000_000);
    const r = await encodeToTarget(encode, { targetBytes: 10, maxQuality: 0.8, lossy: true });
    expect(r.reached).toBe(false);
    expect(r.quality).toBe(MIN_QUALITY);
  });

  it("surfaces a failed encode", async () => {
    await expect(
      encodeToTarget(async () => null, { targetBytes: 10, maxQuality: 0.8, lossy: true }),
    ).rejects.toThrow();
  });
});

describe("readout", () => {
  it("formats bytes, kilobytes and megabytes with the page's decimal mark", () => {
    expect(formatSize(900)).toBe("900 B");
    expect(formatSize(1536, "de")).toBe("1,5 KB");
    expect(formatSize(1536, "en")).toBe("1.5 KB");
    expect(formatSize(3 * 1024 * 1024, "de")).toBe("3,00 MB");
  });

  it("reports savings as whole percent, negative when the file grew", () => {
    expect(savingPercent(200_000, 50_000)).toBe(75);
    expect(savingPercent(100_000, 300_000)).toBe(-200);
    expect(savingPercent(0, 10)).toBe(0);
  });
});

describe("file names", () => {
  it("keeps the base name and swaps the extension", () => {
    expect(outputName("Urlaub 2026.jpeg", "komprimiert", "webp")).toBe("Urlaub 2026-komprimiert.webp");
  });

  it("survives names without a base or with forbidden characters", () => {
    expect(outputName(".jpg", "komprimiert", "jpg")).toBe(".jpg-komprimiert.jpg");
    expect(outputName('a:b?"c.png', "x", "png")).toBe("a_b__c-x.png");
    expect(outputName("", "x", "png")).toBe("bild-x.png");
  });

  it("numbers duplicates instead of letting one overwrite another in the ZIP", () => {
    expect(uniqueNames(["a.jpg", "b.jpg", "A.jpg", "a.jpg"])).toEqual(["a.jpg", "b.jpg", "A-2.jpg", "a-3.jpg"]);
  });
});

describe("ZIP container", () => {
  it("computes the standard CRC-32 check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes a well-formed stored archive with UTF-8 names", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([9, 8, 7, 6]);
    const zip = createZip([
      { name: "Prüfbericht.jpg", data: a },
      { name: "b.png", data: b },
    ]);
    const view = new DataView(zip.buffer);

    // End of central directory: two entries, and the offset it names is real.
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    const cdOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);

    // First local header: stored, UTF-8 flag, sizes and CRC match the data.
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(14, true)).toBe(crc32(a));
    expect(view.getUint32(18, true)).toBe(3);
    const nameLen = view.getUint16(26, true);
    expect(new TextDecoder().decode(zip.slice(30, 30 + nameLen))).toBe("Prüfbericht.jpg");
    expect([...zip.slice(30 + nameLen, 30 + nameLen + 3)]).toEqual([1, 2, 3]);

    // The second entry's central record points at its local header.
    const secondCd = cdOffset + 46 + nameLen;
    const secondLocal = view.getUint32(secondCd + 42, true);
    expect(secondLocal).toBe(30 + nameLen + 3);
    expect(view.getUint32(secondLocal, true)).toBe(0x04034b50);
  });
});
