import { useState } from "react";
import { PDFDocument, degrees } from "pdf-lib";

type Mode = "merge" | "split" | "rotate";

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
export default function PdfTools() {
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
        if (mergeFiles.length < 2) throw new Error("Bitte mindestens zwei PDFs wählen.");
        const out = await PDFDocument.create();
        for (const f of mergeFiles) {
          const doc = await PDFDocument.load(await f.arrayBuffer());
          const pages = await out.copyPages(doc, doc.getPageIndices());
          pages.forEach((p) => out.addPage(p));
        }
        download(await out.save(), "zusammengefuehrt.pdf");
        setStatus(`${mergeFiles.length} PDFs zusammengeführt.`);
      } else if (mode === "split") {
        if (!singleFile) throw new Error("Bitte ein PDF wählen.");
        const src = await PDFDocument.load(await singleFile.arrayBuffer());
        const idx = parseRange(range, src.getPageCount());
        if (idx.length === 0) throw new Error("Kein gültiger Seitenbereich.");
        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, idx);
        pages.forEach((p) => out.addPage(p));
        download(await out.save(), "auszug.pdf");
        setStatus(`${idx.length} Seite(n) extrahiert.`);
      } else {
        if (!singleFile) throw new Error("Bitte ein PDF wählen.");
        const src = await PDFDocument.load(await singleFile.arrayBuffer());
        src.getPages().forEach((p) => {
          const current = p.getRotation().angle;
          p.setRotation(degrees((current + angle) % 360));
        });
        download(await src.save(), "gedreht.pdf");
        setStatus("Seiten gedreht.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF konnte nicht verarbeitet werden.");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-paper)] px-3 py-2";

  return (
    <div className="pdf-tools space-y-5">
      <div className="flex flex-wrap gap-2" role="tablist">
        {(
          [
            ["merge", "Zusammenführen"],
            ["split", "Aufteilen"],
            ["rotate", "Drehen"],
          ] as [Mode, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => { setMode(value); setStatus(null); setError(null); }}
            className={`rounded-full px-4 py-1.5 text-sm ${
              mode === value ? "bg-[color:var(--color-primary)] text-[color:var(--color-paper)]" : "border border-[color:var(--color-border)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "merge" ? (
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">PDFs auswählen (Reihenfolge = Auswahlreihenfolge)</span>
          <input type="file" accept="application/pdf" multiple className={field} onChange={(e) => setMergeFiles(Array.from(e.target.files ?? []))} />
          {mergeFiles.length > 0 && <span className="mt-1 block text-xs opacity-60">{mergeFiles.length} Datei(en) gewählt</span>}
        </label>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">PDF auswählen</span>
          <input type="file" accept="application/pdf" className={field} onChange={(e) => setSingleFile(e.target.files?.[0] ?? null)} />
        </label>
      )}

      {mode === "split" && (
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">Seiten (z. B. 1-3,5)</span>
          <input type="text" className={field} value={range} onChange={(e) => setRange(e.target.value)} placeholder="1-3,5" />
        </label>
      )}

      {mode === "rotate" && (
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">Drehung</span>
          <select className={field} value={angle} onChange={(e) => setAngle(Number(e.target.value))}>
            <option value={90}>90° im Uhrzeigersinn</option>
            <option value={180}>180°</option>
            <option value={270}>270° (90° gegen den Uhrzeigersinn)</option>
          </select>
        </label>
      )}

      <button type="button" onClick={run} disabled={busy} className="rounded-lg bg-[color:var(--color-primary)] px-4 py-2 text-sm text-[color:var(--color-paper)] disabled:opacity-50">
        {busy ? "Verarbeite …" : "Ausführen & herunterladen"}
      </button>

      {error && <p className="status-pill status-pill--danger text-sm">{error}</p>}
      {status && <p className="status-pill status-pill--success text-sm">{status}</p>}

      <p className="text-xs opacity-60">Alle PDFs werden lokal im Browser verarbeitet und niemals hochgeladen.</p>
    </div>
  );
}
