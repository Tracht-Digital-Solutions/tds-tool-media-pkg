import { defineToolPack, defineTool } from "@tracht-digital-solutions/tds-tools-contract";

/**
 * Media utilities: a free client-side image compressor + a premium PDF toolkit
 * (merge / split / rotate). The PDF tool ships the `premiumDefault` flag; the
 * admin catalog decides the final gating + price.
 */
export default defineToolPack({
  id: "media",
  name: "Medien",
  version: "0.1.0",
  tools: [
    defineTool({
      id: "image-compress",
      slug: "bild-komprimieren",
      name: "Bild komprimieren",
      category: "media",
      description:
        "Verkleinere und komprimiere Bilder (JPG/PNG/WebP) direkt im Browser — mit einstellbarer Qualität und Zielbreite.",
      icon: "image",
      keywords: ["bild", "komprimieren", "resize", "verkleinern", "webp"],
      component: "@tracht-digital-solutions/tds-tool-media/tools/ImageCompress.astro",
      seo: {
        title: "Bild komprimieren — online & kostenlos",
        description:
          "Kostenloser Bild-Kompressor: Bilder verkleinern und komprimieren (JPG/PNG/WebP) mit einstellbarer Qualität. Läuft komplett im Browser.",
      },
    }),
    defineTool({
      id: "pdf-tools",
      slug: "pdf-werkzeuge",
      name: "PDF-Werkzeuge",
      category: "media",
      description:
        "PDFs zusammenführen, aufteilen und Seiten drehen — schnell und lokal im Browser, ohne Upload.",
      icon: "file-text",
      keywords: ["pdf", "merge", "split", "zusammenführen", "teilen", "drehen"],
      component: "@tracht-digital-solutions/tds-tool-media/tools/PdfTools.astro",
      premiumDefault: true,
      priceCentsDefault: 500,
      seo: {
        title: "PDF-Werkzeuge — zusammenführen, teilen, drehen",
        description:
          "PDF-Werkzeuge: mehrere PDFs zusammenführen, aufteilen und Seiten drehen. Direkt im Browser, kein Upload.",
      },
    }),
  ],
  i18n: {
    de: { "media.image": "Bild komprimieren", "media.pdf": "PDF-Werkzeuge" },
    en: { "media.image": "Compress Image", "media.pdf": "PDF Tools" },
  },
});
