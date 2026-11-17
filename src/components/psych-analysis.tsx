import type { PsychAiAnalysis, PsychProfileSummaryData } from "@/db/schema";

const LEVEL_BADGE: Record<string, string> = {
  low: "badge-warn",
  mid: "badge",
  high: "badge-green",
};

const LEVEL_LABEL: Record<string, string> = {
  low: "کم",
  mid: "متوسط",
  high: "بالا",
};

export function PsychAiAnalysisView({ analysis }: { analysis: PsychAiAnalysis }) {
  return (
    <div className="stack" style={{ gap: "0.55rem" }}>
      {analysis.title ? <strong style={{ fontSize: "0.92rem" }}>{analysis.title}</strong> : null}
      {analysis.summary ? (
        <p style={{ margin: 0, fontSize: "0.86rem", lineHeight: 1.9 }}>{analysis.summary}</p>
      ) : null}
      {analysis.traits.length > 0 ? (
        <div className="stack" style={{ gap: "0.3rem" }}>
          {analysis.traits.map((trait) => (
            <div
              key={trait.title}
              className="row"
              style={{ gap: "0.45rem", alignItems: "baseline", flexWrap: "wrap" }}
            >
              <strong style={{ fontSize: "0.82rem", minWidth: "150px" }}>{trait.title}</strong>
              <span className="badge" style={{ fontSize: "0.72rem" }}>
                {trait.level}
              </span>
              {trait.note ? (
                <span className="muted" style={{ fontSize: "0.78rem", lineHeight: 1.7 }}>
                  {trait.note}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {analysis.strengths.length > 0 ? (
        <div>
          <strong style={{ fontSize: "0.8rem" }}>نقاط قوت</strong>
          <div className="row" style={{ flexWrap: "wrap", gap: "0.3rem", marginTop: "0.3rem" }}>
            {analysis.strengths.map((item) => (
              <span key={item} className="badge badge-green" style={{ fontSize: "0.75rem" }}>
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {analysis.cautions.length > 0 ? (
        <div>
          <strong style={{ fontSize: "0.8rem" }}>نکات نیازمند توجه</strong>
          <div className="row" style={{ flexWrap: "wrap", gap: "0.3rem", marginTop: "0.3rem" }}>
            {analysis.cautions.map((item) => (
              <span key={item} className="badge badge-warn" style={{ fontSize: "0.75rem" }}>
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {analysis.recommendations.length > 0 ? (
        <div>
          <strong style={{ fontSize: "0.8rem" }}>توصیه‌ها</strong>
          <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem", fontSize: "0.82rem", lineHeight: 1.9 }}>
            {analysis.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function PsychProfileSummaryView({ data }: { data: PsychProfileSummaryData }) {
  return (
    <div className="stack" style={{ gap: "0.7rem" }}>
      <p style={{ margin: 0, lineHeight: 1.95, fontSize: "0.9rem" }}>{data.summary}</p>
      <div className="grid grid-2" style={{ gap: "0.8rem" }}>
        {data.personalityTraits.length > 0 ? (
          <div>
            <strong style={{ fontSize: "0.82rem" }}>ویژگی‌های شخصیتی</strong>
            <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem", fontSize: "0.8rem", lineHeight: 1.9 }}>
              {data.personalityTraits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {data.academicTraits.length > 0 ? (
          <div>
            <strong style={{ fontSize: "0.82rem" }}>ویژگی‌های تحصیلی</strong>
            <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem", fontSize: "0.8rem", lineHeight: 1.9 }}>
              {data.academicTraits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {data.strengths.length > 0 ? (
          <div>
            <strong style={{ fontSize: "0.82rem" }}>نقاط قوت</strong>
            <div className="row" style={{ flexWrap: "wrap", gap: "0.3rem", marginTop: "0.3rem" }}>
              {data.strengths.map((item) => (
                <span key={item} className="badge badge-green" style={{ fontSize: "0.74rem" }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {data.weaknesses.length > 0 ? (
          <div>
            <strong style={{ fontSize: "0.82rem" }}>نقاط ضعف / نیازمند توجه</strong>
            <div className="row" style={{ flexWrap: "wrap", gap: "0.3rem", marginTop: "0.3rem" }}>
              {data.weaknesses.map((item) => (
                <span key={item} className="badge badge-warn" style={{ fontSize: "0.74rem" }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {data.recommendations.length > 0 ? (
        <div>
          <strong style={{ fontSize: "0.82rem" }}>توصیه‌های پروفایل</strong>
          <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem", fontSize: "0.82rem", lineHeight: 1.9 }}>
            {data.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export { LEVEL_BADGE, LEVEL_LABEL };
