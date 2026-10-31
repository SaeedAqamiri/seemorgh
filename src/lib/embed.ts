export type EmbedResult =
  | { type: "iframe"; src: string; provider: "aparat" }
  | { type: "link"; href: string }
  | { type: "none" };

function safeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function aparatId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "aparat.com") return null;
  const match = /^\/v\/([^/?#]+)/.exec(url.pathname);
  if (match) return match[1];
  const embed = /^\/video\/video\/embed\/videohash\/([^/?#]+)/.exec(url.pathname);
  if (embed) return embed[1];
  return null;
}

export function resolveEmbed(urlValue: string | null | undefined, kind: string): EmbedResult {
  if (!urlValue) return { type: "none" };
  const url = safeUrl(urlValue);
  if (!url) return { type: "none" };

  if (kind === "video" || kind === "psychology") {
    const aparat = aparatId(url);
    if (aparat) {
      return {
        type: "iframe",
        provider: "aparat",
        src: `https://www.aparat.com/video/video/embed/videohash/${encodeURIComponent(aparat)}/vt/frame`,
      };
    }
  }

  return { type: "link", href: url.toString() };
}

export const CONTENT_KIND_LABELS = {
  video: "فیلم",
  text: "متن",
  psychology: "تست روان‌شناسی",
} as const;
