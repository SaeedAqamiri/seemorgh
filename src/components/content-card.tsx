import { CONTENT_KIND_LABELS, resolveEmbed } from "@/lib/embed";
import type { ContentItemView } from "@/lib/content";

export function ContentFrame({ item }: { item: ContentItemView }) {
  const embed = resolveEmbed(item.url, item.kind);

  if (embed.type === "iframe") {
    return (
      <div className="video-frame">
        <iframe
          src={embed.src}
          title={item.title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return null;
}

export function ContentCard({
  item,
  compact = false,
}: {
  item: ContentItemView;
  compact?: boolean;
}) {
  const embed = resolveEmbed(item.url, item.kind);
  const hasVideo = embed.type === "iframe";

  return (
    <div className="card" style={compact ? { boxShadow: "none" } : undefined}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: "0.3rem" }}>
            <span className="badge">{CONTENT_KIND_LABELS[item.kind]}</span>
            {item.subjectTitle ? <span className="badge">{item.subjectTitle}</span> : null}
            {item.resourceTitle ? (
              <span className="badge">
                {item.resourceTitle}
                {item.studentName ? ` — ${item.studentName}` : ""}
              </span>
            ) : null}
          </div>
          <h3 style={{ margin: "0.4rem 0 0.2rem" }}>{item.title}</h3>
          {item.body ? (
            <p className="muted" style={{ whiteSpace: "pre-wrap", margin: "0.3rem 0" }}>
              {item.body}
            </p>
          ) : null}
          {item.url && !hasVideo ? (
            <a href={item.url} target="_blank" rel="noreferrer noopener">
              مشاهده لینک
            </a>
          ) : null}
        </div>
      </div>

      {hasVideo ? (
        <div style={{ marginTop: "0.6rem" }}>
          <ContentFrame item={item} />
          {item.url ? (
            <small style={{ display: "block", marginTop: "0.25rem" }}>
              پخش داخل سایت؛ منبع: {new URL(item.url).hostname}
            </small>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
