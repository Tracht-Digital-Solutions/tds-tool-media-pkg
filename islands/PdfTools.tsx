import { useState } from "react";
import { PDFDocument, degrees } from "pdf-lib";

type Mode = "merge" | "split" | "rotate";

/** See the tools-site convention: labels are translated, logic is not. */
type Lang = "de" | "en";

interface Strings {
  needTwo: string;
  needOne: string;
  badRange: string;
  failed: string;
  merged: (n: number) => string;
  extracted: (n: number) => string;
  rotated: string;
  mergeName: string;
  splitName: string;
  rotateName: string;
  tabMerge: string;
  tabSplit: string;
  tabRotate: string;
  choosePdfs: string;
  filesChosen: (n: number) => string;
  choosePdf: string;
  pages: string;
  rotation: string;
  cw90: string;
  deg180: string;
  ccw90: string;
  working: string;
  run: string;
  note: string;
}

/** German is the default — every existing test here asserts German labels. */
const STRINGS = {
  de: {
    needTwo: "Bitte mindestens zwei PDFs wählen.",
    needOne: "Bitte ein PDF wählen.",
    badRange: "Kein gültiger Seitenbereich.",
    failed: "PDF konnte nicht verarbeitet werden.",
    merged: (n) => `${n} PDFs zusammengeführt.`,
    extracted: (n) => `${n} Seite(n) extrahiert.`,
    rotated: "Seiten gedreht.",
    mergeName: "zusammengefuehrt.pdf",
    splitName: "auszug.pdf",
    rotateName: "gedreht.pdf",
    tabMerge: "Zusammenführen",
    tabSplit: "Aufteilen",
    tabRotate: "Drehen",
    choosePdfs: "PDFs auswählen (Reihenfolge = Auswahlreihenfolge)",
    filesChosen: (n) => `${n} Datei(en) gewählt`,
    choosePdf: "PDF auswählen",
    pages: "Seiten (z. B. 1-3,5)",
    rotation: "Drehung",
    cw90: "90° im Uhrzeigersinn",
    deg180: "180°",
    ccw90: "270° (90° gegen den Uhrzeigersinn)",
    working: "Verarbeite …",
    run: "Ausführen & herunterladen",
    note: "Alle PDFs werden lokal im Browser verarbeitet und niemals hochgeladen.",
  },
  en: {
    needTwo: "Please choose at least two PDFs.",
    needOne: "Please choose a PDF.",
    badRange: "That is not a valid page range.",
    failed: "The PDF could not be processed.",
    merged: (n) => `Merged ${n} PDFs.`,
    extracted: (n) => `Extracted ${n} page(s).`,
    rotated: "Pages rotated.",
    mergeName: "merged.pdf",
    splitName: "extract.pdf",
    rotateName: "rotated.pdf",
    tabMerge: "Merge",
    tabSplit: "Split",
    tabRotate: "Rotate",
    choosePdfs: "Choose PDFs (order of selection = order in the result)",
    filesChosen: (n) => `${n} file(s) selected`,
    choosePdf: "Choose a PDF",
    pages: "Pages (e.g. 1-3,5)",
    rotation: "Rotation",
    cw90: "90° clockwise",
    deg180: "180°",
    ccw90: "270° (90° counter-clockwise)",
    working: "Processing …",
    run: "Run & download",
    note: "All PDFs are processed locally in your browser and are never uploaded.",
  },
} satisfies Record<Lang, Strings>;

/** Parse "1-3,5" (1-indexed) into a sorted, de-duped 0-indexed page list. */
function parseRange(spec: string, pageCount: number): number[] {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = /^(\d+)(?:-(\d+))?$/.exec(t);
    if (!m) continue;
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    for (let i = start; i <= end; i++) {
      if (i >= 1 && i <= pageCount) out.add(i - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Premium PDF toolkit — merge several PDFs, split out a page range, or rotate
 * pages, all client-side via pdf-lib (no upload). Gating (login + purchase) is
 * enforced by the site's tool page; this island is the tool itself.
 */
interface Props {
  lang?: Lang;
}

export default function PdfTools({ lang = "de" }: Props) {
  const t = STRINGS[lang];
  const [mode, setMode] = useState<Mode>("merge");
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [range, setRange] = useState("1-1");
  const [angle, setAngle] = useState(90);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (mode === "merge") {
        if (mergeFiles.length < 2) throw new Error(t.needTwo);
        const out = await PDFDocument.create();
        for (const f of mergeFiles) {
          const doc = await PDFDocument.load(await f.arrayBuffer());
          const pages = await out.copyPages(doc, doc.getPageIndices());
          pages.forEach((p) => out.addPage(p));
        }
        download(await out.save(), t.mergeName);
        setStatus(t.merged(mergeFiles.length));
      } else if (mode === "split") {
        if (!singleFile) throw new Error("Bitte ein PDF wählen.");
        const src = await PDFDocument.load(await singleFile.arrayBuffer());
        const idx = parseRange(range, src.getPageCount());
        if (idx.length === 0) throw new Error(t.badRange);
        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, idx);
        pages.forEach((p) => out.addPage(p));
        download(await out.save(), t.splitName);
        setStatus(t.extracted(idx.length));
      } else {
        if (!singleFile) throw new Error("Bitte ein PDF wählen.");
        const src = await PDFDocument.load(await singleFile.arrayBuffer());
        src.getPages().forEach((p) => {
          const current = p.getRotation().angle;
          p.setRotation(degrees((current + angle) % 360));
        });
        download(await src.save(), t.rotateName);
        setStatus(t.rotated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
    } finally {
      setBusy(false);
    }
  };

  // Geometry/border/padding from the shared primitive; the pack ships no CSS.
  const field = "field-boxed w-full";

  return (
    <div className="pdf-tools space-y-5">
      <div className="flex flex-wrap gap-2" role="tablist">
        {(
          [
            ["merge", t.tabMerge],
            ["split", t.tabSplit],
            ["rotate", t.tabRotate],
          ] as [Mode, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            className={mode === value ? "chip chip-active" : "chip"}
            onClick={() => { setMode(value); setStatus(null); setError(null); }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "merge" ? (
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.choosePdfs}</span>
          <input type="file" accept="application/pdf" multiple className={field} onChange={(e) => setMergeFiles(Array.from(e.target.files ?? []))} />
          {mergeFiles.length > 0 && <span className="mt-1 block text-xs opacity-60">{t.filesChosen(mergeFiles.length)}</span>}
        </label>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.choosePdf}</span>
          <input type="file" accept="application/pdf" className={field} onChange={(e) => setSingleFile(e.target.files?.[0] ?? null)} />
        </label>
      )}

      {mode === "split" && (
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.pages}</span>
          <input type="text" className={field} value={range} onChange={(e) => setRange(e.target.value)} placeholder="1-3,5" />
        </label>
      )}

      {mode === "rotate" && (
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.rotation}</span>
          <select className={field} value={angle} onChange={(e) => setAngle(Number(e.target.value))}>
            <option value={90}>{t.cw90}</option>
            <option value={180}>{t.deg180}</option>
            <option value={270}>{t.ccw90}</option>
          </select>
        </label>
      )}

      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
        {busy ? t.working : t.run}
      </button>

      {error && <p className="status-pill status-pill--danger text-sm">{error}</p>}
      {status && <p className="status-pill status-pill--success text-sm">{status}</p>}

      <p className="text-xs opacity-60">{t.note}</p>
    </div>
  );
}
