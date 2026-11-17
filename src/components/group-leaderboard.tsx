"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { FIELD_LABELS } from "@/lib/subjects";
import type {
  GroupLeaderboard,
  GroupLeaderboardBundle,
  LeaderboardEntry,
  LeaderboardScope,
} from "@/lib/group-performance";

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

function initial(name: string): string {
  return name.trim().charAt(0) || "؟";
}

function rankClass(rank: number): string {
  if (rank === 1) return "is-gold";
  if (rank === 2) return "is-silver";
  if (rank === 3) return "is-bronze";
  return "is-plain";
}

function RankBadge({ rank }: { rank: number }) {
  return <span className={`medal-badge ${rankClass(rank)}`}>{fa(rank)}</span>;
}

function PodiumEntry({
  entry,
  unit,
  place,
}: {
  entry: LeaderboardEntry;
  unit: string;
  place: number;
}) {
  return (
    <div className={`podium-card podium-${place}`}>
      <div className={`podium-rank ${rankClass(entry.rank)}`}>{fa(entry.rank)}</div>
      <div className="podium-avatar">{initial(entry.name)}</div>
      <div className="podium-name">{entry.name}</div>
      <div className="podium-count">
        {fa(entry.count)} <small>{unit}</small>
      </div>
    </div>
  );
}

function Podium({ board }: { board: GroupLeaderboard }) {
  const top = board.overall.top;
  if (top.length === 0) {
    return (
      <div className="empty">
        هنوز کسی در دروس {board.scope === "general" ? "عمومی" : "اختصاصی"} فعالیتی ثبت نکرده
        است. اولین قهرمان را بشوید!
      </div>
    );
  }
  const ordered = [...top].sort((a, b) => a.rank - b.rank);
  return (
    <div className="lb-podium">
      {ordered.map((entry) => (
        <PodiumEntry key={entry.studentId} entry={entry} unit={board.metricUnit} place={entry.rank} />
      ))}
    </div>
  );
}

function ChampionCard({
  subject,
  board,
  compact,
}: {
  subject: GroupLeaderboard["subjects"][number];
  board: GroupLeaderboard;
  compact?: boolean;
}) {
  const champion = subject.champion;
  const viewer = subject.viewer;
  const max = Math.max(
    champion?.count ?? 0,
    viewer?.count ?? 0,
    viewer?.average ?? 0,
  );
  const pct = (value: number) => (max === 0 ? 0 : Math.round((value / max) * 100));

  if (!champion && (!viewer || viewer.count === 0)) return null;

  return (
    <div
      className={`champ-card${viewer && viewer.rank === 1 ? " is-you-champ" : ""}`}
      style={{ borderTopColor: subject.color }}
    >
      <div className="champ-head">
        <span className="champ-dot" style={{ background: subject.color }} />
        <strong>{subject.title}</strong>
        <span className="champ-unit">قهرمان: {board.metricUnit}</span>
      </div>

      {champion ? (
        <div className="champ-winner">
          <RankBadge rank={champion.rank} />
          <span className="champ-avatar" style={{ background: subject.color }}>
            {initial(champion.name)}
          </span>
          <span className="champ-name">{champion.name}</span>
          <span className="champ-count">
            {fa(champion.count)} <small>{board.metricUnit}</small>
          </span>
        </div>
      ) : (
        <div className="champ-empty">هنوز قهرمانی ندارد</div>
      )}

      {champion && subject.top.length > 1 && !compact ? (
        <div className="champ-runners">
          {subject.top.slice(1).map((entry) => (
            <span key={entry.studentId} className="champ-runner">
              <RankBadge rank={entry.rank} /> {entry.name}
              <b>{fa(entry.count)}</b>
            </span>
          ))}
        </div>
      ) : null}

      {viewer ? (
        <div className="champ-you">
          <div className="champ-you-head">
            <span>
              رتبه شما: <b>{fa(viewer.rank)}</b> از {fa(viewer.memberCount)}
            </span>
            <span className="muted">
              {fa(viewer.count)} {board.metricUnit} · میانگین {fa(viewer.average)}
            </span>
          </div>
          <div className="lb-bar" aria-hidden>
            <span className="lb-bar-fill is-you" style={{ width: `${pct(viewer.count)}%` }} />
            <span className="lb-bar-avg" style={{ insetInlineStart: `${pct(viewer.average)}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function GroupLeaderboardView({
  bundle,
  viewerName,
  rangeLabel,
  variant = "full",
}: {
  bundle: GroupLeaderboardBundle;
  viewerName?: string;
  rangeLabel: string;
  variant?: "full" | "compact";
}) {
  const [scope, setScope] = useState<LeaderboardScope>("specialized");
  const board = scope === "general" ? bundle.general : bundle.specialized;
  const compact = variant === "compact";

  const subjects = useMemo(
    () => board.subjects.filter((subject) => subject.champion || (subject.viewer?.count ?? 0) > 0),
    [board],
  );

  const viewer = board.overall.viewer;

  return (
    <div className={`lb-wrap${compact ? " is-compact" : ""}`}>
      <div className="lb-hero" style={{ "--group-color": bundle.group.color } as CSSProperties}>
        <div className="lb-hero-main">
          <div className="lb-hero-emoji">{bundle.group.emoji}</div>
          <div>
            <div className="lb-hero-title">
              قهرمانان {bundle.group.name}
            </div>
            <small>
              {FIELD_LABELS[bundle.group.field] ?? bundle.group.field} ·{" "}
              {fa(board.memberCount)} دانش‌آموز · {board.metricLabel} · {rangeLabel}
            </small>
          </div>
        </div>

        <div className="lb-tabs" role="tablist" aria-label="نوع دروس">
          <button
            type="button"
            role="tab"
            aria-selected={scope === "specialized"}
            className={`lb-tab${scope === "specialized" ? " is-active" : ""}`}
            onClick={() => setScope("specialized")}
          >
            اختصاصی
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "general"}
            className={`lb-tab${scope === "general" ? " is-active" : ""}`}
            onClick={() => setScope("general")}
          >
            عمومی
          </button>
        </div>
      </div>

      {viewer ? (
        <div className="lb-viewer-badge">
          <span className="lb-viewer-avatar">{initial(viewer.name)}</span>
          <span>
            {viewerName ?? "شما"} در قهرمان‌قهرمانانِ {board.metricLabel}:{" "}
            <b>رتبه {fa(viewer.rank)} از {fa(viewer.memberCount)}</b>
          </span>
          <span className="lb-viewer-stat">
            {fa(viewer.count)} {board.metricUnit} · جلوتر از {fa(viewer.aheadPercent)}٪ گروه
          </span>
        </div>
      ) : null}

      <div className="lb-section">
        <div className="lb-section-head">
          <h3>قهرمان قهرمانان</h3>
          <small>مجموع {board.metricLabel} در همهٔ دروس این بخش</small>
        </div>
        <Podium board={board} />
      </div>

      <div className="lb-section">
        <div className="lb-section-head">
          <h3>قهرمان هر درس</h3>
          <small>{fa(subjects.length)} درس فعال</small>
        </div>
        {subjects.length === 0 ? (
          <div className="empty">در این بازه و این بخش فعالیتی ثبت نشده است.</div>
        ) : (
          <div className="lb-grid">
            {subjects.map((subject) => (
              <ChampionCard
                key={subject.subjectId}
                subject={subject}
                board={board}
                compact={compact}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
