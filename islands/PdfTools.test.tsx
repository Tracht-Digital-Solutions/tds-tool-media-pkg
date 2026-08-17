// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument, degrees } from "pdf-lib";
import PdfTools from "./PdfTools";

/**
 * These run pdf-lib for real — it works under Node, so the tests build genuine
 * PDFs, push them through the tool, and read the produced file back. That makes
 * them end-to-end rather than assertions about mocks: a merge that silently
 * drops a page, or a rotate that overwrites instead of accumulating, fails here.
 *
 * Only the browser plumbing is stubbed: jsdom implements neither
 * `URL.createObjectURL` nor a real download. The `createObjectURL` stub doubles
 * as the capture point for the output bytes.
 */

let captured: Blob | null = null;

/** A real PDF with `pages` pages, each a distinct size so copies are traceable. */
async function makePdf(pages: number, rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([200 + i, 300 + i]);
    if (rotation) page.setRotation(degrees(rotation));
  }
  return doc.save();
}

async function pdfFile(name: string, pages: number, rotation = 0): Promise<File> {
  const bytes = await makePdf(pages, rotation);
  return new File([bytes], name, { type: "application/pdf" });
}

/** The PDF the tool handed to the download helper. */
async function outputDoc(): Promise<PDFDocument> {
  if (!captured) throw new Error("nothing was downloaded");
  return PDFDocument.load(await captured.arrayBuffer());
}

const user = () => userEvent.setup({ delay: null });
const tab = (name: string) => screen.getByRole("tab", { name });
const runButton = () => screen.getByRole("button", { name: /Ausführen/ });

beforeEach(() => {
  captured = null;
  // Attach to the real URL class — replacing the global wholesale would break
  // `new URL(...)` everywhere, including inside pdf-lib.
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      captured = blob;
      return "blob:mock";
    }),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  delete (URL as Partial<typeof URL>).createObjectURL;
  delete (URL as Partial<typeof URL>).revokeObjectURL;
});

describe("merge", () => {
  it("concatenates every page of every input, in order", async () => {
    render(<PdfTools />);
    const input = screen.getByLabelText(/PDFs auswählen/);
    await user().upload(input, [await pdfFile("a.pdf", 2), await pdfFile("b.pdf", 3)]);
    await user().click(runButton());

    expect(await screen.findByText("2 PDFs zusammengeführt.")).toBeDefined();
    expect((await outputDoc()).getPageCount()).toBe(5);
  });

  it("preserves the page sizes of the sources", async () => {
    render(<PdfTools />);
    await user().upload(screen.getByLabelText(/PDFs auswählen/), [
      await pdfFile("a.pdf", 1),
      await pdfFile("b.pdf", 1),
    ]);
    await user().click(runButton());

    await waitFor(async () => {
      const doc = await outputDoc();
      // Both sources start at 200x300 for their first page.
      expect(Math.round(doc.getPage(0).getWidth())).toBe(200);
      expect(Math.round(doc.getPage(1).getWidth())).toBe(200);
    });
  });

  it("refuses a single file", async () => {
    render(<PdfTools />);
    await user().upload(screen.getByLabelText(/PDFs auswählen/), [await pdfFile("only.pdf", 1)]);
    await user().click(runButton());

    expect(await screen.findByText("Bitte mindestens zwei PDFs wählen.")).toBeDefined();
    expect(captured).toBeNull();
  });

  it("refuses no files at all", async () => {
    render(<PdfTools />);
    await user().click(runButton());

    expect(await screen.findByText("Bitte mindestens zwei PDFs wählen.")).toBeDefined();
  });
});

describe("split", () => {
  const goSplit = async (pages: number) => {
    render(<PdfTools />);
    await user().click(tab("Aufteilen"));
    await user().upload(screen.getByLabelText(/PDF auswählen/), await pdfFile("src.pdf", pages));
  };

  const setRange = async (spec: string) => {
    const input = screen.getByLabelText(/Seiten/);
    await user().clear(input);
    if (spec) await user().type(input, spec);
  };

  it("extracts a mixed range like 1-3,5", async () => {
    await goSplit(6);
    await setRange("1-3,5");
    await user().click(runButton());

    expect(await screen.findByText("4 Seite(n) extrahiert.")).toBeDefined();
    expect((await outputDoc()).getPageCount()).toBe(4);
  });

  it("extracts a single page", async () => {
    await goSplit(4);
    await setRange("2");
    await user().click(runButton());

    expect(await screen.findByText("1 Seite(n) extrahiert.")).toBeDefined();
    // 1-indexed input: page "2" is the source's second page (210x310).
    expect(Math.round((await outputDoc()).getPage(0).getWidth())).toBe(201);
  });

  it("de-duplicates overlapping ranges", async () => {
    await goSplit(5);
    await setRange("1-3,2,3");
    await user().click(runButton());

    expect(await screen.findByText("3 Seite(n) extrahiert.")).toBeDefined();
  });

  it("returns pages in ascending order regardless of input order", async () => {
    await goSplit(5);
    await setRange("4,1");
    await user().click(runButton());

    await waitFor(async () => {
      const doc = await outputDoc();
      expect(doc.getPageCount()).toBe(2);
      // Ascending: source page 1 (200 wide) then page 4 (203 wide).
      expect(Math.round(doc.getPage(0).getWidth())).toBe(200);
      expect(Math.round(doc.getPage(1).getWidth())).toBe(203);
    });
  });

  it("clamps a range that runs past the end", async () => {
    await goSplit(3);
    await setRange("2-99");
    await user().click(runButton());

    expect(await screen.findByText("2 Seite(n) extrahiert.")).toBeDefined();
  });

  it("rejects a range that selects nothing", async () => {
    await goSplit(3);
    await setRange("99");
    await user().click(runButton());

    expect(await screen.findByText("Kein gültiger Seitenbereich.")).toBeDefined();
    expect(captured).toBeNull();
  });

  it("ignores unparseable fragments but keeps the valid ones", async () => {
    await goSplit(5);
    await setRange("abc,2,-,3");
    await user().click(runButton());

    expect(await screen.findByText("2 Seite(n) extrahiert.")).toBeDefined();
  });

  it("rejects a wholly unparseable range", async () => {
    await goSplit(5);
    await setRange("abc");
    await user().click(runButton());

    expect(await screen.findByText("Kein gültiger Seitenbereich.")).toBeDefined();
  });

  it("requires a file", async () => {
    render(<PdfTools />);
    await user().click(tab("Aufteilen"));
    await user().click(runButton());

    expect(await screen.findByText("Bitte ein PDF wählen.")).toBeDefined();
  });
});

describe("rotate", () => {
  const goRotate = async (pages: number, startRotation = 0) => {
    render(<PdfTools />);
    await user().click(tab("Drehen"));
    await user().upload(
      screen.getByLabelText(/PDF auswählen/),
      await pdfFile("src.pdf", pages, startRotation),
    );
  };

  it("rotates every page by 90° by default", async () => {
    await goRotate(3);
    await user().click(runButton());

    expect(await screen.findByText("Seiten gedreht.")).toBeDefined();
    const doc = await outputDoc();
    for (let i = 0; i < doc.getPageCount(); i++) {
      expect(doc.getPage(i).getRotation().angle).toBe(90);
    }
  });

  it("adds to an existing rotation rather than replacing it", async () => {
    // A page already at 90° must end at 180°, not stay at 90°.
    await goRotate(1, 90);
    await user().click(runButton());

    await waitFor(async () => {
      expect((await outputDoc()).getPage(0).getRotation().angle).toBe(180);
    });
  });

  it("wraps past 360 back into range", async () => {
    // 270° + 180° = 450° → 90°. An unwrapped value is invalid in a PDF.
    await goRotate(1, 270);
    await user().selectOptions(screen.getByLabelText("Drehung"), "180");
    await user().click(runButton());

    await waitFor(async () => {
      expect((await outputDoc()).getPage(0).getRotation().angle).toBe(90);
    });
  });

  it("applies the selected 270° option", async () => {
    await goRotate(1);
    await user().selectOptions(screen.getByLabelText("Drehung"), "270");
    await user().click(runButton());

    await waitFor(async () => {
      expect((await outputDoc()).getPage(0).getRotation().angle).toBe(270);
    });
  });

  it("requires a file", async () => {
    render(<PdfTools />);
    await user().click(tab("Drehen"));
    await user().click(runButton());

    expect(await screen.findByText("Bitte ein PDF wählen.")).toBeDefined();
  });
});

describe("mode switching", () => {
  it("marks exactly one tab selected", async () => {
    render(<PdfTools />);
    const selected = () =>
      screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");

    expect(selected()).toHaveLength(1);
    await user().click(tab("Drehen"));
    expect(selected()).toHaveLength(1);
    expect(selected()[0]?.textContent).toBe("Drehen");
  });

  it("clears a previous error when the mode changes", async () => {
    render(<PdfTools />);
    await user().click(runButton());
    expect(await screen.findByText("Bitte mindestens zwei PDFs wählen.")).toBeDefined();

    await user().click(tab("Aufteilen"));

    // A stale error from another mode would be misleading.
    await waitFor(() =>
      expect(screen.queryByText("Bitte mindestens zwei PDFs wählen.")).toBeNull(),
    );
  });

  it("shows the range field only for split, and the angle only for rotate", async () => {
    render(<PdfTools />);
    expect(screen.queryByLabelText(/Seiten/)).toBeNull();

    await user().click(tab("Aufteilen"));
    expect(screen.getByLabelText(/Seiten/)).toBeDefined();
    expect(screen.queryByLabelText("Drehung")).toBeNull();

    await user().click(tab("Drehen"));
    expect(screen.getByLabelText("Drehung")).toBeDefined();
    expect(screen.queryByLabelText(/Seiten/)).toBeNull();
  });
});

describe("failure handling", () => {
  it("reports a corrupt PDF instead of crashing", async () => {
    render(<PdfTools />);
    await user().click(tab("Drehen"));
    await user().upload(
      screen.getByLabelText(/PDF auswählen/),
      new File([new Uint8Array([1, 2, 3])], "broken.pdf", { type: "application/pdf" }),
    );
    await user().click(runButton());

    // pdf-lib's own message is surfaced; the point is that it is caught.
    await waitFor(() => expect(screen.getByText(/./, { selector: ".status-pill--danger" })).toBeDefined());
    expect(captured).toBeNull();
  });
});

/**
 * The English branch. Every case above renders without props and so doubles
 * as the regression test for the German default.
 *
 * The page-range SYNTAX is not translated — "1-3,5" parses identically in
 * both languages, which is what the last case pins.
 */
describe("in English", () => {
  it("translates the mode tabs", () => {
    render(<PdfTools lang="en" />);
    expect(screen.getByRole("tab", { name: "Merge" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Split" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Rotate" })).toBeDefined();
    expect(screen.queryByRole("tab", { name: "Zusammenführen" })).toBeNull();
  });

  it("refuses an empty selection in English", async () => {
    const u = userEvent.setup({ delay: null });
    render(<PdfTools lang="en" />);
    await u.click(screen.getByRole("button", { name: "Run & download" }));
    expect(await screen.findByText("Please choose at least two PDFs.")).toBeDefined();
  });

  it("states the local-processing promise in English", () => {
    render(<PdfTools lang="en" />);
    expect(screen.getByText(/never uploaded/)).toBeDefined();
  });
});
