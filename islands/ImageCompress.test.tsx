// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImageCompress from "./ImageCompress";

/**
 * jsdom has no image decoder and no canvas, so both are stubbed — but only the
 * *plumbing*. What the tests actually assert is the tool's own arithmetic:
 *
 *  - the resize rule, including the "never upscale a small image" branch, which
 *    is the one that silently ruins quality if it inverts,
 *  - that the chosen format and quality reach `toBlob`,
 *  - the size/percentage readout, which is the only feedback the user gets.
 */

const user = () => userEvent.setup({ delay: null });

/** Bytes the stubbed encoder should return for the next compression. */
let encodedSize = 40_000;
let lastToBlobArgs: [string, number] | null = null;
let lastCanvas: { width: number; height: number } | null = null;
let naturalSize = { width: 3200, height: 2400 };

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
  lastToBlobArgs = null;
  lastCanvas = null;
  naturalSize = { width: 3200, height: 2400 };

  vi.stubGlobal("Image", StubImage);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:mock"),
  });

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
  );
  vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
      type?: string,
      quality?: number,
    ) {
      lastCanvas = { width: this.width, height: this.height };
      lastToBlobArgs = [type ?? "", quality ?? -1];
      cb(new Blob([new Uint8Array(encodedSize)], { type }));
    });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (URL as Partial<typeof URL>).createObjectURL;
});

/** Pick a file and wait for the (stubbed) decode to finish. */
async function choose(sizeBytes = 200_000, name = "foto.jpg") {
  render(<ImageCompress />);
  const file = new File([new Uint8Array(sizeBytes)], name, { type: "image/jpeg" });
  await user().upload(screen.getByLabelText("Bild auswählen"), file);
  // The controls only appear once the image has "loaded".
  return screen.findByRole("button", { name: "Komprimieren" });
}

const setRange = async (label: RegExp, value: number) => {
  const slider = screen.getAllByRole("slider").find((s) => {
    const text = s.closest("label")?.textContent ?? "";
    return label.test(text);
  })!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(slider, String(value));
  slider.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("loading", () => {
  it("shows no controls until an image is chosen", () => {
    render(<ImageCompress />);
    expect(screen.queryByRole("button", { name: "Komprimieren" })).toBeNull();
  });

  it("reveals the controls once the image has decoded", async () => {
    await choose();
    expect(screen.getByLabelText("Format")).toBeDefined();
  });

  it("reports an undecodable file", async () => {
    class BrokenImage extends StubImage {
      override set src(_v: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    vi.stubGlobal("Image", BrokenImage);

    render(<ImageCompress />);
    await user().upload(
      screen.getByLabelText("Bild auswählen"),
      new File([new Uint8Array(10)], "broken.jpg", { type: "image/jpeg" }),
    );

    expect(await screen.findByText("Bild konnte nicht geladen werden.")).toBeDefined();
  });
});

describe("resizing", () => {
  it("scales a wide image down to the target width, preserving aspect ratio", async () => {
    naturalSize = { width: 3200, height: 2400 };
    await choose();
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    // 3200 → 1600 (the default max), so height 2400 → 1200.
    await waitFor(() => expect(lastCanvas).toEqual({ width: 1600, height: 1200 }));
  });

  it("never upscales an image narrower than the target", async () => {
    // The branch that matters: scale must clamp to 1, not stretch 800 → 1600.
    naturalSize = { width: 800, height: 600 };
    await choose();
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    await waitFor(() => expect(lastCanvas).toEqual({ width: 800, height: 600 }));
  });

  it("honours a changed max width", async () => {
    naturalSize = { width: 4000, height: 2000 };
    await choose();
    await setRange(/Max\. Breite/, 800);
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    await waitFor(() => expect(lastCanvas).toEqual({ width: 800, height: 400 }));
  });

  it("keeps at least one pixel for an extreme aspect ratio", async () => {
    naturalSize = { width: 4000, height: 1 };
    await choose();
    await setRange(/Max\. Breite/, 320);
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    // 1 * 0.08 rounds to 0; a zero-height canvas would throw.
    await waitFor(() => expect(lastCanvas?.height).toBe(1));
  });

  it("reports the output dimensions to the user", async () => {
    naturalSize = { width: 3200, height: 2400 };
    await choose();
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    expect(await screen.findByText(/1600×1200px/)).toBeDefined();
  });
});

describe("encoding", () => {
  it("encodes as JPEG at the default quality", async () => {
    await choose();
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    await waitFor(() => expect(lastToBlobArgs).toEqual(["image/jpeg", 0.75]));
  });

  it("switches to WebP", async () => {
    await choose();
    await user().selectOptions(screen.getByLabelText("Format"), "image/webp");
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    await waitFor(() => expect(lastToBlobArgs?.[0]).toBe("image/webp"));
  });

  it("passes the chosen quality through", async () => {
    await choose();
    await setRange(/Qualität/, 0.4);
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    await waitFor(() => expect(lastToBlobArgs?.[1]).toBeCloseTo(0.4, 5));
  });

  it("names the download after the chosen format", async () => {
    await choose();
    await user().selectOptions(screen.getByLabelText("Format"), "image/webp");
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    const link = await screen.findByRole("link", { name: "Herunterladen" });
    expect(link.getAttribute("download")).toBe("komprimiert.webp");
  });

  it("reports a failed encode instead of hanging", async () => {
    vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((cb: BlobCallback) => cb(null));

    await choose();
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    expect(await screen.findByText("Komprimierung fehlgeschlagen.")).toBeDefined();
  });
});

describe("size readout", () => {
  it("shows the saving as a percentage", async () => {
    encodedSize = 50_000;
    await choose(200_000);
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    // 200 KB → 50 KB is a 75% reduction.
    expect(await screen.findByText(/75% kleiner/)).toBeDefined();
  });

  it("formats bytes, kilobytes and megabytes distinctly", async () => {
    encodedSize = 900; // bytes
    await choose(3 * 1024 * 1024); // 3 MB original
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    const line = await screen.findByText(/→/);
    expect(line.textContent).toContain("3.00 MB");
    expect(line.textContent).toContain("900 B");
  });

  it("omits the saving badge when the file got bigger", async () => {
    // Re-encoding a small PNG as JPEG can grow it; claiming a saving would lie.
    encodedSize = 300_000;
    await choose(100_000);
    await user().click(screen.getByRole("button", { name: "Komprimieren" }));

    await screen.findByRole("link", { name: "Herunterladen" });
    expect(screen.queryByText(/kleiner/)).toBeNull();
  });
});
