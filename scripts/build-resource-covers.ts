// Builds local cover assets for the resource pool + personal resources.
// Real covers are matched from Ketabrah; everything else gets a Flux artwork
// background with a Persian title panel composed by sharp.
//
// Usage:
//   bunx tsx scripts/build-resource-covers.ts --group="مدرسه علامه حلی"
//   bunx tsx scripts/build-resource-covers.ts
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data", "example");
const COVER_DIR = path.join(ROOT, "public", "media", "resources");
const BACKGROUND_DIR = path.join(ROOT, ".data", "cover-backgrounds");
const MAPPING_FILE = path.join(ROOT, "data", "resource-covers.json");
const REVIEW_FILE = path.join(ROOT, "reports", "resource-covers-review.html");
const FLUX_URL = process.env.FLUX_URL ?? "http://172.16.20.15:8090";

const args = process.argv.slice(2);
const GROUP = args.find((arg) => arg.startsWith("--group="))?.split("=")[1] ?? "";
const SKIP_REAL = args.includes("--skip-real");
const SKIP_FLUX = args.includes("--skip-flux");
const LIMIT = Number(args.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 0);

const PUBLISHERS = ["خیلی سبز", "گاج", "مبتکران", "الگو", "مهروماه", "قلم چی", "سنجش"];
const PUBLISHER_COLORS: Record<string, string> = {
  "خیلی سبز": "#15803d",
  گاج: "#1d4ed8",
  مبتکران: "#b45309",
  الگو: "#7c3aed",
  مهروماه: "#be123c",
  "قلم چی": "#0e7490",
  سنجش: "#475569",
};

type JsonRow = Record<string, any>;

type Book = {
  key: string;
  title: string;
  subject: string;
  subjectId: string;
  grade: string;
  publisher: string;
  unitType: string;
  fields: string[];
  poolIds: string[];
  resourceIds: string[];
  real?: {
    file: string;
    source: "ketabrah";
    sourceUrl: string;
    sourceTitle: string;
  };
};

function sha(value: string, length = 16): string {
  return createHash("sha1").update(value).digest("hex").slice(0, length);
}

function compact(value: string): string {
  return value
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function normalizePublisher(value: string): string {
  return compact(value.replace(/^انتشارات\s*/u, ""));
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&zwnj;/g, "\u200c");
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function titleGrades(title: string): string[] {
  const grades: string[] = [];
  if (/(?<!از)دهم/u.test(title)) grades.push("دهم");
  if (/یازدهم/u.test(title)) grades.push("یازدهم");
  if (/دوازدهم/u.test(title)) grades.push("دوازدهم");
  return grades;
}

function gradeOfTitle(title: string): string | null {
  const grades = titleGrades(title);
  return grades.length === 1 ? grades[0] : null;
}

function publisherOfTitle(title: string): string | null {
  return PUBLISHERS.find((publisher) => title.includes(publisher)) ?? null;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*—\s*(تست\s*)?(?:خیلی سبز|گاج|مبتکران|الگو|مهروماه|قلم چی|سنجش)\s*$/u, "")
    .replace(/\s*—\s*تمرین تشریحی\s*$/u, "")
    .trim();
}

function subjectAliases(subject: string): string[] {
  if (subject === "ادبیات فارسی") return ["ادبیات", "فارسی"];
  if (subject === "دین و زندگی") return ["دین", "زندگی"];
  if (subject === "زبان انگلیسی") return ["زبان", "انگلیسی"];
  if (subject === "زیست‌شناسی") return ["زیست"];
  return [subject];
}

function mainTitle(title: string): string {
  return title.split(/\s+-\s+رشته/u)[0] ?? title;
}

function matchesSubject(title: string, subject: string): boolean {
  const haystack = compact(mainTitle(title));
  if (subject === "ادبیات فارسی") return haystack.includes("فارسی") || haystack.includes("ادبیات");
  if (subject === "دین و زندگی") return haystack.includes("دین") && haystack.includes("زندگی");
  if (subject === "زبان انگلیسی") return haystack.includes("انگلیسی");
  if (subject === "ریاضی" && haystack.includes("آمار")) return false;
  return subjectAliases(subject).every((token) => haystack.includes(compact(token)));
}

function matchesPublisher(cardPublisher: string, target: string): boolean {
  const card = normalizePublisher(cardPublisher);
  const wanted = normalizePublisher(target);
  if (!wanted) return false;
  if (wanted === "قلمچی") return card.includes("قلمچی") || card.includes("کانون");
  return card.includes(wanted);
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(name: string): Promise<JsonRow[]> {
  return JSON.parse(await readFile(path.join(DATA_DIR, `${name}.json`), "utf8")) as JsonRow[];
}

type Candidate = {
  title: string;
  publisher: string;
  image: string;
  url: string;
};

function extractCards(html: string): Candidate[] {
  const cards: Candidate[] = [];
  const blocks = html.split('<div class="book-card">').slice(1);
  for (const block of blocks) {
    const titleHtml = block.match(/<h3>([\s\S]*?)<\/h3>/)?.[1];
    const image = block.match(/<img[^>]+src="([^"]+)"/)?.[1];
    const publisher = block.match(/<span>([^<]*انتشارات[^<]*)<\/span>/)?.[1];
    const link = block.match(/<a[^>]+href="(\/book\/[^"]+)"/)?.[1];
    if (!titleHtml || !image || !publisher) continue;
    const title = stripTags(titleHtml).replace(/^کتاب\s+/u, "");
    if (!title) continue;
    cards.push({
      title,
      publisher: stripTags(publisher),
      image,
      url: link ? `https://www.ketabrah.ir${link}` : "",
    });
  }
  return cards;
}

function scoreCandidate(card: Candidate, book: Book): number {
  if (!matchesPublisher(card.publisher, book.publisher)) return -1;
  if (!matchesSubject(card.title, book.subject)) return -1;
  const cardGrades = titleGrades(card.title);
  if (book.grade && !cardGrades.includes(book.grade)) return -1;
  if (cardGrades.length > 1) return -1;
  const fieldWords = ["انسانی", "ریاضی", "تجربی"].filter((word) => card.title.includes(word));
  if (book.fields.length >= 4 && fieldWords.length > 0) {
    if (fieldWords.includes("انسانی")) return -1;
    if (fieldWords.includes("ریاضی") && !fieldWords.includes("تجربی")) return -1;
  }
  if (book.subject === "ریاضی" && /گسسته|هندسه|حسابان|آمار/u.test(card.title)) return -1;
  if (/جامع|پاسخ|جلد دوم|درسنامه/iu.test(card.title)) return -1;
  if (book.unitType === "test" && /شب امتحان|جیبی|ماجرای بیست|گام به گام/iu.test(card.title)) return -1;
  let score = 10;
  score += book.grade ? 5 : 0;
  if (book.unitType === "test") {
    if (/پرسش|چهار\s*گزین|چهارگزینه|تست|بانک/iu.test(card.title)) score += 5;
    else if (/جامع/iu.test(card.title)) score += 2;
    if (/شب امتحان|جیبی/iu.test(card.title)) score -= 4;
  } else if (/امتحان|کار|تمرین|گام به گام|درسنامه/iu.test(card.title)) {
    score += 5;
  }
  if (book.grade && new RegExp(`پایه\\s*${book.grade}`).test(card.title)) score += 1;
  return score;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchRealCovers(book: Book): Promise<Candidate | null> {
  const queries = [
    `${book.subject} ${book.grade} ${book.publisher}`,
    `${subjectAliases(book.subject)[0]} ${book.grade} ${book.publisher}`,
  ];
  const seen = new Map<string, Candidate>();
  for (const query of queries) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await sleep(250);
        const response = await fetch(
          `https://www.ketabrah.ir/search?q=${encodeURIComponent(query)}`,
          {
            headers: { "user-agent": "Mozilla/5.0 (Seemorgh cover asset builder)" },
            signal: AbortSignal.timeout(30_000),
          },
        );
        if (!response.ok) {
          if (attempt === 0) await sleep(1500);
          continue;
        }
        const html = await response.text();
        for (const card of extractCards(html)) {
          const key = `${card.title}|${card.image}`;
          if (!seen.has(key)) seen.set(key, card);
        }
        break;
      } catch {
        if (attempt === 0) await sleep(1500);
      }
    }
  }
  let best: Candidate | null = null;
  let bestScore = 0;
  for (const card of seen.values()) {
    const score = scoreCandidate(card, book);
    if (score > bestScore) {
      best = card;
      bestScore = score;
    }
  }
  if (bestScore < 18) {
    console.log(`  real miss: ${book.title} (candidates=${seen.size}, best=${bestScore})`);
    return null;
  }
  return best;
}

async function downloadRealCover(book: Book, card: Candidate): Promise<Book["real"] | null> {
  const large = card.image.replace("/img/s/", "/img/l/");
  for (const url of [large, card.image]) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (Seemorgh cover asset builder)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) continue;
      const input = Buffer.from(await response.arrayBuffer());
      const meta = await sharp(input).metadata();
      if (!meta.width || !meta.height || meta.width < 250) continue;
      const slug = `${sha(book.key, 20)}.webp`;
      await sharp(input)
        .rotate()
        .resize(600, 800, { fit: "contain", background: "#ffffff" })
        .webp({ quality: 86 })
        .toFile(path.join(COVER_DIR, slug));
      return {
        file: `/media/resources/${slug}`,
        source: "ketabrah",
        sourceUrl: card.url,
        sourceTitle: card.title,
      };
    } catch {
      // try the smaller image / next candidate
    }
  }
  return null;
}

function wrapTitle(title: string, maxChars = 24, maxLines = 3): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[kept.length - 1] = `${kept[kept.length - 1].slice(0, Math.max(0, maxChars - 1))}…`;
    return kept;
  }
  return lines;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PROCESS_PALETTES = [
  ["#0f766e", "#0e7490", "#1e3a8a"],
  ["#7c2d12", "#b45309", "#f59e0b"],
  ["#4c1d95", "#6d28d9", "#a78bfa"],
  ["#831843", "#be123c", "#fb7185"],
  ["#064e3b", "#047857", "#34d399"],
  ["#1e3a8a", "#2563eb", "#60a5fa"],
  ["#374151", "#475569", "#94a3b8"],
];

function proceduralBackground(book: Book): Promise<Buffer> {
  const palette = PROCESS_PALETTES[parseInt(sha(`${book.subject}|${book.grade}`, 6), 16) % PROCESS_PALETTES.length];
  const seed = parseInt(sha(`${book.subject}|${book.grade}`, 8), 16);
  const circles = Array.from({ length: 5 }, (_, index) => {
    const x = 80 + ((seed >> (index * 3)) % 600);
    const y = 120 + ((seed >> (index * 4)) % 780);
    const r = 80 + ((seed >> (index * 2)) % 180);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" fill-opacity="0.055"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${palette[0]}"/><stop offset="0.55" stop-color="${palette[1]}"/><stop offset="1" stop-color="${palette[2]}"/>
      </linearGradient>
      <pattern id="grid" width="46" height="46" patternUnits="userSpaceOnUse">
        <path d="M 46 0 L 0 0 0 46" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="768" height="1024" fill="url(#g)"/>
    <rect width="768" height="1024" fill="url(#grid)"/>
    ${circles}
    <path d="M -80 760 C 160 640, 320 900, 520 700 S 820 620, 900 780" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="3"/>
    <path d="M -60 840 C 180 700, 360 980, 560 760 S 840 700, 920 860" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>
    <circle cx="620" cy="220" r="110" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="3"/>
    <circle cx="620" cy="220" r="74" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>
    <rect x="64" y="120" width="54" height="54" rx="12" fill="#ffffff" fill-opacity="0.1"/>
    <rect x="132" y="120" width="24" height="54" rx="8" fill="#ffffff" fill-opacity="0.06"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function ensureBackground(book: Book): Promise<Buffer> {
  const key = `${book.subject}|${book.grade}`;
  const file = path.join(BACKGROUND_DIR, `${sha(key, 16)}.png`);
  if (await exists(file)) return readFile(file);
  await mkdir(BACKGROUND_DIR, { recursive: true });
  if (SKIP_FLUX) {
    const fallback = await proceduralBackground(book);
    await writeFile(file, fallback);
    return fallback;
  }
  const prompt =
    `Vertical educational test-prep book cover background artwork, subject: ${book.subject}, ` +
    `grade: ${book.grade}, abstract geometric study motifs, premium series design, ` +
    `clean composition, soft lighting, rich color palette, high detail, no text, no letters, ` +
    `no typography, no words, no logos, no watermark, no people, no faces, no hands`;
  const negative =
    "text, letters, words, typography, logo, watermark, human, face, hands, low quality, blurry, cropped, frame";
  try {
    const response = await fetch(`${FLUX_URL}/v1/generate?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt,
        negative,
        width: 512,
        height: 640,
        steps: 8,
        seed: parseInt(sha(key, 8), 16) % 2_000_000_000,
        filename_prefix: `coverbg-${sha(key, 8)}`,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`flux ${response.status}`);
    const job = (await response.json()) as { image_url?: string };
    if (!job.image_url) throw new Error("flux returned no image");
    const image = await fetch(`${FLUX_URL}${job.image_url}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!image.ok) throw new Error(`flux image ${image.status}`);
    const buffer = Buffer.from(await image.arrayBuffer());
    await writeFile(file, buffer);
    console.log(`  flux background: ${book.subject} ${book.grade}`);
    return buffer;
  } catch (error) {
    console.warn(`  flux failed for ${book.subject} ${book.grade}: ${(error as Error).message}`);
    const fallback = await proceduralBackground(book);
    await writeFile(file, fallback);
    return fallback;
  }
}

async function composeGeneratedCover(book: Book): Promise<string> {
  const background = await ensureBackground(book);
  const title = cleanTitle(book.title);
  const lines = wrapTitle(title, title.length > 30 ? 20 : 24, 3);
  const fontSize = lines.length >= 3 ? 34 : lines.length === 2 ? 40 : 46;
  const accent = PUBLISHER_COLORS[book.publisher] ?? "#0f766e";
  const lineHeight = Math.round(fontSize * 1.28);
  const panelHeight = 210 + (lines.length - 1) * lineHeight;
  const panelTop = 800 - panelHeight - 40;
  const titleStart = panelTop + 78;
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="300" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.35" stop-color="#000000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
    <rect width="600" height="800" fill="url(#shade)"/>
    <rect x="40" y="${panelTop}" width="520" height="${panelHeight}" rx="22" fill="#ffffff" fill-opacity="0.94"/>
    <rect x="40" y="${panelTop}" width="8" height="${panelHeight}" rx="4" fill="${accent}"/>
    <text x="300" y="${panelTop + 38}" text-anchor="middle" direction="rtl"
      font-family="Vazirmatn, sans-serif" font-size="22" fill="${accent}" font-weight="700">${escapeXml(book.subject)}</text>
    <text x="300" y="${titleStart}" text-anchor="middle" direction="rtl"
      font-family="Vazirmatn, sans-serif" font-size="${fontSize}" font-weight="800" fill="#0f172a">${tspans}</text>
    <text x="300" y="${panelTop + panelHeight - 58}" text-anchor="middle" direction="rtl"
      font-family="Vazirmatn, sans-serif" font-size="26" fill="#334155">${escapeXml(book.publisher || "منبع شخصی")} · پایه ${escapeXml(book.grade)}</text>
    <text x="300" y="${panelTop + panelHeight - 26}" text-anchor="middle" direction="rtl"
      font-family="Vazirmatn, sans-serif" font-size="18" fill="#64748b">بانک تست و مرور — سیمرغ</text>
  </svg>`;
  const slug = `${sha(book.key, 20)}.webp`;
  await sharp(background)
    .resize(600, 800, { fit: "cover" })
    .composite([{ input: Buffer.from(overlay) }])
    .webp({ quality: 84 })
    .toFile(path.join(COVER_DIR, slug));
  return `/media/resources/${slug}`;
}

async function buildBooks(): Promise<Book[]> {
  const [subjects, pool, resources, students, groups] = await Promise.all([
    readJson("subjects"),
    readJson("resource_pool"),
    readJson("resources"),
    readJson("students"),
    readJson("student_groups"),
  ]);
  const subjectTitle = new Map(subjects.map((row) => [row.id, row.title as string]));
  const groupIds = GROUP
    ? new Set(
        groups
          .filter((group) => String(group.name).includes(GROUP))
          .map((group) => String(group.id)),
      )
    : null;
  const allowedStudents = groupIds
    ? new Set(
        students
          .filter((student) => groupIds.has(String(student.groupId)))
          .map((student) => student.id as string),
      )
    : null;

  const books = new Map<string, Book>();
  const poolByTitle = new Map<string, JsonRow>();
  for (const row of pool) {
    if (allowedStudents) continue;
    const title = String(row.title ?? "");
    poolByTitle.set(title, row);
    const subject = subjectTitle.get(row.subjectId) ?? "درس";
    const key = `pool|${subject}|${row.grade ?? ""}|${row.publisher ?? ""}|${title}`;
    books.set(key, {
      key,
      title,
      subject,
      subjectId: String(row.subjectId),
      grade: String(row.grade ?? ""),
      publisher: String(row.publisher ?? ""),
      unitType: String(row.unitType ?? "test"),
      fields: (subjects.find((subjectRow) => subjectRow.id === row.subjectId)?.fieldsJson ?? []) as string[],
      poolIds: [String(row.id)],
      resourceIds: [],
    });
  }

  for (const row of resources) {
    if (allowedStudents && !allowedStudents.has(String(row.studentId))) continue;
    const title = String(row.title ?? "");
    const subject = subjectTitle.get(row.subjectId) ?? "درس";
    const poolRow = poolByTitle.get(title);
    if (poolRow) {
      const key = `pool|${subject}|${poolRow.grade ?? ""}|${poolRow.publisher ?? ""}|${title}`;
      const book = books.get(key);
      if (book) book.resourceIds.push(String(row.id));
      continue;
    }
    const grade = gradeOfTitle(title) ?? "دوازدهم";
    const publisher = publisherOfTitle(title) ?? "منبع شخصی";
    const key = `personal|${subject}|${grade}|${publisher}|${title}`;
    const existing = books.get(key);
    if (existing) {
      existing.resourceIds.push(String(row.id));
    } else {
      books.set(key, {
        key,
        title,
        subject,
        subjectId: String(row.subjectId),
        grade,
        publisher,
        unitType: String(row.unitType ?? "test"),
        fields: (subjects.find((subjectRow) => subjectRow.id === row.subjectId)?.fieldsJson ?? []) as string[],
        poolIds: [],
        resourceIds: [String(row.id)],
      });
    }
  }

  const list = [...books.values()];
  return LIMIT > 0 ? list.slice(0, LIMIT) : list;
}

async function main() {
  await mkdir(COVER_DIR, { recursive: true });
  await mkdir(BACKGROUND_DIR, { recursive: true });
  await mkdir(path.dirname(REVIEW_FILE), { recursive: true });
  const books = await buildBooks();
  console.log(`books: ${books.length}${GROUP ? ` (group: ${GROUP})` : ""}`);

  let realCount = 0;
  for (const [index, book] of books.entries()) {
    if (!SKIP_REAL) {
      const candidate = await searchRealCovers(book);
      if (candidate) {
        const real = await downloadRealCover(book, candidate);
        if (real) {
          book.real = real;
          realCount += 1;
        }
      }
    }
    if ((index + 1) % 25 === 0) {
      console.log(`  real search ${index + 1}/${books.length} (matched ${realCount})`);
    }
  }
  console.log(`real covers: ${realCount}/${books.length}`);

  let generated = 0;
  for (const [index, book] of books.entries()) {
    if (book.real) continue;
    await composeGeneratedCover(book);
    generated += 1;
    if ((index + 1) % 20 === 0) {
      console.log(`  generated covers ${index + 1}/${books.length}`);
    }
  }
  console.log(`generated covers: ${generated}`);

  const mapping: JsonRow = {
    version: 1,
    generatedAt: new Date().toISOString(),
    group: GROUP || null,
    books: Object.fromEntries(
      books.map((book) => [
        book.key,
        {
          title: book.title,
          subject: book.subject,
          grade: book.grade,
          publisher: book.publisher,
          unitType: book.unitType,
          coverUrl: book.real?.file ?? `/media/resources/${sha(book.key, 20)}.webp`,
          coverSource: book.real?.source ?? "flux",
          sourceUrl: book.real?.sourceUrl ?? null,
          sourceTitle: book.real?.sourceTitle ?? null,
          poolIds: book.poolIds,
          resourceIds: book.resourceIds,
        },
      ]),
    ),
  };
  await writeFile(MAPPING_FILE, `${JSON.stringify(mapping, null, 2)}\n`, "utf8");

  const rows = books
    .map((book) => {
      const cover = mapping.books[book.key];
      return `<figure>
        <img src="../public${cover.coverUrl}" alt="${escapeXml(book.title)}" loading="lazy" />
        <figcaption>
          <strong>${escapeXml(book.title)}</strong>
          <small>${escapeXml(book.subject)} · ${escapeXml(book.grade)} · ${escapeXml(book.publisher)}</small>
          <span class="source ${cover.coverSource === "ketabrah" ? "real" : "gen"}">${cover.coverSource}</span>
          ${cover.sourceUrl ? `<a href="${cover.sourceUrl}" target="_blank" rel="noreferrer">منبع</a>` : ""}
        </figcaption>
      </figure>`;
    })
    .join("\n");
  const review = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
    <title>بازبینی جلد منابع</title>
    <style>
      body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:24px}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px}
      figure{margin:0;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}
      img{width:100%;aspect-ratio:3/4;object-fit:contain;background:#fff;border-radius:8px}
      figcaption{display:flex;flex-direction:column;gap:4px;font-size:12px}
      figcaption strong{font-size:13px} figcaption small{color:#64748b}
      .source{align-self:flex-start;padding:2px 8px;border-radius:999px;font-size:11px}
      .source.real{background:#dcfce7;color:#166534}.source.gen{background:#e0e7ff;color:#3730a3}
      header{display:flex;gap:16px;align-items:baseline;margin-bottom:20px}
    </style></head><body>
    <header><h1>بازبینی جلد منابع</h1><span>${books.length} کتاب · ${realCount} جلد واقعی · ${generated} جلد تولیدی</span></header>
    <div class="grid">${rows}</div></body></html>`;
  await writeFile(REVIEW_FILE, review, "utf8");
  console.log(`mapping: ${MAPPING_FILE}`);
  console.log(`review:  ${REVIEW_FILE}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
