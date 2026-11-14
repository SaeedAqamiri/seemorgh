export type DailyChallenge = {
  key: string;
  question: string;
  answer: number;
};

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function fa(value: number): string {
  return value.toLocaleString("fa-IR", { useGrouping: false });
}

export function dailyChallengeFor(studentId: string, date: string): DailyChallenge {
  const seed = hash(`${studentId}:${date}:start-challenge`);
  const type = seed % 3;
  let a: number;
  let b: number;
  let answer: number;
  let question: string;

  if (type === 0) {
    a = 12 + (seed % 48);
    b = 11 + ((seed >>> 7) % 48);
    answer = a + b;
    question = `${fa(a)} + ${fa(b)} = ?`;
  } else if (type === 1) {
    a = 30 + (seed % 70);
    b = 5 + ((seed >>> 7) % Math.max(1, a - 1));
    answer = a - b;
    question = `${fa(a)} − ${fa(b)} = ?`;
  } else {
    a = 2 + (seed % 8);
    b = 2 + ((seed >>> 7) % 8);
    answer = a * b;
    question = `${fa(a)} × ${fa(b)} = ?`;
  }

  return { key: `${date}:${seed}`, question, answer };
}

export function normalizeChallengeAnswer(value: string): number | null {
  const normalized = value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[^\d-]/g, "");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}
