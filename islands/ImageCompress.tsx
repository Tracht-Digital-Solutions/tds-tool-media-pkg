import { useEffect, useId, useRef, useState } from "react";
import {
  createZip,
  encodeOnce,
  encodeToTarget,
  extensionFor,
  fitDimensions,
  formatSize,
  isLossy,
  outputName,
  resolveMime,
  savingPercent,
  uniqueNames,
  type EncodableMime,
  type OutputFormat,
} from "./compressCore";
import { FileDropZone } from "@tracht-digital-solutions/tds-shared/dropzone";
import { downloadBytes } from "@tracht-digital-solutions/tds-shared/download";
import { Alert } from "@tracht-digital-solutions/tds-shared/alert";

/** See the tools-site convention: labels are translated, logic is not. */
type Lang = "de" | "en";

interface Strings {
  loadFailed: string;
  noCanvas: string;
  compressFailed: string;
  formatUnsupported: string;
  chooseImage: string;
  dropHint: string;
  dropActive: string;
  presets: string;
  presetNames: Record<PresetId, string>;
  format: string;
  formatOriginal: string;
  quality: string;
  qualityLossless: string;
  maxWidth: string;
  maxHeight: string;
  unlimited: string;
  targetSize: string;
  targetHint: string;
  compressing: string;
  compress: string;
  clearAll: string;
  remove: (name: string) => string;
  resultAlt: (name: string) => string;
  originalAlt: (name: string) => string;
  compare: string;
  before: string;
  after: string;
  smaller: (pct: number) => string;
  larger: (pct: number) => string;
  keptOriginal: string;
  targetMissed: string;
  download: string;
  downloadZip: (n: number) => string;
  suffix: string;
  zipName: string;
  summary: (n: number, before: string, after: string, pct: number) => string;
  waiting: string;
  note: string;
}

type PresetId = "web" | "email" | "social" | "thumb";

interface Settings {
  format: OutputFormat;
  quality: number;
  maxWidth: number | null;
  maxHeight: number | null;
  /** Target file size in KB; `null` = compress at the chosen quality only. */
  targetKb: number | null;
}

/**
 * Starting points for the common jobs. Values follow the guide on the tools
 * site ("1600 px for full-width, quality around 80 %"); a preset only fills
 * the fields, every one stays editable afterwards.
 */
const PRESETS: Record<PresetId, Settings> = {
  web: { format: "image/webp", quality: 0.8, maxWidth: 1600, maxHeight: null, targetKb: null },
  email: { format: "image/jpeg", quality: 0.8, maxWidth: 1280, maxHeight: 1280, targetKb: 300 },
  social: { format: "image/jpeg", quality: 0.85, maxWidth: 1080, maxHeight: 1350, targetKb: null },
  thumb: { format: "image/webp", quality: 0.75, maxWidth: 400, maxHeight: 400, targetKb: null },
};

/** German is the default — every existing test here asserts German labels. */
const STRINGS = {
  de: {
    loadFailed: "Bild konnte nicht geladen werden. Formate wie HEIC bitte vorher als JPG exportieren.",
    noCanvas: "Canvas nicht verfügbar.",
    compressFailed: "Komprimierung fehlgeschlagen.",
    formatUnsupported: "Dieser Browser kann das gewählte Format nicht schreiben. Bitte JPEG oder PNG wählen.",
    chooseImage: "Bilder auswählen",
    dropHint: "oder hierher ziehen bzw. mit Strg+V einfügen. JPG, PNG, WebP, AVIF und GIF; mehrere auf einmal.",
    dropActive: "Loslassen zum Hinzufügen",
    presets: "Voreinstellung",
    presetNames: { web: "Website", email: "E-Mail", social: "Social Media", thumb: "Vorschaubild" },
    format: "Format",
    formatOriginal: "Wie Original",
    quality: "Qualität",
    qualityLossless: "PNG ist verlustfrei, kleiner wird es nur über die Pixelmaße.",
    maxWidth: "Max. Breite (px)",
    maxHeight: "Max. Höhe (px)",
    unlimited: "unbegrenzt",
    targetSize: "Zielgröße (KB)",
    targetHint: "Optional. Die Qualität wird automatisch gesenkt, bis die Datei höchstens so groß ist.",
    compressing: "Komprimiere …",
    compress: "Komprimieren",
    clearAll: "Alle entfernen",
    remove: (name) => `${name} entfernen`,
    resultAlt: (name) => `${name}, komprimiert`,
    originalAlt: (name) => `${name}, Original`,
    compare: "Vorher und nachher vergleichen",
    before: "Vorher",
    after: "Nachher",
    smaller: (pct) => ` (${pct}% kleiner)`,
    larger: (pct) => ` (${pct}% größer)`,
    keptOriginal: "Das Original war bereits kleiner und bleibt unverändert.",
    targetMissed: "Zielgröße nicht ganz erreicht; das ist die kleinste mögliche Datei.",
    download: "Herunterladen",
    downloadZip: (n) => `Alle ${n} als ZIP herunterladen`,
    suffix: "komprimiert",
    zipName: "bilder-komprimiert.zip",
    summary: (n, before, after, pct) =>
      `${n} ${n === 1 ? "Bild" : "Bilder"}: ${before} → ${after}${pct > 0 ? ` (${pct}% kleiner)` : ""}`,
    waiting: "Bereit",
    note: "Alle Bilder werden lokal im Browser verarbeitet und niemals hochgeladen.",
  },
  en: {
    loadFailed: "The image could not be loaded. Please export formats such as HEIC as JPG first.",
    noCanvas: "Canvas is not available.",
    compressFailed: "Compression failed.",
    formatUnsupported: "This browser cannot write the chosen format. Please pick JPEG or PNG.",
    chooseImage: "Choose images",
    dropHint: "or drag them here, or paste with Ctrl+V. JPG, PNG, WebP, AVIF and GIF; several at once.",
    dropActive: "Release to add",
    presets: "Preset",
    presetNames: { web: "Website", email: "Email", social: "Social media", thumb: "Thumbnail" },
    format: "Format",
    formatOriginal: "Same as original",
    quality: "Quality",
    qualityLossless: "PNG is lossless; it only gets smaller through its pixel dimensions.",
    maxWidth: "Max. width (px)",
    maxHeight: "Max. height (px)",
    unlimited: "unlimited",
    targetSize: "Target size (KB)",
    targetHint: "Optional. Quality is lowered automatically until the file is at most this size.",
    compressing: "Compressing …",
    compress: "Compress",
    clearAll: "Remove all",
    remove: (name) => `Remove ${name}`,
    resultAlt: (name) => `${name}, compressed`,
    originalAlt: (name) => `${name}, original`,
    compare: "Compare before and after",
    before: "Before",
    after: "After",
    smaller: (pct) => ` (${pct}% smaller)`,
    larger: (pct) => ` (${pct}% larger)`,
    keptOriginal: "The original was already smaller and is kept unchanged.",
    targetMissed: "Target size not quite reached; this is the smallest file possible.",
    download: "Download",
    downloadZip: (n) => `Download all ${n} as ZIP`,
    suffix: "compressed",
    zipName: "images-compressed.zip",
    summary: (n, before, after, pct) =>
      `${n} ${n === 1 ? "image" : "images"}: ${before} → ${after}${pct > 0 ? ` (${pct}% smaller)` : ""}`,
    waiting: "Ready",
    note: "All images are processed locally in your browser and are never uploaded.",
  },
} satisfies Record<Lang, Strings>;

interface Result {
  url: string;
  blob: Blob;
  mime: EncodableMime;
  width: number;
  height: number;
  name: string;
  /** The output was bigger than the input, so the input is offered instead. */
  keptOriginal: boolean;
  targetMissed: boolean;
}

interface Item {
  id: number;
  file: File;
  /** Object URL of the input, used for decoding and for the "before" view. */
  sourceUrl: string;
  img: HTMLImageElement | null;
  error: string | null;
  result: Result | null;
}

interface Props {
  lang?: Lang;
}

const FORMAT_LABELS: Record<EncodableMime, string> = {
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "image/png": "PNG",
  "image/avif": "AVIF",
};

/**
 * Probe whether this browser's canvas can write `mime`. An unsupported type
 * does not fail — `toBlob` silently falls back to PNG — so the returned type
 * is the only honest answer. Safari, for one, writes no WebP from a canvas.
 */
function probe(mime: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      c.toBlob((b) => resolve(!!b && b.type === mime), mime, 0.5);
    } catch {
      resolve(false);
    }
  });
}

/** Whole positive pixels or KB from a number field; empty or junk means no limit. */
function parseLimit(value: string): number | null {
  const n = Math.round(Number(value));
  return value.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Client-side image compressor: several images at once, resized to fit a
 * maximum width and height, re-encoded as JPEG, WebP, PNG or AVIF at a chosen
 * quality or down to a target file size, downloadable one by one or as one
 * ZIP. Nothing is uploaded — files are read and processed in the browser.
 */
export default function ImageCompress({ lang = "de" }: Props) {
  const t: Strings = STRINGS[lang];
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings>({
    format: "image/jpeg",
    quality: 0.8,
    maxWidth: 1600,
    maxHeight: null,
    targetKb: null,
  });
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [supported, setSupported] = useState<Record<"image/webp" | "image/avif", boolean>>({
    "image/webp": true,
    "image/avif": false,
  });
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const hintId = useId();

  /**
   * Every object URL this island has minted, so each can be released.
   *
   * An object URL pins its Blob for the lifetime of the DOCUMENT, not of the
   * component — dropping the last reference to it frees nothing. Compressing a
   * folder of 12 MP photos twice without revoking would keep every decoded
   * bitmap alive until the tab closed. Nothing errors; the tab just grows.
   *
   * A ref mirrors the list so the unmount cleanup sees the latest value, which
   * a captured state variable would not.
   */
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  const release = (item: Item) => {
    URL.revokeObjectURL(item.sourceUrl);
    if (item.result && item.result.url !== item.sourceUrl) URL.revokeObjectURL(item.result.url);
  };

  // Unmount is the last chance: an Astro island is torn down on navigation.
  useEffect(() => () => itemsRef.current.forEach(release), []);

  useEffect(() => {
    let live = true;
    Promise.all([probe("image/webp"), probe("image/avif")]).then(([webp, avif]) => {
      if (live) setSupported({ "image/webp": webp, "image/avif": avif });
    });
    return () => {
      live = false;
    };
  }, []);

  const patch = (id: number, change: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...change } : it)));

  const addFiles = (files: Iterable<File>) => {
    const added: Item[] = [];
    for (const file of files) {
      if (file.type && !file.type.startsWith("image/")) continue;
      const id = nextId.current++;
      const sourceUrl = URL.createObjectURL(file);
      added.push({ id, file, sourceUrl, img: null, error: null, result: null });
      const img = new Image();
      img.onload = () => patch(id, { img });
      img.onerror = () => patch(id, { error: t.loadFailed });
      img.src = sourceUrl;
    }
    if (added.length) setItems((list) => [...list, ...added]);
  };

  const remove = (id: number) => {
    setItems((list) => {
      const gone = list.find((it) => it.id === id);
      if (gone) release(gone);
      return list.filter((it) => it.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach(release);
    setItems([]);
  };

  const update = (change: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...change }));
    setPreset(null);
  };

  const applyPreset = (id: PresetId) => {
    const p = PRESETS[id];
    // A preset never asks for a format this browser cannot write.
    const format = (p.format === "image/webp" || p.format === "image/avif") && !supported[p.format] ? "image/jpeg" : p.format;
    setSettings({ ...p, format });
    setPreset(id);
  };

  /** Compress one decoded image with the current settings. */
  const compressOne = async (item: Item, img: HTMLImageElement): Promise<Result> => {
    const mime = resolveMime(settings.format, item.file.type);
    const fit = fitDimensions(img.width, img.height, settings.maxWidth, settings.maxHeight);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(t.noCanvas);

    const encode = (scale: number, quality: number) => {
      canvas.width = Math.max(1, Math.round(fit.width * scale));
      canvas.height = Math.max(1, Math.round(fit.height * scale));
      // JPEG has no alpha: a transparent PNG would otherwise turn black.
      if (mime === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
    };

    const out = settings.targetKb
      ? await encodeToTarget(encode, {
          targetBytes: settings.targetKb * 1024,
          maxQuality: settings.quality,
          lossy: isLossy(mime),
        })
      : await encodeOnce(encode, settings.quality);
    if (out.blob.type && out.blob.type !== mime) throw new Error(t.formatUnsupported);

    const width = canvas.width;
    const height = canvas.height;
    const sameType = resolveMime("original", item.file.type) === mime && item.file.type !== "";
    // Re-encoding an already lean file can make it bigger. When nothing else
    // changed (same type, same pixels), handing back the bigger copy would be
    // the tool working against its user.
    if (sameType && out.blob.size >= item.file.size && width === img.width && height === img.height) {
      return {
        url: item.sourceUrl,
        blob: item.file,
        mime,
        width,
        height,
        name: outputName(item.file.name, t.suffix, extensionFor(mime)),
        keptOriginal: true,
        targetMissed: false,
      };
    }
    return {
      url: URL.createObjectURL(out.blob),
      blob: out.blob,
      mime,
      width,
      height,
      name: outputName(item.file.name, t.suffix, extensionFor(mime)),
      keptOriginal: false,
      targetMissed: !out.reached,
    };
  };

  const compressAll = async () => {
    setBusy(true);
    // One at a time: twenty 12 MP canvases side by side would exhaust a phone.
    for (const item of itemsRef.current) {
      if (!item.img) continue;
      try {
        const result = await compressOne(item, item.img);
        // Re-compressing replaces the download target, so the old one is dead.
        if (item.result && item.result.url !== item.sourceUrl) URL.revokeObjectURL(item.result.url);
        patch(item.id, { result, error: null });
      } catch (e) {
        patch(item.id, { error: e instanceof Error && e.message !== "encode" ? e.message : t.compressFailed });
      }
    }
    setBusy(false);
  };

  const downloadZip = async () => {
    const done = items.filter((it) => it.result);
    const names = uniqueNames(done.map((it) => it.result!.name));
    const entries = await Promise.all(
      done.map(async (it, i) => ({ name: names[i]!, data: new Uint8Array(await it.result!.blob.arrayBuffer()) })),
    );
    downloadBytes(createZip(entries), "application/zip", t.zipName);
  };

  const ready = items.some((it) => it.img);
  const done = items.filter((it) => it.result);
  const totalBefore = done.reduce((n, it) => n + it.file.size, 0);
  const totalAfter = done.reduce((n, it) => n + it.result!.blob.size, 0);
  const mimeShown = settings.format === "original" ? null : settings.format;
  const lossless = mimeShown === "image/png";
  // Geometry/border/padding from the shared primitive; the pack ships no CSS.
  const field = "field-boxed w-full";

  return (
    <div className="image-compress space-y-5">
      <FileDropZone
        label={t.chooseImage}
        hint={t.dropHint}
        activeLabel={t.dropActive}
        accept="image/*"
        multiple
        paste
        onFiles={addFiles}
      />

      {ready && (
        <>
          <div role="group" aria-label={t.presets} className="flex flex-wrap items-center gap-2">
            <span className="text-sm opacity-80">{t.presets}:</span>
            {(Object.keys(PRESETS) as PresetId[]).map((id) => (
              <button
                key={id}
                type="button"
                className={preset === id ? "chip chip-active" : "chip"}
                aria-pressed={preset === id}
                onClick={() => applyPreset(id)}
              >
                {t.presetNames[id]}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block opacity-80">{t.format}</span>
              <select
                className={field}
                value={settings.format}
                onChange={(e) => update({ format: e.target.value as OutputFormat })}
              >
                <option value="image/jpeg">JPEG</option>
                {supported["image/webp"] && <option value="image/webp">WebP</option>}
                <option value="image/png">PNG</option>
                {supported["image/avif"] && <option value="image/avif">AVIF</option>}
                <option value="original">{t.formatOriginal}</option>
              </select>
            </label>
            {/* Hints sit beside the label, not inside it: text inside a
                <label> becomes part of the control's accessible name. */}
            <div className="text-sm">
              <label className="block">
                <span className="mb-1 block opacity-80">
                  {t.quality}: {Math.round(settings.quality * 100)}%
                </span>
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.05}
                  value={settings.quality}
                  disabled={lossless}
                  aria-describedby={lossless ? `${hintId}-q` : undefined}
                  onChange={(e) => update({ quality: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
              {lossless && (
                <p id={`${hintId}-q`} className="mt-1 text-xs opacity-60">
                  {t.qualityLossless}
                </p>
              )}
            </div>
            <div className="text-sm">
              <label className="block">
                <span className="mb-1 block opacity-80">{t.targetSize}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={10}
                  step={10}
                  placeholder={t.unlimited}
                  value={settings.targetKb ?? ""}
                  aria-describedby={`${hintId}-t`}
                  onChange={(e) => update({ targetKb: parseLimit(e.target.value) })}
                  className={field}
                />
              </label>
              <p id={`${hintId}-t`} className="mt-1 text-xs opacity-60">
                {t.targetHint}
              </p>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block opacity-80">{t.maxWidth}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder={t.unlimited}
                value={settings.maxWidth ?? ""}
                onChange={(e) => update({ maxWidth: parseLimit(e.target.value) })}
                className={field}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block opacity-80">{t.maxHeight}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder={t.unlimited}
                value={settings.maxHeight ?? ""}
                onChange={(e) => update({ maxHeight: parseLimit(e.target.value) })}
                className={field}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={compressAll} disabled={busy}>
              {busy ? t.compressing : t.compress}
            </button>
            {done.length > 1 && (
              <button type="button" className="btn btn-ghost" onClick={downloadZip} disabled={busy}>
                {t.downloadZip(done.length)}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={clearAll} disabled={busy}>
              {t.clearAll}
            </button>
          </div>
        </>
      )}

      {done.length > 0 && (
        // `key` on the value: a permanent live region re-announces only when
        // its child is replaced, not when its text changes in place.
        <p className="text-sm font-semibold" aria-live="polite">
          <span key={`${done.length}-${totalAfter}`}>
            {t.summary(
              done.length,
              formatSize(totalBefore, lang),
              formatSize(totalAfter, lang),
              savingPercent(totalBefore, totalAfter),
            )}
          </span>
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((item) => {
            const r = item.result;
            const pct = r ? savingPercent(item.file.size, r.blob.size) : 0;
            return (
              <li key={item.id} className="tds-card tds-appear space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {r && (
                    <img
                      src={r.url}
                      alt={t.resultAlt(item.file.name)}
                      className="tds-card h-16 w-16 shrink-0 object-cover"
                    />
                  )}
                  <div className="min-w-[12rem] flex-1 text-sm">
                    <p className="truncate font-semibold">{item.file.name}</p>
                    {r ? (
                      <p>
                        {formatSize(item.file.size, lang)} → <strong>{formatSize(r.blob.size, lang)}</strong>
                        {pct > 0 && <span className="text-[color:var(--color-success)]">{t.smaller(pct)}</span>}
                        {pct < 0 && <span className="text-[color:var(--color-warning-ink)]">{t.larger(-pct)}</span>}
                        <span className="opacity-60">
                          {" "}
                          · {r.width}×{r.height}px
                        </span>
                      </p>
                    ) : (
                      !item.error && (
                        <p className="opacity-60">
                          {formatSize(item.file.size, lang)}
                          {item.img && ` · ${item.img.width}×${item.img.height}px · ${t.waiting}`}
                        </p>
                      )
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r && (
                      <a href={r.url} download={r.name} className="btn btn-ghost">
                        {t.download}
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={t.remove(item.file.name)}
                      onClick={() => remove(item.id)}
                      disabled={busy}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {item.error && (
                  <Alert>
                    {item.error}
                  </Alert>
                )}
                {r?.keptOriginal && <Alert tone="success">{t.keptOriginal}</Alert>}
                {r?.targetMissed && <Alert tone="warning">{t.targetMissed}</Alert>}

                {r && !r.keptOriginal && (
                  <details className="text-sm">
                    <summary className="link-underline cursor-pointer">{t.compare}</summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <figure className="space-y-1">
                        <img
                          src={item.sourceUrl}
                          alt={t.originalAlt(item.file.name)}
                          className="tds-card h-auto max-h-80 w-full object-contain"
                        />
                        <figcaption className="opacity-70">
                          {t.before} · {formatSize(item.file.size, lang)}
                        </figcaption>
                      </figure>
                      <figure className="space-y-1">
                        <img
                          src={r.url}
                          alt={t.resultAlt(item.file.name)}
                          className="tds-card h-auto max-h-80 w-full object-contain"
                        />
                        <figcaption className="opacity-70">
                          {t.after} · {formatSize(r.blob.size, lang)} · {FORMAT_LABELS[r.mime]}
                        </figcaption>
                      </figure>
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs opacity-60">{t.note}</p>
    </div>
  );
}
