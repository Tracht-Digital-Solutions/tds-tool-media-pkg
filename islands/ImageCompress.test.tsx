// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImageCompress from "./ImageCompress";

/**
 * jsdom has no image decoder and no canvas, so both are stubbed — but only the
 * *plumbing*. What the tests assert is the tool's own behaviour: the resize
 * rule reaching the canvas, format and quality reaching `toBlob`, the target
 * size search, several files at once, the ZIP, and the readout. The pure
 * arithmetic has its own node suite in `compressCore.test.ts`.
 */

const user = () => userEvent.setup({ delay: null });

/** Bytes the stubbed encoder returns: a constant, or a function of the call. */
let encodedSize: number | ((quality: number, width: number, type: string) => number) = 40_000;
/** Types the stubbed canvas "cannot" write; it falls back to PNG like a real one. */
let unwritable = new Set<string>();
let lastToBlobArgs: [string, number] | null = null;
let lastCanvas: { width: number; height: number } | null = null;
let naturalSize = { width: 3200, height: 2400 };
let fills = 0;
/** Object URLs handed out and released during one test, with their blobs. */
let minted: string[] = [];
let blobs = new Map<string, Blob>();
let revoked: string[] = [];

class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 0;
  height = 0;
  #src = "";
  set src(value: string) {
    this.#src = value;
    this.width = naturalSize.width;
    this.height = naturalSize.height;
    // Decode is async in a real browser; keep that shape.
    setTimeout(() => this.onload?.(), 0);
  }
  get src() {
    return this.#src;
  }
}

beforeEach(() => {
  encodedSize = 40_000;
  unwritable = new Set();
  lastToBlobArgs = null;
  lastCanvas = null;
  naturalSize = { width: 3200, height: 2400 };
  fills = 0;

  vi.stubGlobal("Image", StubImage);
  // Unique per call, so a test can say WHICH url was released.
  minted = [];
  blobs = new Map();
  revoked = [];
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      const url = `blob:mock-${minted.length + 1}`;
      minted.push(url);
      blobs.set(url, blob);
      return url;
    }),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn((url: string) => {
      revoked.push(url);
    }),
  });

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        drawImage: vi.fn(),
        fillRect: vi.fn(() => {
          fills++;
        }),
        fillStyle: "",
      }) as unknown as CanvasRenderingContext2D,
  );
  vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
      type?: string,
      quality?: number,
    ) {
      const written = type && !unwritable.has(type) ? type : "image/png";
      // The mount-time format probe draws on a 1×1 canvas; keep it out of the record.
      if (this.width > 1) {
        lastCanvas = { width: this.width, height: this.height };
        lastToBlobArgs = [type ?? "", quality ?? -1];
      }
      const size = typeof encodedSize === "function" ? encodedSize(quality ?? 1, this.width, written) : encodedSize;
      cb(new Blob([new Uint8Array(size)], { type: written }));
    });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (URL as Partial<typeof URL>).createObjectURL;
  delete (URL as Partial<typeof URL>).revokeObjectURL;
});

const jpeg = (sizeBytes = 200_000, name = "foto.jpg", type = "image/jpeg") =>
  new File([new Uint8Array(sizeBytes)], name, { type });

/** Pick files and wait for the (stubbed) decode to finish. */
async function choose(files: File | File[] = jpeg(), lang?: "de" | "en") {
  render(<ImageCompress lang={lang} />);
  await user().upload(screen.getByLabelText(lang === "en" ? "Choose images" : "Bilder auswählen"), files);
  // The controls only appear once an image has "loaded".
  return screen.findByRole("button", { name: lang === "en" ? "Compress" : "Komprimieren" });
}

const compress = async () => user().click(screen.getByRole("button", { name: "Komprimieren" }));

const setNumber = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const setRange = (label: RegExp, value: number) => {
  const slider = screen.getAllByRole("slider").find((s) => label.test(s.closest("label")?.textContent ?? ""))!;
  fireEvent.change(slider, { target: { value: String(value) } });
};

describe("loading", () => {
  it("shows no controls until an image is chosen", () => {
    render(<ImageCompress />);
    expect(screen.queryByRole("button", { name: "Komprimieren" })).toBeNull();
  });

  it("accepts several files", () => {
    render(<ImageCompress />);
    expect((screen.getByLabelText("Bilder auswählen") as HTMLInputElement).multiple).toBe(true);
  });

  it("reveals the controls once the image has decoded", async () => {
    await choose();
    expect(screen.getByLabelText("Format")).toBeDefined();
  });

  it("reports an undecodable file, and only on that file", async () => {
    class BrokenImage extends StubImage {
      override set src(_v: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    vi.stubGlobal("Image", BrokenImage);

    render(<ImageCompress />);
    await user().upload(screen.getByLabelText("Bilder auswählen"), jpeg(10, "broken.heic", "image/heic"));

    expect(await screen.findByText(/Bild konnte nicht geladen werden/)).toBeDefined();
  });

  it("takes dropped files", async () => {
    render(<ImageCompress />);
    const zone = screen.getByLabelText("Bilder auswählen").closest(".tds-dropzone")!;
    fireEvent.drop(zone, { dataTransfer: { files: [jpeg(), jpeg(1000, "zwei.png", "image/png")] } });

    expect(await screen.findByText("foto.jpg")).toBeDefined();
    expect(screen.getByText("zwei.png")).toBeDefined();
  });

  it("ignores dropped files that are not images", async () => {
    render(<ImageCompress />);
    const zone = screen.getByLabelText("Bilder auswählen").closest(".tds-dropzone")!;
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "notiz.txt", { type: "text/plain" })] } });
    expect(screen.queryByText("notiz.txt")).toBeNull();
  });
});

describe("resizing", () => {
  it("scales a wide image down to the default width, preserving aspect ratio", async () => {
    await choose();
    await compress();
    // 3200 → 1600 (the default max), so height 2400 → 1200.
    await waitFor(() => expect(lastCanvas).toEqual({ width: 1600, height: 1200 }));
  });

  it("never upscales an image narrower than the limit", async () => {
    naturalSize = { width: 800, height: 600 };
    await choose();
    await compress();
    await waitFor(() => expect(lastCanvas).toEqual({ width: 800, height: 600 }));
  });

  it("honours a changed max width", async () => {
    naturalSize = { width: 4000, height: 2000 };
    await choose();
    setNumber("Max. Breite (px)", "800");
    await compress();
    await waitFor(() => expect(lastCanvas).toEqual({ width: 800, height: 400 }));
  });

  it("honours a max height on a portrait photo", async () => {
    naturalSize = { width: 3000, height: 4000 };
    await choose();
    setNumber("Max. Höhe (px)", "1000");
    await compress();
    await waitFor(() => expect(lastCanvas).toEqual({ width: 750, height: 1000 }));
  });

  it("keeps the full size when both limits are cleared", async () => {
    await choose();
    setNumber("Max. Breite (px)", "");
    await compress();
    await waitFor(() => expect(lastCanvas).toEqual({ width: 3200, height: 2400 }));
  });

  it("reports the output dimensions", async () => {
    await choose();
    await compress();
    expect(await screen.findByText(/1600×1200px/)).toBeDefined();
  });
});

describe("encoding", () => {
  it("encodes as JPEG at 80 % by default", async () => {
    await choose();
    await compress();
    await waitFor(() => expect(lastToBlobArgs).toEqual(["image/jpeg", 0.8]));
  });

  it("switches to WebP", async () => {
    await choose();
    await user().selectOptions(screen.getByLabelText("Format"), "image/webp");
    await compress();
    await waitFor(() => expect(lastToBlobArgs?.[0]).toBe("image/webp"));
  });

  it("keeps the input's format on 'Wie Original'", async () => {
    await choose(jpeg(200_000, "logo.png", "image/png"));
    await user().selectOptions(screen.getByLabelText("Format"), "original");
    await compress();
    await waitFor(() => expect(lastToBlobArgs?.[0]).toBe("image/png"));
  });

  it("passes the chosen quality through", async () => {
    await choose();
    setRange(/Qualität/, 0.4);
    await compress();
    await waitFor(() => expect(lastToBlobArgs?.[1]).toBeCloseTo(0.4, 5));
  });

  it("paints a white background under JPEG only", async () => {
    // A transparent PNG turned into JPEG would otherwise come out black.
    await choose(jpeg(200_000, "logo.png", "image/png"));
    await compress();
    await waitFor(() => expect(fills).toBeGreaterThan(0));

    fills = 0;
    await user().selectOptions(screen.getByLabelText("Format"), "image/png");
    await compress();
    await waitFor(() => expect(lastToBlobArgs?.[0]).toBe("image/png"));
    expect(fills).toBe(0);
  });

  it("names the download after the original and the chosen format", async () => {
    await choose(jpeg(200_000, "Urlaub.jpeg"));
    await user().selectOptions(screen.getByLabelText("Format"), "image/webp");
    await compress();

    const link = await screen.findByRole("link", { name: "Herunterladen" });
    expect(link.getAttribute("download")).toBe("Urlaub-komprimiert.webp");
  });

  it("reports a failed encode instead of hanging", async () => {
    await choose();
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb: BlobCallback) => cb(null));
    await compress();
    expect(await screen.findByText("Komprimierung fehlgeschlagen.")).toBeDefined();
  });

  it("offers AVIF only where the browser can write it", async () => {
    unwritable = new Set(["image/avif"]);
    await choose();
    const options = () => Array.from((screen.getByLabelText("Format") as HTMLSelectElement).options).map((o) => o.value);
    expect(options()).not.toContain("image/avif");
    cleanup();

    unwritable = new Set();
    await choose();
    await waitFor(() => expect(options()).toContain("image/avif"));
  });

  it("says so when the browser silently writes another format", async () => {
    await choose();
    await user().selectOptions(screen.getByLabelText("Format"), "image/webp");
    unwritable = new Set(["image/webp"]);
    await compress();
    expect(await screen.findByText(/kann das gewählte Format nicht schreiben/)).toBeDefined();
  });
});

describe("target size", () => {
  it("lowers the quality until the file fits", async () => {
    // 1 MB at quality 1; the target of 300 KB needs quality ≤ 0.3 … 0.8.
    encodedSize = (q) => Math.round(1_000_000 * q);
    await choose(jpeg(2_000_000));
    setNumber("Zielgröße (KB)", "500");
    await compress();

    const line = await screen.findByText(/→/, { selector: "li p" });
    expect(line.textContent).toMatch(/kleiner/);
    const link = await screen.findByRole("link", { name: "Herunterladen" });
    expect(blobs.get(link.getAttribute("href")!)!.size).toBeLessThanOrEqual(500 * 1024);
    expect(lastToBlobArgs![1]).toBeLessThan(0.8);
  });

  it("warns when the target cannot be reached", async () => {
    encodedSize = 5_000_000;
    await choose(jpeg(9_000_000));
    setNumber("Zielgröße (KB)", "10");
    await compress();
    expect(await screen.findByText(/Zielgröße nicht ganz erreicht/)).toBeDefined();
  });

  it("applies a preset's target and limits", async () => {
    await choose();
    await user().click(screen.getByRole("button", { name: "E-Mail" }));
    expect(screen.getByRole("button", { name: "E-Mail" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Zielgröße (KB)") as HTMLInputElement).value).toBe("300");
    expect((screen.getByLabelText("Max. Breite (px)") as HTMLInputElement).value).toBe("1280");
  });
});

describe("several images", () => {
  it("compresses every file and totals the saving", async () => {
    encodedSize = 50_000;
    await choose([jpeg(200_000, "a.jpg"), jpeg(200_000, "b.jpg")]);
    await compress();

    expect(await screen.findAllByRole("link", { name: "Herunterladen" })).toHaveLength(2);
    // 400 KB → 100 KB.
    expect(screen.getByText(/2 Bilder: .* \(75% kleiner\)/)).toBeDefined();
  });

  it("downloads all results as one ZIP", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await choose([jpeg(200_000, "a.jpg"), jpeg(200_000, "a.jpg")]);
    await compress();

    await user().click(await screen.findByRole("button", { name: "Alle 2 als ZIP herunterladen" }));
    await waitFor(() => expect(click).toHaveBeenCalled());

    const zip = [...blobs.values()].find((b) => b.type === "application/zip")!;
    const text = new TextDecoder().decode(new Uint8Array(await zip.arrayBuffer()));
    // Two identical names must not overwrite each other on extraction.
    expect(text).toContain("a-komprimiert.jpg");
    expect(text).toContain("a-komprimiert-2.jpg");
  });

  it("removes a single file", async () => {
    await choose([jpeg(200_000, "a.jpg"), jpeg(200_000, "b.jpg")]);
    await user().click(screen.getByRole("button", { name: "a.jpg entfernen" }));
    expect(screen.queryByText("a.jpg")).toBeNull();
    expect(screen.getByText("b.jpg")).toBeDefined();
  });
});

describe("size readout", () => {
  it("shows the saving as a percentage", async () => {
    encodedSize = 50_000;
    await choose(jpeg(200_000));
    await compress();
    expect(await screen.findByText(/75% kleiner/, { selector: "li span" })).toBeDefined();
  });

  it("formats sizes with a German decimal mark", async () => {
    encodedSize = 900;
    await choose(jpeg(3 * 1024 * 1024));
    await compress();

    const line = await screen.findByText(/→/, { selector: "li p" });
    expect(line.textContent).toContain("3,00 MB");
    expect(line.textContent).toContain("900 B");
  });

  it("flags a file that got bigger after resizing or converting", async () => {
    // Re-encoding a small PNG as JPEG can grow it; claiming a saving would lie.
    encodedSize = 300_000;
    await choose(jpeg(100_000, "grafik.png", "image/png"));
    await compress();

    await screen.findByRole("link", { name: "Herunterladen" });
    expect(screen.queryByText(/kleiner/)).toBeNull();
    expect(screen.getByText(/200% größer/)).toBeDefined();
  });

  it("keeps the original when re-encoding the same format at the same size would grow it", async () => {
    naturalSize = { width: 800, height: 600 };
    encodedSize = 40_000;
    await choose(jpeg(10_000, "klein.jpg"));
    await compress();

    expect(await screen.findByText(/Original war bereits kleiner/)).toBeDefined();
    const link = screen.getByRole("link", { name: "Herunterladen" });
    expect(blobs.get(link.getAttribute("href")!)!.size).toBe(10_000);
  });
});

/**
 * The English branch. Every case above renders without props and so doubles
 * as the regression test for the German default.
 */
describe("in English", () => {
  it("translates the file picker", () => {
    render(<ImageCompress lang="en" />);
    expect(screen.getByLabelText(/Choose images/)).toBeDefined();
    expect(screen.queryByLabelText(/Bilder auswählen/)).toBeNull();
  });

  it("states the local-processing promise in English", () => {
    // This sentence IS the tool's selling point against the upload-based
    // competitors, so it must not silently stay German on an English page.
    render(<ImageCompress lang="en" />);
    expect(screen.getByText(/never uploaded/)).toBeDefined();
  });

  it("names downloads in English", async () => {
    await choose(jpeg(200_000, "photo.jpg"), "en");
    await user().click(screen.getByRole("button", { name: "Compress" }));
    const link = await screen.findByRole("link", { name: "Download" });
    expect(link.getAttribute("download")).toBe("photo-compressed.jpg");
  });
});

/**
 * Object URLs are a manual resource.
 *
 * `URL.createObjectURL` pins its Blob to the DOCUMENT, not to the component, so
 * losing the last JS reference frees nothing. There is no error, no warning and
 * no visible symptom — only a tab that grows — which is why it needs a test
 * rather than a review.
 */
describe("object URL lifetime", () => {
  it("releases the previous result when compressing again", async () => {
    await choose();
    await compress();
    const first = (await screen.findByRole("link", { name: "Herunterladen" })).getAttribute("href")!;

    await compress();
    await waitFor(() => expect(revoked).toContain(first));
  });

  it("releases a removed file's urls", async () => {
    await choose();
    await compress();
    await screen.findByRole("link", { name: "Herunterladen" });
    const before = [...minted];

    await user().click(screen.getByRole("button", { name: "foto.jpg entfernen" }));
    for (const url of before) expect(revoked).toContain(url);
  });

  it("releases everything on unmount", async () => {
    // An Astro island is torn down on navigation, which is the common case:
    // without this the leak simply outlives the page that caused it.
    const view = render(<ImageCompress />);
    await user().upload(screen.getByLabelText("Bilder auswählen"), [jpeg(), jpeg(1000, "b.jpg")]);
    await screen.findByRole("button", { name: "Komprimieren" });
    await compress();
    await screen.findAllByRole("link", { name: "Herunterladen" });

    view.unmount();
    for (const url of minted) expect(revoked).toContain(url);
  });
});
