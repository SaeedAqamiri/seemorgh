export type EmbedResult =
  | { type: "iframe"; src: string; provider: "youtube" | "aparat" | "vimeo" }
  | { type: "video"; src: string }
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

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const match = /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname);
    if (match) return match[1];
  }
  return null;
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

function vimeoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const match = /^\/(?:video\/)?(\d+)/.exec(url.pathname);
  return match?.[1] ?? null;
}

export function resolveEmbed(urlValue: string | null | undefined, kind: string): EmbedResult {
  if (!urlValue) return { type: "none" };
  const url = safeUrl(urlValue);
  if (!url) return { type: "none" };

  if (kind === "video" || kind === "psychology") {
    const youtube = youtubeId(url);
    if (youtube) {
      return {
        type: "iframe",
        provider: "youtube",
        src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtube)}`,
      };
    }

    const aparat = aparatId(url);
    if (aparat) {
      return {
        type: "iframe",
        provider: "aparat",
        src: `https://www.aparat.com/video/video/embed/videohash/${encodeURIComponent(aparat)}/vt/frame`,
      };
    }

    const vimeo = vimeoId(url);
    if (vimeo) {
      return {
        type: "iframe",
        provider: "vimeo",
        src: `https://player.vimeo.com/video/${encodeURIComponent(vimeo)}`,
      };
    }

    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url.pathname)) {
      return { type: "video", src: url.toString() };
    }
  }

  return { type: "link", href: url.toString() };
}

export const CONTENT_KIND_LABELS = {
  video: "فیلم",
  text: "متن",
  psychology: "تست روان‌شناسی",
} as const;
