import { useState } from "react";

/** See the tools-site convention: labels are translated, logic is not. */
type Lang = "de" | "en";

interface Strings {
  loadFailed: string;
  noCanvas: string;
  compressFailed: string;
  genericError: string;
  chooseImage: string;
  format: string;
  quality: string;
  maxWidth: string;
  compressing: string;
  compress: string;
  resultAlt: string;
  smaller: (pct: number) => string;
  download: string;
  downloadName: string;
  note: string;
}

/** German is the default — every existing test here asserts German labels. */
const STRINGS = {
  de: {
    loadFailed: "Bild konnte nicht geladen werden.",
    noCanvas: "Canvas nicht verfügbar.",
    compressFailed: "Komprimierung fehlgeschlagen.",
    genericError: "Fehler bei der Komprimierung.",
    chooseImage: "Bild auswählen",
    format: "Format",
    quality: "Qualität",
    maxWidth: "Max. Breite",
    compressing: "Komprimiere …",
    compress: "Komprimieren",
    resultAlt: "Komprimiertes Bild",
    smaller: (pct) => ` (${pct}% kleiner)`,
    download: "Herunterladen",
    downloadName: "komprimiert",
    note: "Alle Bilder werden lokal in Ihrem Browser verarbeitet und niemals hochgeladen.",
  },
  en: {
    loadFailed: "The image could not be loaded.",
    noCanvas: "Canvas is not available.",
    compressFailed: "Compression failed.",
    genericError: "Something went wrong while compressing.",
    chooseImage: "Choose an image",
    format: "Format",
    quality: "Quality",
    maxWidth: "Max. width",
    compressing: "Compressing …",
    compress: "Compress",
    resultAlt: "Compressed image",
    smaller: (pct) => ` (${pct}% smaller)`,
    download: "Download",
    downloadName: "compressed",
    note: "All images are processed locally in your browser and are never uploaded.",
  },
} satisfies Record<Lang, Strings>;

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
interface Props {
  lang?: Lang;
}

export default function ImageCompress({ lang = "de" }: Props) {
  const t = STRINGS[lang];
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
    img.onerror = () => setError(t.loadFailed);
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
      if (!ctx) throw new Error(t.noCanvas);
      ctx.drawImage(imgEl, 0, 0, w, h);
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, format, quality));
      if (!blob) throw new Error(t.compressFailed);
      setResult({ url: URL.createObjectURL(blob), size: blob.size, width: w, height: h });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.genericError);
    } finally {
      setBusy(false);
    }
  };

  const ext = format === "image/webp" ? "webp" : "jpg";
  const saving = original && result ? Math.round((1 - result.size / original.size) * 100) : null;
  // Geometry/border/padding from the shared primitive; the pack ships no CSS.
  const field = "field-boxed w-full";

  return (
    <div className="image-compress space-y-5">
      <label className="block">
        <span className="mb-1 block text-sm opacity-80">{t.chooseImage}</span>
        <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} className={field} />
      </label>

      {imgEl && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block opacity-80">{t.format}</span>
              <select className={field} value={format} onChange={(e) => setFormat(e.target.value as "image/jpeg" | "image/webp")}>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block opacity-80">{t.quality}: {Math.round(quality * 100)}%</span>
              <input type="range" min={0.3} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block opacity-80">{t.maxWidth}: {maxWidth}px</span>
              <input type="range" min={320} max={4000} step={80} value={maxWidth} onChange={(e) => setMaxWidth(Number(e.target.value))} className="w-full" />
            </label>
          </div>
          <button type="button" className="btn btn-primary" onClick={compress} disabled={busy}>
            {busy ? t.compressing : t.compress}
          </button>
        </>
      )}

      {error && <p className="status-pill status-pill--danger text-sm">{error}</p>}

      {result && original && (
        <div className="tds-card space-y-3 p-4">
          <img src={result.url} alt={t.resultAlt} className="tds-card h-auto max-h-64 max-w-full" />
          <p className="text-sm">
            {fmtSize(original.size)} → <strong>{fmtSize(result.size)}</strong>
            {saving !== null && saving > 0 && <span className="text-[color:var(--color-success)]">{t.smaller(saving)}</span>}
            <span className="opacity-60"> · {result.width}×{result.height}px</span>
          </p>
          <a href={result.url} download={`${t.downloadName}.${ext}`} className="btn btn-ghost">
            {t.download}
          </a>
        </div>
      )}

      <p className="text-xs opacity-60">{t.note}</p>
    </div>
  );
}
