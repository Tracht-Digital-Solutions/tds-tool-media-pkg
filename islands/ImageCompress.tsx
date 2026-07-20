import { useState } from "react";

interface Result {
  url: string;
  size: number;
  width: number;
  height: number;
}

/** Human file size. */
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Client-side image compressor: load a file, redraw onto a canvas at a target
 * width, and re-encode as JPEG or WebP at the chosen quality. Nothing is
 * uploaded — the file is read + processed entirely in the browser.
 */
export default function ImageCompress() {
  const [original, setOriginal] = useState<{ name: string; size: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [format, setFormat] = useState<"image/jpeg" | "image/webp">("image/jpeg");
  const [quality, setQuality] = useState(0.75);
  const [maxWidth, setMaxWidth] = useState(1600);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setOriginal({ name: file.name, size: file.size });
    const img = new Image();
    img.onload = () => setImgEl(img);
    img.onerror = () => setError("Bild konnte nicht geladen werden.");
    img.src = URL.createObjectURL(file);
  };

  const compress = async () => {
    if (!imgEl) return;
    setBusy(true);
    setError(null);
    try {
      const scale = imgEl.width > maxWidth ? maxWidth / imgEl.width : 1;
      const w = Math.max(1, Math.round(imgEl.width * scale));
      const h = Math.max(1, Math.round(imgEl.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas nicht verfügbar.");
      ctx.drawImage(imgEl, 0, 0, w, h);
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, format, quality));
      if (!blob) throw new Error("Komprimierung fehlgeschlagen.");
      setResult({ url: URL.createObjectURL(blob), size: blob.size, width: w, height: h });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler bei der Komprimierung.");
    } finally {
      setBusy(false);
    }
  };

  const ext = format === "image/webp" ? "webp" : "jpg";
  const saving = original && result ? Math.round((1 - result.size / original.size) * 100) : null;
  const field = "w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-paper)] px-3 py-2";

  return (
    <div className="image-compress space-y-5">
      <label className="block">
        <span className="mb-1 block text-sm opacity-80">Bild auswählen</span>
        <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} className={field} />
      </label>

      {imgEl && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block opacity-80">Format</span>
              <select className={field} value={format} onChange={(e) => setFormat(e.target.value as "image/jpeg" | "image/webp")}>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block opacity-80">Qualität: {Math.round(quality * 100)}%</span>
              <input type="range" min={0.3} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block opacity-80">Max. Breite: {maxWidth}px</span>
              <input type="range" min={320} max={4000} step={80} value={maxWidth} onChange={(e) => setMaxWidth(Number(e.target.value))} className="w-full" />
            </label>
          </div>
          <button type="button" onClick={compress} disabled={busy} className="rounded-lg bg-[color:var(--color-primary)] px-4 py-2 text-sm text-[color:var(--color-paper)] disabled:opacity-50">
            {busy ? "Komprimiere …" : "Komprimieren"}
          </button>
        </>
      )}

      {error && <p className="status-pill status-pill--danger text-sm">{error}</p>}

      {result && original && (
        <div className="space-y-3 rounded-xl border border-[color:var(--color-border)] p-4">
          <img src={result.url} alt="Komprimiertes Bild" className="max-h-64 rounded-lg" />
          <p className="text-sm">
            {fmtSize(original.size)} → <strong>{fmtSize(result.size)}</strong>
            {saving !== null && saving > 0 && <span className="text-[color:var(--color-success)]"> ({saving}% kleiner)</span>}
            <span className="opacity-60"> · {result.width}×{result.height}px</span>
          </p>
          <a href={result.url} download={`komprimiert.${ext}`} className="inline-block rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm">
            Herunterladen
          </a>
        </div>
      )}

      <p className="text-xs opacity-60">Alle Bilder werden lokal in deinem Browser verarbeitet und niemals hochgeladen.</p>
    </div>
  );
}
