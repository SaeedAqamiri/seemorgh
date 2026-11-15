import type { PsychBand, PsychResultRule } from "@/db/schema";

export type PsychEditorDimension = {
  clientId: string;
  title: string;
  description: string;
  bands: PsychBand[];
};

export type PsychEditorOption = {
  clientId: string;
  body: string;
  scores: Record<string, number>;
};

export type PsychEditorQuestion = {
  clientId: string;
  body: string;
  options: PsychEditorOption[];
};

export type PsychEditorRule = {
  code: string;
  title: string;
  body: string;
};

export type PsychEditorPayload = {
  title: string;
  description: string;
  dimensions: PsychEditorDimension[];
  questions: PsychEditorQuestion[];
  rules: PsychEditorRule[];
};

export type PsychScoringDimension = {
  id: string;
  title: string;
  description: string;
  bands: PsychBand[];
};

export type PsychDimensionResult = {
  dimensionId: string;
  title: string;
  description: string;
  score: number;
  bands: PsychBand[];
  band: PsychBand | null;
  bandLabel: string;
  bandCode: string;
  bandAnalysis: string;
};

export type PsychScoreResult = {
  scores: Record<string, number>;
  dimensions: PsychDimensionResult[];
  code: string;
  title: string;
  body: string;
  matchedRule: boolean;
};

export const PSYCH_STATUS_LABELS: Record<string, string> = {
  draft: "پیش‌نویس",
  published: "منتشرشده",
  archived: "آرشیو",
};

export const PSYCH_STATUS_CLASSES: Record<string, string> = {
  draft: "badge-warn",
  published: "badge-green",
  archived: "badge",
};

export function normalizePsychCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

export function findPsychBand(bands: PsychBand[], score: number): PsychBand | null {
  const sorted = [...bands].sort((first, second) => first.min - second.min);
  let match: PsychBand | null = sorted[0] ?? null;
  for (const band of sorted) {
    if (score >= band.min) match = band;
  }
  return match;
}

export function scorePsychAttempt(
  dimensions: PsychScoringDimension[],
  selectedOptionScores: (Record<string, number> | null | undefined)[],
  rules: PsychResultRule[] = [],
): PsychScoreResult {
  const scores: Record<string, number> = {};
  for (const dimension of dimensions) scores[dimension.id] = 0;

  for (const optionScores of selectedOptionScores) {
    if (!optionScores) continue;
    for (const [dimensionId, value] of Object.entries(optionScores)) {
      if (!(dimensionId in scores)) continue;
      scores[dimensionId] += Number(value) || 0;
    }
  }

  const dimensionResults: PsychDimensionResult[] = dimensions.map((dimension) => {
    const score = scores[dimension.id] ?? 0;
    const band = findPsychBand(dimension.bands, score);
    return {
      dimensionId: dimension.id,
      title: dimension.title,
      description: dimension.description,
      score,
      bands: [...dimension.bands].sort((first, second) => first.min - second.min),
      band,
      bandLabel: band?.label?.trim() ?? "",
      bandCode: band?.code?.trim() ?? "",
      bandAnalysis: band?.analysis?.trim() ?? "",
    };
  });

  const code = dimensionResults
    .map((dimension) => normalizePsychCode(dimension.bandCode))
    .filter(Boolean)
    .join("");
  const normalized = normalizePsychCode(code);
  const rule = normalized
    ? rules.find((entry) => normalizePsychCode(entry.code) === normalized)
    : undefined;

  const fallbackTitle = dimensionResults
    .map((dimension) => dimension.bandLabel)
    .filter(Boolean)
    .join(" / ");

  const fallbackBody = dimensionResults
    .map((dimension) => {
      const heading = `${dimension.title}: ${dimension.bandLabel || "بدون باند"} (امتیاز ${dimension.score.toLocaleString("fa-IR")})`;
      return dimension.bandAnalysis ? `${heading}\n${dimension.bandAnalysis}` : heading;
    })
    .join("\n\n");

  return {
    scores,
    dimensions: dimensionResults,
    code,
    title: rule?.title?.trim() || (code ? `نتیجه: ${code}` : fallbackTitle || "نتیجه"),
    body: rule?.body?.trim() || fallbackBody,
    matchedRule: Boolean(rule),
  };
}
