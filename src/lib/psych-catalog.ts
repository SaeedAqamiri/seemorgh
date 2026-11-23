import type { PsychBand } from "@/db/schema";

export type PsychCategory = "academic" | "career" | "personal" | "wellbeing" | "general";

export type CatalogDimension = {
  key: string;
  title: string;
  description: string;
  trait: string;
  direction?: "positive" | "caution" | "neutral";
  lowLabel?: string;
  midLabel?: string;
  highLabel?: string;
  code?: { low?: string; mid?: string; high?: string };
  tip?: string;
};

export type PsychScale = "agreement" | "frequency" | "confidence" | "amount";

export type CatalogQuestion = {
  dimension: string;
  body: string;
  scale?: PsychScale;
};

export type CatalogTest = {
  key: string;
  title: string;
  category: PsychCategory;
  description: string;
  sourceUrl?: string;
  dimensions: CatalogDimension[];
  questions: CatalogQuestion[];
};

export const PSYCH_CATEGORY_LABELS: Record<PsychCategory, string> = {
  academic: "تحصیلی",
  career: "شغلی و استعداد",
  personal: "شخصیت و مهارت‌های فردی",
  wellbeing: "سلامت و تعادل",
  general: "عمومی",
};

export const PSYCH_CATEGORY_ORDER: PsychCategory[] = [
  "academic",
  "career",
  "personal",
  "wellbeing",
  "general",
];

export const PSYCH_SCALE_LABELS: Record<PsychScale, string[]> = {
  agreement: ["کاملاً مخالفم", "مخالفم", "نظری ندارم", "موافقم", "کاملاً موافقم"],
  frequency: ["هرگز", "به‌ندرت", "گاهی", "اغلب", "همیشه"],
  confidence: [
    "هیچ اطمینانی ندارم",
    "اطمینان کمی دارم",
    "نسبتاً مطمئنم",
    "مطمئنم",
    "کاملاً مطمئنم",
  ],
  amount: ["خیلی کم", "کم", "متوسط", "زیاد", "خیلی زیاد"],
};

const FREQUENCY_CUES =
  /(در یک ماه گذشته|هفته|شب‌ها|هر |هرگز|همیشه|اغلب|معمولاً|چند وقت|چند بار|وقتی|در طول|در میانه|تا آخرین لحظه|پشت گوش|موکول|عقب می‌اندازم|عقب می‌انداز|مقدمه‌چینی|به تعویق)/;
const AMOUNT_CUES = /(شدت|چقدر|میزان)/;
const CONFIDENCE_CUES = /(مطمئنم|می‌توانم|توانایی|قادرم|اطمینان دارم)/;

export function scaleForQuestion(body: string, explicit?: PsychScale): PsychScale {
  if (explicit) return explicit;
  if (CONFIDENCE_CUES.test(body)) return "confidence";
  if (AMOUNT_CUES.test(body)) return "amount";
  if (FREQUENCY_CUES.test(body)) return "frequency";
  return "agreement";
}

const LEVEL_LABELS: Record<"positive" | "caution" | "neutral", [string, string, string]> = {
  positive: ["ضعیف", "متوسط", "قوی"],
  caution: ["کم", "متوسط", "زیاد"],
  neutral: ["پایین", "متوسط", "بالا"],
};

function levelSentence(
  direction: "positive" | "caution" | "neutral",
  level: "low" | "mid" | "high",
): string {
  if (direction === "positive") {
    if (level === "low") return "در حال حاضر این ویژگی کمتر بروز می‌کند و می‌تواند فرصت رشد باشد.";
    if (level === "mid") return "در حد متعادل و قابل اتکاست.";
    return "این ویژگی از نقاط قوت توست.";
  }
  if (direction === "caution") {
    if (level === "low") return "سطح پایین این عامل، وضعیت مطلوبی است.";
    if (level === "mid") return "در حد متوسط است و گاهی می‌تواند روی عملکرد اثر بگذارد.";
    return "سطح بالا نشان می‌دهد باید برای مدیریت آن برنامه داشته باشی.";
  }
  if (level === "low") return "این گرایش در تو کمرنگ‌تر است.";
  if (level === "mid") return "این گرایش در تو متعادل است.";
  return "این گرایش در تو پررنگ‌تر است.";
}

export function bandsFor(dimension: CatalogDimension, questionCount: number): PsychBand[] {
  const direction = dimension.direction ?? "neutral";
  const labels = LEVEL_LABELS[direction];
  const max = Math.max(4, questionCount * 4);
  const lowMax = Math.max(1, Math.floor(max * 0.35));
  const midMax = Math.max(lowMax + 1, Math.floor(max * 0.65));

  const make = (level: "low" | "mid" | "high", min: number, maxValue: number | null): PsychBand => ({
    min,
    max: maxValue,
    label:
      level === "low"
        ? dimension.lowLabel ?? labels[0]
        : level === "mid"
          ? dimension.midLabel ?? labels[1]
          : dimension.highLabel ?? labels[2],
    code: dimension.code?.[level] ?? "",
    analysis: `${dimension.description} ${levelSentence(direction, level)}${
      dimension.tip ? ` ${dimension.tip}` : ""
    }`.trim(),
  });

  return [
    make("low", 0, lowMax),
    make("mid", lowMax + 1, midMax),
    make("high", midMax + 1, null),
  ];
}

export function optionsFor(scale: PsychScale = "agreement") {
  return PSYCH_SCALE_LABELS[scale].map((body, index) => ({
    body,
    scores: { __dimension__: index },
  }));
}

export const PSYCH_TEST_CATALOG: CatalogTest[] = [
  {
    key: "time-management",
    title: "مدیریت زمان و برنامه‌ریزی تحصیلی",
    category: "academic",
    sourceUrl: "https://www.psychologytoday.com/us/tests/career/time-management-skills-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون مدیریت زمان Psychology Today. میزان برنامه‌ریزی، پیگیری کارها و گرایش به اهمالکاری را می‌سنجد و برای تنظیم برنامه هفتگی دانش‌آموز به کار می‌رود. جای تشخیص تخصصی را نمی‌گیرد.",
    dimensions: [
      {
        key: "planning",
        title: "برنامه‌ریزی و اولویت‌بندی",
        description: "توانایی تبدیل هدف به برنامه روزانه و مشخص کردن اولویت‌ها.",
        trait: "conscientiousness",
        direction: "positive",
        tip: "هر شب سه اولویت اصلی فردا را روی کاغذ بنویس.",
      },
      {
        key: "follow_through",
        title: "پیگیری و پایان کار",
        description: "میزان پایبندی به برنامه و تمام کردن کارهای شروع‌شده.",
        trait: "conscientiousness",
        direction: "positive",
        tip: "کارهای بزرگ را به بلوک‌های ۲۵ تا ۴۵ دقیقه‌ای بشکن.",
      },
      {
        key: "procrastination",
        title: "اهمالکاری",
        description: "تمایل به عقب انداختن کارهای مهم تا نزدیک مهلت.",
        trait: "procrastination",
        direction: "caution",
        tip: "برای شروع، فقط پنج دقیقه اول کار را متعهد شو.",
      },
    ],
    questions: [
      { dimension: "planning", body: "قبل از شروع هفته، برنامه مطالعه روزهای آینده را می‌نویسم." },
      { dimension: "planning", body: "برای کارهای مهم، زمان مشخص و مهلت تعیین می‌کنم." },
      { dimension: "planning", body: "می‌توانم بگویم مهم‌ترین کار امروزم چیست." },
      { dimension: "follow_through", body: "کارهایی را که شروع می‌کنم معمولاً تا پایان می‌برم." },
      { dimension: "follow_through", body: "اگر برنامه‌ام به هم بریزد، دوباره آن را مرتب می‌کنم." },
      { dimension: "follow_through", body: "برای کارهای طولانی، مرحله‌های کوچک و قابل انجام تعریف می‌کنم." },
      { dimension: "procrastination", body: "مطالعه را تا نزدیک امتحان عقب می‌اندازم." },
      { dimension: "procrastination", body: "کارهای سخت را با کارهای بی‌اهمیت‌تر عوض می‌کنم." },
      { dimension: "procrastination", body: "شروع کردن درس خواندن برایم سخت‌تر از ادامه دادن آن است." },
    ],
  },
  {
    key: "procrastination",
    title: "اهمالکاری تحصیلی و شروع کردن",
    category: "academic",
    sourceUrl: "https://www.psychologytoday.com/us/tests/career/procrastination-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Procrastination Psychology Today. عوامل پشت تعویق کارها را بررسی می‌کند: بیزاری از کار، حواس‌پرتی و دشواری شروع. نتیجه برای طراحی جریمه‌ها و مشوق‌های برنامه‌ریزی استفاده می‌شود.",
    dimensions: [
      {
        key: "delay",
        title: "تعویق کارها",
        description: "میزان به تأخیر انداختن کارهای درسی و برنامه‌ها.",
        trait: "procrastination",
        direction: "caution",
        tip: "قانون دو دقیقه را امتحان کن: اگر کاری کمتر از دو دقیقه است، همین حالا انجامش بده.",
      },
      {
        key: "aversion",
        title: "بیزاری از تکلیف",
        description: "شدت حس ناخوشایند نسبت به کارهای سخت یا خسته‌کننده.",
        trait: "taskAversion",
        direction: "caution",
        tip: "کار را به کوچک‌ترین قدم ممکن تقسیم کن تا مقاومت اولیه کم شود.",
      },
      {
        key: "distraction",
        title: "حواس‌پرتی",
        description: "گرایش به پرش از کار اصلی به گوشی، شبکه اجتماعی یا کار دیگر.",
        trait: "focus",
        direction: "caution",
        tip: "در بلوک‌های مطالعه، گوشی را در اتاق دیگر بگذار.",
      },
    ],
    questions: [
      { dimension: "delay", body: "کارهای درسی را تا آخرین لحظه عقب می‌اندازم." },
      { dimension: "delay", body: "برای شروع تکالیف، بیشتر از حد لازم مقدمه‌چینی می‌کنم." },
      { dimension: "delay", body: "اغلب برنامه‌ام را به فردا موکول می‌کنم." },
      { dimension: "aversion", body: "درس‌های سخت را با بی‌حوصلگی و مقاومت شروع می‌کنم." },
      { dimension: "aversion", body: "فکر کردن به حجم کار باعث می‌شود کاملاً شروع نکنم." },
      { dimension: "aversion", body: "کارهای خسته‌کننده را دوست دارم پشت گوش بیندازم." },
      { dimension: "distraction", body: "در میانه مطالعه، گوشی یا شبکه اجتماعی من را از کار می‌کشد." },
      { dimension: "distraction", body: "برای فرار از درس، به کارهای بی‌ربط مشغول می‌شوم." },
    ],
  },
  {
    key: "test-anxiety",
    title: "اضطراب امتحان و عملکرد",
    category: "academic",
    sourceUrl: "https://www.psychologytoday.com/us/tests/personality/performance-anxiety-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Performance Anxiety Psychology Today. نگرانی ذهنی، واکنش‌های بدنی و اجتناب از موقعیت امتحان را می‌سنجد. نتیجه برای تنظیم سختی آزمون‌های تمرینی و افزودن تمرین آرام‌سازی به برنامه استفاده می‌شود.",
    dimensions: [
      {
        key: "worry",
        title: "نگرانی ذهنی",
        description: "افکار منفی و نگرانی درباره نتیجه امتحان.",
        trait: "anxiety",
        direction: "caution",
        tip: "پنج دقیقه قبل از آزمون، نگرانی‌ها را روی کاغذ خالی کن.",
      },
      {
        key: "physical",
        title: "واکنش بدنی",
        description: "علائم جسمی مثل تپش قلب، تعریق یا تنگی نفس در موقع امتحان.",
        trait: "anxiety",
        direction: "caution",
        tip: "تمرین تنفس ۴-۶ را در بلوک‌های تمرینی کوتاه بگنجان.",
      },
      {
        key: "avoidance",
        title: "اجتناب از آزمون",
        description: "تمایل به فرار از آزمون، دیر رسیدن یا نادیده گرفتن تمرین سنجش.",
        trait: "avoidance",
        direction: "caution",
        tip: "آزمون‌های کوچک و کم‌فشار را بیشتر تکرار کن تا حساسیت کم شود.",
      },
    ],
    questions: [
      { dimension: "worry", body: "قبل از امتحان نگرانم که نتیجه بدی بگیرم." },
      { dimension: "worry", body: "در جلسه امتحان، افکار منفی مزاحم تمرکزم می‌شوند." },
      { dimension: "worry", body: "بعد از امتحان زیاد به اشتباه‌هایم فکر می‌کنم." },
      { dimension: "physical", body: "قبل از آزمون قلبم تند می‌زند یا بدنم می‌لرزد." },
      { dimension: "physical", body: "در جلسه امتحان دهانم خشک می‌شود یا نفس‌ام تنگ می‌شود." },
      { dimension: "physical", body: "استرس امتحان خواب یا اشتهام را تحت تأثیر قرار می‌دهد." },
      { dimension: "avoidance", body: "ترجیح می‌دهم از آزمون‌های سخت دوری کنم." },
      { dimension: "avoidance", body: "تمرین آزمون را به بعد موکول می‌کنم چون اضطرابش را دوست ندارم." },
      { dimension: "avoidance", body: "وقتی امتحان نزدیک می‌شود، بیشتر به کارهای دیگر پناه می‌برم." },
    ],
  },
  {
    key: "study-habits",
    title: "عادت‌های مطالعه و تمرکز",
    category: "academic",
    sourceUrl: "https://www.psychologytoday.com/us/tests/personality/attention-span-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Attention Span و راهنماهای مطالعه مؤثر. تمرکز پایدار، یادداشت‌برداری، مرور و کیفیت محیط مطالعه را بررسی می‌کند و برای انتخاب طول بلوک‌های برنامه استفاده می‌شود.",
    dimensions: [
      {
        key: "focus",
        title: "تمرکز پایدار",
        description: "توانایی حفظ توجه روی یک کار در بازه‌های زمانی مشخص.",
        trait: "focus",
        direction: "positive",
        tip: "با بلوک‌های کوتاه شروع کن و هر هفته پنج دقیقه به آن اضافه کن.",
      },
      {
        key: "notes",
        title: "یادداشت‌برداری فعال",
        description: "میزان خلاصه‌کردن، سؤال‌سازی و سازمان‌دهی مطالب هنگام مطالعه.",
        trait: "conscientiousness",
        direction: "positive",
        tip: "بعد از هر بخش، سه نکته کلیدی را با جمله خودت بنویس.",
      },
      {
        key: "review",
        title: "مرور منظم",
        description: "عادت برگشتن به مطالب خوانده‌شده در فاصله‌های کوتاه.",
        trait: "conscientiousness",
        direction: "positive",
        tip: "مرور ۱۰ دقیقه‌ای روز بعد را جزء ثابت برنامه قرار بده.",
      },
      {
        key: "environment",
        title: "محیط مطالعه",
        description: "آرامش، نظم و مناسب بودن فضای مطالعه.",
        trait: "conscientiousness",
        direction: "positive",
        tip: "یک مکان ثابت و کم‌مزاحمت برای مطالعه انتخاب کن.",
      },
    ],
    questions: [
      { dimension: "focus", body: "می‌توانم حداقل ۲۵ دقیقه بدون وقفه روی یک درس تمرکز کنم." },
      { dimension: "focus", body: "در میانه مطالعه، ذهنم کمتر به موضوعات بی‌ربط می‌رود." },
      { dimension: "focus", body: "وقتی حواسم پرت می‌شود، سریع به کار برمی‌گردم." },
      { dimension: "notes", body: "هنگام مطالعه خلاصه یا یادداشت مفید می‌نویسم." },
      { dimension: "notes", body: "برای مطالب مهم سؤال می‌سازم و جوابشان را پیدا می‌کنم." },
      { dimension: "notes", body: "یادداشت‌هایم سازمان‌یافته و قابل مرور هستند." },
      { dimension: "review", body: "مطالب خوانده‌شده را در روزهای بعد مرور می‌کنم." },
      { dimension: "review", body: "قبل از امتحان، مرور برنامه‌ریزی‌شده دارم." },
      { dimension: "environment", body: "محل مطالعه‌ام آرام و کم‌مزاحمت است." },
      { dimension: "environment", body: "چیزهایی که حواسم را پرت می‌کنند از میز مطالعه دور می‌کنم." },
    ],
  },
  {
    key: "academic-motivation",
    title: "انگیزه تحصیلی",
    category: "academic",
    sourceUrl: "https://www.psychologytoday.com/us/tests/career/goal-setting-test",
    description:
      "نسخه کوتاه آموزشی با الهام از چارچوب انگیزه درونی و بیرونی و آزمون Goal-Setting Psychology Today. انگیزه درونی، انگیزه بیرونی و بی‌انگیزگی را می‌سنجد تا برنامه با مشوق‌های مناسب دانش‌آموز تنظیم شود.",
    dimensions: [
      {
        key: "intrinsic",
        title: "انگیزه درونی",
        description: "لذت بردن از یادگیری و کنجکاوی نسبت به موضوع‌ها.",
        trait: "motivation",
        direction: "positive",
        tip: "برای هر درس، یک بخش جالب یا کاربردی پیدا کن و آن را در برنامه برجسته کن.",
      },
      {
        key: "extrinsic",
        title: "انگیزه بیرونی",
        description: "میزان اثر نمره، تشویق، رقابت و پاداش بیرونی بر تلاش.",
        trait: "extrinsicMotivation",
        direction: "neutral",
        tip: "پاداش‌های کوچک و کوتاه‌مدت را به پایان بلوک‌های مطالعه گره بزن.",
      },
      {
        key: "amotivation",
        title: "بی‌انگیزگی",
        description: "احساس بی‌معنایی یا ناتوانی در پیدا کردن دلیل برای درس خواندن.",
        trait: "amotivation",
        direction: "caution",
        tip: "هدف‌های بزرگ را به نتیجه‌های کوچک و این‌هفته‌ای تبدیل کن.",
      },
    ],
    questions: [
      { dimension: "intrinsic", body: "از یادگیری موضوع‌های جدید لذت می‌برم." },
      { dimension: "intrinsic", body: "وقتی مطلبی را عمیق می‌فهمم، احساس رضایت می‌کنم." },
      { dimension: "intrinsic", body: "کنجکاوی من را به مطالعه بیشتر تشویق می‌کند." },
      { dimension: "extrinsic", body: "نمره خوب برای من انگیزه قوی‌ای است." },
      { dimension: "extrinsic", body: "تشویق خانواده یا معلم به تلاشم اضافه می‌کند." },
      { dimension: "extrinsic", body: "رقابت با هم‌کلاسی‌ها من را بیشتر به درس خواندن وادار می‌کند." },
      { dimension: "amotivation", body: "دلیل روشنی برای درس خواندن پیدا نمی‌کنم." },
      { dimension: "amotivation", body: "احساس می‌کنم تلاشم نتیجه‌ای ندارد." },
      { dimension: "amotivation", body: "برنامه‌های درسی برایم بی‌معنا و تکراری به نظر می‌رسند." },
    ],
  },
  {
    key: "growth-mindset",
    title: "ذهنیت رشد و واکنش به چالش",
    category: "academic",
    sourceUrl: "https://www.psychologytoday.com/us/tests/personality/growth-mindset-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Growth Mindset Psychology Today. نگاه دانش‌آموز به چالش، بازخورد و نقش تلاش در پیشرفت را می‌سنجد. نتیجه برای نوع بازخورد مشاور و سختی تدریجی تمرین‌ها استفاده می‌شود.",
    dimensions: [
      {
        key: "challenge",
        title: "پذیرش چالش",
        description: "تمایل به انتخاب کارهای سخت‌تر و ادامه دادن در سختی.",
        trait: "resilience",
        direction: "positive",
        tip: "هر هفته یک تمرین کمی سخت‌تر از سطح فعلی انتخاب کن.",
      },
      {
        key: "feedback",
        title: "استقبال از بازخورد",
        description: "نگاه به انتقاد و اشتباه به عنوان فرصت یادگیری.",
        trait: "openness",
        direction: "positive",
        tip: "بعد از هر آزمون، دو درس قابل بهبود را یادداشت کن.",
      },
      {
        key: "effort",
        title: "باور به نقش تلاش",
        description: "اعتقاد به اینکه مهارت با تمرین و تلاش رشد می‌کند.",
        trait: "motivation",
        direction: "positive",
        tip: "پیشرفت را با مقایسه با هفته قبل خودت بسنج، نه با دیگران.",
      },
    ],
    questions: [
      { dimension: "challenge", body: "کارهای سخت‌تر را فرصت یادگیری می‌دانم." },
      { dimension: "challenge", body: "وقتی درسی چالش‌برانگیز است، رها کردنش را دوست ندارم." },
      { dimension: "challenge", body: "از اشتباه کردن در مسیر یادگیری نمی‌ترسم." },
      { dimension: "feedback", body: "انتقاد سازنده به من کمک می‌کند بهتر شوم." },
      { dimension: "feedback", body: "اشتباه‌هایم را بررسی می‌کنم تا علتشان را بفهمم." },
      { dimension: "feedback", body: "دوست دارم بدانم کجای کارم نیاز به بهبود دارد." },
      { dimension: "effort", body: "باور دارم با تمرین می‌توانم توانایی‌هایم را رشد دهم." },
      { dimension: "effort", body: "موفقیت را بیشتر نتیجه تلاش می‌دانم تا استعداد ثابت." },
      { dimension: "effort", body: "وقتی تلاشم جواب نمی‌دهد، روشم را عوض می‌کنم نه هدفم را." },
    ],
  },
  {
    key: "academic-self-efficacy",
    title: "خودکارآمدی تحصیلی",
    category: "academic",
    sourceUrl: "https://www.psychologytoday.com/us/tests/career/success-likelihood-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Success Likelihood Psychology Today. اعتماد به توانایی انجام تکالیف، تنظیم تلاش و بازیابی بعد از شکست را می‌سنجد. نتیجه به تعیین سطح شروع و اندازه قدم‌های برنامه کمک می‌کند.",
    dimensions: [
      {
        key: "confidence",
        title: "اعتماد به توانایی",
        description: "باور به توانایی فهمیدن و انجام دادن تکالیف درسی.",
        trait: "selfEsteem",
        direction: "positive",
        tip: "با کارهای کوتاه و قابل موفقیت شروع کن تا اعتماد rebuilt شود.",
      },
      {
        key: "effort_regulation",
        title: "تنظیم تلاش",
        description: "توانایی ادامه دادن و تنظیم شدت تلاش تا رسیدن به نتیجه.",
        trait: "conscientiousness",
        direction: "positive",
        tip: "پایان هر بلوک را با یک خروجی کوچک مشخص کن.",
      },
      {
        key: "recovery",
        title: "بازیابی بعد از شکست",
        description: "سرعت برگشتن به مسیر بعد از نمره بد یا شکست.",
        trait: "resilience",
        direction: "positive",
        tip: "بعد از هر شکست، یک اقدام مشخص برای هفته بعد تعیین کن.",
      },
    ],
    questions: [
      { dimension: "confidence", body: "مطمئنم می‌توانم مطالب درسی سخت را یاد بگیرم." },
      { dimension: "confidence", body: "در انجام تکالیف، به توانایی خودم اعتماد دارم." },
      { dimension: "confidence", body: "حتی وقتی درس سخت است، می‌توانم از پسش بربیایم." },
      { dimension: "effort_regulation", body: "وقتی کار سخت می‌شود، تلاشم را ادامه می‌دهم." },
      { dimension: "effort_regulation", body: "می‌توانم خودم را به مطالعه منظم وادار کنم." },
      { dimension: "effort_regulation", body: "برای رسیدن به هدف، از لذت‌های کوتاه‌مدت می‌گذرم." },
      { dimension: "recovery", body: "بعد از یک نمره بد، سریع به مسیر مطالعه برمی‌گردم." },
      { dimension: "recovery", body: "شکست را موقتی می‌دانم و دوباره تلاش می‌کنم." },
      { dimension: "recovery", body: "از تجربه‌های ناموفق برای برنامه بعدی‌ام درس می‌گیرم." },
    ],
  },
  {
    key: "holland-riasec",
    title: "علایق شغلی هالند (RIASEC)",
    category: "career",
    sourceUrl: "https://www.onetcenter.org/interest-profiler.html",
    description:
      "نسخه کوتاه آموزشی بر پایه مدل علایق شغلی هالند و ابزار O*NET Interest Profiler. شش حوزه علاقه واقع‌گرا، جستجوگر، هنری، اجتماعی، متهور و قراردادی را می‌سنجد. نتیجه برای گفت‌وگوی انتخاب رشته و مسیر شغلی استفاده می‌شود.",
    dimensions: [
      {
        key: "realistic",
        title: "واقع‌گرا (R)",
        description: "علاقه به کارهای عملی، ابزار، ساخت‌وساز و فعالیت‌های میدانی؛ مشاغلی مثل مهندسی، فنی و کشاورزی.",
        trait: "realistic",
        direction: "neutral",
        highLabel: "علاقه بالا به کار عملی",
        midLabel: "علاقه متوسط به کار عملی",
        lowLabel: "علاقه کم به کار عملی",
        code: { high: "R" },
      },
      {
        key: "investigative",
        title: "جستجوگر (I)",
        description: "علاقه به تحلیل، پژوهش، حل مسئله و کشف قاعده‌ها؛ مشاغلی مثل پزشکی، پژوهش و داده.",
        trait: "openness",
        direction: "neutral",
        highLabel: "علاقه بالا به تحلیل و پژوهش",
        midLabel: "علاقه متوسط به تحلیل و پژوهش",
        lowLabel: "علاقه کم به تحلیل و پژوهش",
        code: { high: "I" },
      },
      {
        key: "artistic",
        title: "هنری (A)",
        description: "علاقه به خلاقیت، طراحی، نوشتن و بیان؛ مشاغلی مثل هنر، معماری و رسانه.",
        trait: "openness",
        direction: "neutral",
        highLabel: "علاقه بالا به کار خلاق",
        midLabel: "علاقه متوسط به کار خلاق",
        lowLabel: "علاقه کم به کار خلاق",
        code: { high: "A" },
      },
      {
        key: "social",
        title: "اجتماعی (S)",
        description: "علاقه به آموزش، کمک، مشاوره و کار با آدم‌ها؛ مشاغلی مثل معلمی، روان‌شناسی و مددکاری.",
        trait: "agreeableness",
        direction: "neutral",
        highLabel: "علاقه بالا به کار با آدم‌ها",
        midLabel: "علاقه متوسط به کار با آدم‌ها",
        lowLabel: "علاقه کم به کار با آدم‌ها",
        code: { high: "S" },
      },
      {
        key: "enterprising",
        title: "متهور (E)",
        description: "علاقه به رهبری، متقاعد کردن، مدیریت و ریسک حساب‌شده؛ مشاغلی مثل مدیریت، فروش و کارآفرینی.",
        trait: "extraversion",
        direction: "neutral",
        highLabel: "علاقه بالا به رهبری و مدیریت",
        midLabel: "علاقه متوسط به رهبری و مدیریت",
        lowLabel: "علاقه کم به رهبری و مدیریت",
        code: { high: "E" },
      },
      {
        key: "conventional",
        title: "قراردادی (C)",
        description: "علاقه به نظم، داده، جزئیات و رویه‌های مشخص؛ مشاغلی مثل حسابداری، مالی و مدیریت اطلاعات.",
        trait: "conscientiousness",
        direction: "neutral",
        highLabel: "علاقه بالا به کار منظم و دقیق",
        midLabel: "علاقه متوسط به کار منظم و دقیق",
        lowLabel: "علاقه کم به کار منظم و دقیق",
        code: { high: "C" },
      },
    ],
    questions: [
      { dimension: "realistic", body: "از ساختن، تعمیر کردن یا کار با ابزار لذت می‌برم." },
      { dimension: "realistic", body: "کارهای عملی و میدانی را به کار پشت میز ترجیح می‌دهم." },
      { dimension: "investigative", body: "از تحلیل داده و پیدا کردن علت پدیده‌ها لذت می‌برم." },
      { dimension: "investigative", body: "دوست دارم مسئله‌های پیچیده را مرحله‌به‌مرحله حل کنم." },
      { dimension: "artistic", body: "از طراحی، نوشتن یا ساختن چیزهای خلاقانه لذت می‌برم." },
      { dimension: "artistic", body: "دوست دارم کارم فضای آزاد برای ایده‌های تازه داشته باشد." },
      { dimension: "social", body: "از کمک کردن و آموزش دادن به دیگران لذت می‌برم." },
      { dimension: "social", body: "کار با آدم‌ها را به کار تنهایی ترجیح می‌دهم." },
      { dimension: "enterprising", body: "دوست دارم رهبری یک گروه یا پروژه را به عهده بگیرم." },
      { dimension: "enterprising", body: "از متقاعد کردن دیگران و ارائه ایده لذت می‌برم." },
      { dimension: "conventional", body: "از کارهای منظم، دقیق و با رویه مشخص لذت می‌برم." },
      { dimension: "conventional", body: "دوست دارم اطلاعات و فایل‌ها را مرتب و دسته‌بندی کنم." },
    ],
  },
  {
    key: "career-decision",
    title: "آمادگی تصمیم‌گیری شغلی",
    category: "career",
    sourceUrl: "https://www.psychologytoday.com/us/tests/career/goal-setting-test",
    description:
      "نسخه کوتاه آموزشی برای بررسی وضوح مسیر شغلی، میزان کاوش و تردید در انتخاب رشته. نتیجه به مشاور کمک می‌کند بداند دانش‌آموز به اطلاعات بیشتر نیاز دارد یا به تصمیم‌گیری و تعهد.",
    dimensions: [
      {
        key: "clarity",
        title: "وضوح مسیر",
        description: "روشن بودن رشته و مسیر شغلی مورد نظر.",
        trait: "careerClarity",
        direction: "positive",
        tip: "سه گزینه شغلی مورد علاقه را با معیارهای خودت مقایسه کن.",
      },
      {
        key: "exploration",
        title: "کاوش و جمع‌آوری اطلاعات",
        description: "میزان جست‌وجو، گفت‌وگو و تجربه برای شناخت مسیرها.",
        trait: "openness",
        direction: "positive",
        tip: "با دو نفر شاغل در مسیر مورد علاقه‌ات گفت‌وگو کن.",
      },
      {
        key: "indecision",
        title: "تردید در انتخاب",
        description: "میزان بلاتکلیفی و ترس از انتخاب اشتباه.",
        trait: "careerIndecision",
        direction: "caution",
        tip: "انتخاب را به دو گزینه محدود کن و برای هر کدام یک آزمون کوچک طراحی کن.",
      },
    ],
    questions: [
      { dimension: "clarity", body: "می‌دانم چه رشته یا حوزه‌ای را برای آینده جدی‌تر دنبال کنم." },
      { dimension: "clarity", body: "برای مسیر شغلی‌ام تصویر نسبتاً روشنی دارم." },
      { dimension: "clarity", body: "می‌توانم دلیل انتخابم را برای دیگران توضیح بدهم." },
      { dimension: "exploration", body: "درباره رشته‌ها و شغل‌های مختلف اطلاعات جمع می‌کنم." },
      { dimension: "exploration", body: "با آدم‌های شاغل در حوزه‌های مورد علاقه‌ام گفت‌وگو می‌کنم." },
      { dimension: "exploration", body: "برای شناخت مسیرها، تجربه یا کار کوچک امتحان می‌کنم." },
      { dimension: "indecision", body: "بین چند مسیر مختلف گیر کرده‌ام و نمی‌توانم انتخاب کنم." },
      { dimension: "indecision", body: "از اینکه انتخاب اشتباهی بکنم می‌ترسم." },
      { dimension: "indecision", body: "وقتی صحبت از انتخاب رشته می‌شود، ترجیح می‌دهم تصمیم را به بعد بسپارم." },
    ],
  },
  {
    key: "work-values",
    title: "ارزش‌های کاری و انگیزه شغلی",
    category: "career",
    sourceUrl: "https://www.psychologytoday.com/us/tests/career/work-style-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Ambition/Work Style Psychology Today. ارزش‌های پیشرفت، استقلال، ثبات و خدمت به دیگران را می‌سنجد. نتیجه برای گفت‌وگو درباره معیارهای انتخاب رشته و شغل استفاده می‌شود.",
    dimensions: [
      {
        key: "achievement",
        title: "پیشرفت و موفقیت",
        description: "اهمیت رسیدن به نتیجه، ارتقا و موفقیت در کار.",
        trait: "motivation",
        direction: "neutral",
        tip: "برای خودت معیار موفقیت در پنج سال آینده را بنویس.",
      },
      {
        key: "independence",
        title: "استقلال و آزادی عمل",
        description: "اهمیت تصمیم‌گیری مستقل و داشتن فضای کاری آزاد.",
        trait: "openness",
        direction: "neutral",
        tip: "در مقایسه گزینه‌های شغلی، میزان آزادی عمل را هم لحاظ کن.",
      },
      {
        key: "stability",
        title: "ثبات و امنیت",
        description: "اهمیت ثبات شغلی، درآمد قابل پیش‌بینی و امنیت.",
        trait: "stability",
        direction: "neutral",
        tip: "ریسک‌ها و مزایای هر مسیر را با معیار امنیت بسنج.",
      },
      {
        key: "service",
        title: "خدمت و اثرگذاری",
        description: "اهمیت کمک به دیگران و اثر مثبت بر جامعه.",
        trait: "agreeableness",
        direction: "neutral",
        tip: "فرصت‌های کار داوطلبانه یا آموزشی را در هفته بگنجان.",
      },
    ],
    questions: [
      { dimension: "achievement", body: "دوست دارم در کارم به نتیجه‌های بزرگ و قابل دیدن برسم." },
      { dimension: "achievement", body: "پیشرفت و ارتقا برای من انگیزه مهمی است." },
      { dimension: "independence", body: "ترجیح می‌دهم در کارم آزادی تصمیم‌گیری داشته باشم." },
      { dimension: "independence", body: "دوست ندارم کسی مدام روش کارم را تعیین کند." },
      { dimension: "stability", body: "ثبات و امنیت شغلی برای من مهم است." },
      { dimension: "stability", body: "ترجیح می‌دهم درآمد و شرایط کارم قابل پیش‌بینی باشد." },
      { dimension: "service", body: "دوست دارم کارم به دیگران کمک کند." },
      { dimension: "service", body: "اثر مثبت گذاشتن بر جامعه برای من ارزشمند است." },
    ],
  },
  {
    key: "multiple-intelligences",
    title: "هوش‌های چندگانه",
    category: "career",
    sourceUrl: "https://www.psychologytoday.com/us/quizzes/multiple-intelligences-test",
    description:
      "نسخه کوتاه آموزشی بر پایه نظریه هوش‌های چندگانه گاردنر و کویز Multiple Intelligences Psychology Today. هشت حوزه توانایی را به‌صورت مقدماتی بررسی می‌کند تا نقاط قوت یادگیری دانش‌آموز در برنامه‌ریزی لحاظ شود.",
    dimensions: [
      {
        key: "linguistic",
        title: "هوش زبانی",
        description: "توانایی کار با کلمه، نوشتن، خواندن و بیان شفاهی.",
        trait: "linguistic",
        direction: "neutral",
        highLabel: "نقطه قوت زبانی",
        midLabel: "توانایی زبانی متوسط",
        lowLabel: "توانایی زبانی کم",
      },
      {
        key: "logical",
        title: "هوش منطقی-ریاضی",
        description: "توانایی استدلال، تحلیل عددی و حل مسئله منطقی.",
        trait: "logical",
        direction: "neutral",
        highLabel: "نقطه قوت منطقی-ریاضی",
        midLabel: "توانایی منطقی-ریاضی متوسط",
        lowLabel: "توانایی منطقی-ریاضی کم",
      },
      {
        key: "spatial",
        title: "هوش فضایی",
        description: "توانایی تصور شکل‌ها، نقشه و روابط فضایی.",
        trait: "spatial",
        direction: "neutral",
        highLabel: "نقطه قوت فضایی",
        midLabel: "توانایی فضایی متوسط",
        lowLabel: "توانایی فضایی کم",
      },
      {
        key: "musical",
        title: "هوش موسیقیایی",
        description: "حساسیت به ریتم، آهنگ و صدا.",
        trait: "musical",
        direction: "neutral",
        highLabel: "نقطه قوت موسیقیایی",
        midLabel: "توانایی موسیقیایی متوسط",
        lowLabel: "توانایی موسیقیایی کم",
      },
      {
        key: "bodily",
        title: "هوش بدنی-حرکتی",
        description: "توانایی کنترل حرکت، هماهنگی و یادگیری از طریق عمل.",
        trait: "bodily",
        direction: "neutral",
        highLabel: "نقطه قوت بدنی-حرکتی",
        midLabel: "توانایی بدنی-حرکتی متوسط",
        lowLabel: "توانایی بدنی-حرکتی کم",
      },
      {
        key: "interpersonal",
        title: "هوش میان‌فردی",
        description: "توانایی فهم دیگران، همدلی و کار گروهی.",
        trait: "agreeableness",
        direction: "neutral",
        highLabel: "نقطه قوت میان‌فردی",
        midLabel: "توانایی میان‌فردی متوسط",
        lowLabel: "توانایی میان‌فردی کم",
      },
      {
        key: "intrapersonal",
        title: "هوش درون‌فردی",
        description: "توانایی شناخت خود، احساسات و اهداف شخصی.",
        trait: "selfEsteem",
        direction: "neutral",
        highLabel: "نقطه قوت درون‌فردی",
        midLabel: "توانایی درون‌فردی متوسط",
        lowLabel: "توانایی درون‌فردی کم",
      },
      {
        key: "naturalistic",
        title: "هوش طبیعت‌گرا",
        description: "توانایی مشاهده، دسته‌بندی و درک پدیده‌های طبیعی.",
        trait: "openness",
        direction: "neutral",
        highLabel: "نقطه قوت طبیعت‌گرا",
        midLabel: "توانایی طبیعت‌گرا متوسط",
        lowLabel: "توانایی طبیعت‌گرا کم",
      },
    ],
    questions: [
      { dimension: "linguistic", body: "از خواندن، نوشتن یا تعریف کردن داستان لذت می‌برم و در آن خوبم." },
      { dimension: "logical", body: "از حل مسئله‌های منطقی و عددی لذت می‌برم." },
      { dimension: "spatial", body: "می‌توانم شکل‌ها، نقشه‌ها و تصاویر ذهنی را خوب تصور کنم." },
      { dimension: "musical", body: "ریتم و آهنگ را خوب تشخیص می‌دهم و به آن حساس‌ام." },
      { dimension: "bodily", body: "با حرکت، لمس کردن و انجام دادن بهتر یاد می‌گیرم." },
      { dimension: "interpersonal", body: "احساس دیگران را خوب می‌فهمم و در گروه خوب کار می‌کنم." },
      { dimension: "intrapersonal", body: "احساسات و هدف‌های خودم را خوب می‌شناسم." },
      { dimension: "naturalistic", body: "به طبیعت، گیاهان و حیوانات علاقه دارم و خوب مشاهده می‌کنم." },
    ],
  },
  {
    key: "big-five",
    title: "پنج عامل بزرگ شخصیت (Big Five)",
    category: "personal",
    sourceUrl: "https://www.psychologytoday.com/us/tests/personality",
    description:
      "نسخه کوتاه آموزشی بر پایه مدل پنج عامل بزرگ شخصیت و آزمون‌های Personality Psychology Today. گشودگی، وجدان‌گرایی، برون‌گرایی، توافق‌پذیری و روان‌رنجوری را می‌سنجد. نتیجه برای شناخت سبک یادگیری و ارتباط استفاده می‌شود.",
    dimensions: [
      {
        key: "openness",
        title: "گشودگی به تجربه",
        description: "کنجکاوی، خلاقیت و تمایل به ایده‌ها و تجربه‌های تازه.",
        trait: "openness",
        direction: "positive",
        tip: "برای درس‌های مفهومی از مثال‌ها و ارتباط‌های تازه استفاده کن.",
      },
      {
        key: "conscientiousness",
        title: "وجدان‌گرایی",
        description: "نظم، مسئولیت‌پذیری و پیگیری هدف‌ها.",
        trait: "conscientiousness",
        direction: "positive",
        tip: "برنامه‌ریزی دقیق و چک‌لیست برای تو مؤثرتر است.",
      },
      {
        key: "extraversion",
        title: "برون‌گرایی",
        description: "انرژی گرفتن از تعامل اجتماعی و تمایل به فعالیت گروهی.",
        trait: "extraversion",
        direction: "neutral",
        tip: "مطالعه گروهی کوتاه می‌تواند برایت انرژی‌بخش باشد.",
      },
      {
        key: "agreeableness",
        title: "توافق‌پذیری",
        description: "همدلی، همکاری و تمایل به حفظ رابطه‌های مثبت.",
        trait: "agreeableness",
        direction: "positive",
        tip: "در کار گروهی نقش هماهنگ‌کننده را امتحان کن.",
      },
      {
        key: "neuroticism",
        title: "روان‌رنجوری",
        description: "شدت واکنش هیجانی به فشار، نگرانی و نوسان خلق.",
        trait: "anxiety",
        direction: "caution",
        tip: "تمرین تنفس و شکستن کارها به بخش‌های کوچک به تو کمک می‌کند.",
      },
    ],
    questions: [
      { dimension: "openness", body: "از ایده‌ها و موضوع‌های تازه و غیرمعمول لذت می‌برم." },
      { dimension: "openness", body: "دوست دارم مسائل را از زاویه‌های مختلف ببینم." },
      { dimension: "conscientiousness", body: "کارهایم را منظم و طبق برنامه انجام می‌دهم." },
      { dimension: "conscientiousness", body: "به تعهدها و مسئولیت‌هایم پایبند هستم." },
      { dimension: "extraversion", body: "در جمع‌های شلوغ احساس انرژی می‌کنم." },
      { dimension: "extraversion", body: "صحبت کردن و تعامل با آدم‌های تازه برایم آسان است." },
      { dimension: "agreeableness", body: "نگران حال دیگران هستم و دوست دارم کمکشان کنم." },
      { dimension: "agreeableness", body: "در اختلاف‌ها دنبال راه‌حل مسالمت‌آمیز هستم." },
      { dimension: "neuroticism", body: "زیاد نگران می‌شوم و فشار را شدید حس می‌کنم." },
      { dimension: "neuroticism", body: "خلق و خویم در موقعیت‌های استرس‌زا نوسان زیادی دارد." },
    ],
  },
  {
    key: "emotional-intelligence",
    title: "هوش هیجانی",
    category: "personal",
    sourceUrl: "https://www.psychologytoday.com/us/tests/personality/emotional-intelligence-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Emotional Intelligence Psychology Today. خودآگاهی، تنظیم هیجان، همدلی، مهارت اجتماعی و انگیزه هیجانی را می‌سنجد. نتیجه برای مدیریت استرس و تعامل مشاور با دانش‌آموز استفاده می‌شود.",
    dimensions: [
      {
        key: "self_awareness",
        title: "خودآگاهی هیجانی",
        description: "شناخت احساس‌های خود و فهم علت شکل‌گیری آن‌ها.",
        trait: "selfEsteem",
        direction: "positive",
        tip: "روزی دو بار احساس اصلی خودت را با یک کلمه نام‌گذاری کن.",
      },
      {
        key: "regulation",
        title: "تنظیم هیجان",
        description: "توانایی آرام کردن خود و مدیریت واکنش‌ها در فشار.",
        trait: "resilience",
        direction: "positive",
        tip: "قبل از واکنش، سه نفس عمیق و یک بازه کوتاه سکوت را تمرین کن.",
      },
      {
        key: "empathy",
        title: "همدلی",
        description: "فهم احساس و دیدگاه دیگران.",
        trait: "agreeableness",
        direction: "positive",
        tip: "در گفت‌وگو، اول جمع‌بندی احساس طرف مقابل را بگو.",
      },
      {
        key: "social",
        title: "مهارت اجتماعی",
        description: "توانایی شروع، حفظ و مدیریت رابطه‌های اجتماعی.",
        trait: "extraversion",
        direction: "positive",
        tip: "در کار گروهی، نقش روشن و یک وظیفه مشخص بردار.",
      },
      {
        key: "motivation",
        title: "انگیزه هیجانی",
        description: "توانایی استفاده از هیجان برای پیگیری هدف‌های بلندمدت.",
        trait: "motivation",
        direction: "positive",
        tip: "هدف مهم را با یک تصویر یا جمله کوتاه جلوی چشم نگه دار.",
      },
    ],
    questions: [
      { dimension: "self_awareness", body: "می‌توانم احساس اصلی‌ام را در لحظه تشخیص بدهم." },
      { dimension: "self_awareness", body: "می‌دانم چه چیزهایی حال من را بد یا خوب می‌کند." },
      { dimension: "regulation", body: "وقتی عصبانی می‌شوم، می‌توانم قبل از واکنش آرام شوم." },
      { dimension: "regulation", body: "در موقعیت استرس‌زا، هیجانم را مدیریت می‌کنم." },
      { dimension: "empathy", body: "می‌توانم خودم را جای دیگران بگذارم و احساسشان را بفهمم." },
      { dimension: "empathy", body: "به حرف‌های دیگران با دقت گوش می‌دهم." },
      { dimension: "social", body: "در گروه‌های جدید دوست پیدا کردن برایم آسان است." },
      { dimension: "social", body: "اختلاف‌ها را بدون خراب کردن رابطه حل می‌کنم." },
      { dimension: "motivation", body: "برای هدف‌های بلندمدت، انگیزه‌ام را حفظ می‌کنم." },
      { dimension: "motivation", body: "ناامییدی را به تلاش بیشتر تبدیل می‌کنم." },
    ],
  },
  {
    key: "resilience",
    title: "تاب‌آوری روانی",
    category: "personal",
    sourceUrl: "https://www.psychologytoday.com/us/tests/personality/resilience-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Resilience Psychology Today. توانایی بازیابی بعد از فشار، خوش‌بینی واقع‌گرایانه و استفاده از حمایت دیگران را می‌سنجد. نتیجه برای تعیین شدت برنامه در هفته‌های پرفشار استفاده می‌شود.",
    dimensions: [
      {
        key: "recovery",
        title: "بازیابی بعد از فشار",
        description: "توانایی برگشتن به تعادل بعد از شکست یا دوره سخت.",
        trait: "resilience",
        direction: "positive",
        tip: "بعد از هر هفته سخت، یک فعالیت بازیابی مشخص برنامه‌ریزی کن.",
      },
      {
        key: "optimism",
        title: "خوش‌بینی واقع‌گرایانه",
        description: "باور به امکان بهبود وضعیت بدون نادیده گرفتن واقعیت.",
        trait: "optimism",
        direction: "positive",
        tip: "در هر مشکل، یک قدم کوچک قابل کنترل پیدا کن.",
      },
      {
        key: "support",
        title: "استفاده از حمایت",
        description: "توانایی درخواست کمک و استفاده از شبکه حمایتی.",
        trait: "agreeableness",
        direction: "positive",
        tip: "یک یا دو نفر را برای بازخورد و حمایت هفتگی انتخاب کن.",
      },
    ],
    questions: [
      { dimension: "recovery", body: "بعد از یک دوره سخت، به‌سرعت به تعادل برمی‌گردم." },
      { dimension: "recovery", body: "اشتباه‌ها و ناکامی‌ها من را از ادامه دادن بازنمی‌دارند." },
      { dimension: "recovery", body: "در فشار، می‌توانم کارهای ضروری را ادامه دهم." },
      { dimension: "optimism", body: "باور دارم شرایط سخت موقتی است." },
      { dimension: "optimism", body: "در هر مشکل، دنبال فرصت یا راه‌حل کوچک می‌گردم." },
      { dimension: "optimism", body: "آینده را با وجود سختی‌ها مثبت می‌بینم." },
      { dimension: "support", body: "وقتی نیاز دارم، از دیگران کمک می‌خواهم." },
      { dimension: "support", body: "شبکه‌ای از دوستان یا خانواده دارم که به آن‌ها تکیه کنم." },
      { dimension: "support", body: "از گفت‌وگو با مشاور یا معلم برای حل مشکل استفاده می‌کنم." },
    ],
  },
  {
    key: "self-esteem",
    title: "عزت نفس",
    category: "personal",
    sourceUrl: "https://www.psychologytoday.com/us/tests/personality/self-esteem-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Self-Esteem Psychology Today. ارزش شخصی، اعتماد به خود و پذیرش خود را می‌سنجد. نتیجه به انتخاب نوع بازخورد و هدف‌گذاری واقع‌بینانه‌تر کمک می‌کند.",
    dimensions: [
      {
        key: "self_worth",
        title: "ارزش شخصی",
        description: "احساس ارزشمندی مستقل از موفقیت یا شکست.",
        trait: "selfEsteem",
        direction: "positive",
        tip: "هر روز یک موفقیت کوچک را بدون مقایسه با دیگران یادداشت کن.",
      },
      {
        key: "confidence",
        title: "اعتماد به خود",
        description: "باور به توانایی تصمیم‌گیری و انجام کارها.",
        trait: "selfEsteem",
        direction: "positive",
        tip: "تصمیم‌های کوچک را خودت بگیر و نتیجه را بازبینی کن.",
      },
      {
        key: "acceptance",
        title: "پذیرش خود",
        description: "پذیرش کاستی‌ها و اشتباه‌ها بدون قضاوت سخت.",
        trait: "selfEsteem",
        direction: "positive",
        tip: "بعد از اشتباه، با خودت مثل یک دوست حرف بزن.",
      },
    ],
    questions: [
      { dimension: "self_worth", body: "احساس می‌کنم ارزش من به نمره یا موفقیت‌هایم وابسته نیست." },
      { dimension: "self_worth", body: "به خودم و توانایی‌هایم نگاه مثبتی دارم." },
      { dimension: "self_worth", body: "حتی وقتی شکست می‌خورم، ارزش خودم را زیر سؤال نمی‌برم." },
      { dimension: "confidence", body: "برای انجام کارهای جدید به خودم اعتماد دارم." },
      { dimension: "confidence", body: "می‌توانم تصمیم‌های مهم را بگیرم و پشتشان بایستم." },
      { dimension: "confidence", body: "در جمع، نظر خودم را با اطمینان بیان می‌کنم." },
      { dimension: "acceptance", body: "کاستی‌هایم را می‌پذیرم بدون اینکه خودم را سرزنش کنم." },
      { dimension: "acceptance", body: "اشتباه‌هایم را بخشی از یادگیری می‌دانم." },
      { dimension: "acceptance", body: "با خودم مهربان‌تر از یک منتقد سخت رفتار می‌کنم." },
    ],
  },
  {
    key: "perfectionism",
    title: "کمال‌گرایی",
    category: "personal",
    sourceUrl: "https://www.psychologytoday.com/us/tests/personality/perfectionism-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Perfectionism Psychology Today. استانداردهای بالا، نگرانی از اشتباه و نظم افراطی را بررسی می‌کند. نتیجه برای جلوگیری از وسواس مرور و تنظیم حجم تمرین استفاده می‌شود.",
    dimensions: [
      {
        key: "standards",
        title: "استانداردهای بالا",
        description: "تمایل به تعیین اهداف بلند و کیفیت بسیار بالا.",
        trait: "perfectionism",
        direction: "neutral",
        tip: "برای هر کار، استاندارد «خوب کافی» را از قبل تعریف کن.",
      },
      {
        key: "concern",
        title: "نگرانی از اشتباه",
        description: "ترس و نگرانی شدید از خطا و قضاوت دیگران.",
        trait: "anxiety",
        direction: "caution",
        tip: "اشتباه‌های تمرینی را عمداً مرور کن تا حساسیت کم شود.",
      },
      {
        key: "order",
        title: "نظم افراطی",
        description: "نیاز شدید به مرتب بودن، کامل بودن و کنترل جزئیات.",
        trait: "conscientiousness",
        direction: "neutral",
        tip: "گاهی با شرایط کمی نامرتب تمرین کن تا انعطاف‌پذیرتر شوی.",
      },
    ],
    questions: [
      { dimension: "standards", body: "برای خودم استانداردهای بسیار بالایی تعیین می‌کنم." },
      { dimension: "standards", body: "تا کار کامل نشود، از آن راضی نمی‌شوم." },
      { dimension: "standards", body: "دوست دارم بهترین باشم و کمتر از آن را قبول نمی‌کنم." },
      { dimension: "concern", body: "از اشتباه کردن یا قضاوت شدن می‌ترسم." },
      { dimension: "concern", body: "اگر کارم کامل نباشد، احساس شرم یا نگرانی می‌کنم." },
      { dimension: "concern", body: "نگرانم دیگران کارم را ناقص ببینند." },
      { dimension: "order", body: "به نظم و ترتیب بسیار دقیق در کارها نیاز دارم." },
      { dimension: "order", body: "اگر شرایط کاملاً مرتب نباشد، تمرکزم کم می‌شود." },
      { dimension: "order", body: "دوست دارم همه جزئیات را تحت کنترل داشته باشم." },
    ],
  },
  {
    key: "perceived-stress",
    title: "استرس ادراک‌شده",
    category: "wellbeing",
    sourceUrl: "https://www.psychologytoday.com/us/tests/health/what-are-your-stress-triggers",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون How Stressed Are You Psychology Today. میزان احساس فشار، توان مقابله و احساس کنترل را می‌سنجد. نتیجه برای تنظیم حجم برنامه و افزودن فعالیت‌های بازیابی استفاده می‌شود.",
    dimensions: [
      {
        key: "stress",
        title: "احساس فشار",
        description: "شدت احساس درماندگی و فشار روانی در زندگی روزمره.",
        trait: "stress",
        direction: "caution",
        tip: "منابع اصلی فشار را بنویس و برای هر کدام یک اقدام کوچک انتخاب کن.",
      },
      {
        key: "coping",
        title: "مقابله مؤثر",
        description: "استفاده از راه‌های سالم مثل ورزش، گفت‌وگو و برنامه‌ریزی.",
        trait: "resilience",
        direction: "positive",
        tip: "یک فعالیت بازیابی ثابت مثل پیاده‌روی روزانه را در برنامه بگذار.",
      },
      {
        key: "control",
        title: "احساس کنترل",
        description: "باور به اینکه می‌تواند روی بخشی از شرایط اثر بگذارد.",
        trait: "selfEsteem",
        direction: "positive",
        tip: "روی کارهای قابل کنترل تمرکز کن و بقیه را رها کن.",
      },
    ],
    questions: [
      { dimension: "stress", body: "در یک ماه گذشته احساس کرده‌ام از فشار کارها در می‌روم." },
      { dimension: "stress", body: "احساس می‌کنم مشکلات روی هم انباشته شده‌اند." },
      { dimension: "stress", body: "به‌خاطر فشار روانی، تمرکز یا خوابم کم شده است." },
      { dimension: "coping", body: "برای کاهش استرس، فعالیت سالمی مثل ورزش یا پیاده‌روی دارم." },
      { dimension: "coping", body: "وقتی تحت فشارم، با یک فرد قابل اعتماد صحبت می‌کنم." },
      { dimension: "coping", body: "برای مقابله با فشار، برنامه و اولویت‌هایم را مرتب می‌کنم." },
      { dimension: "control", body: "باور دارم می‌توانم روی بخشی از مشکلاتم اثر بگذارم." },
      { dimension: "control", body: "در شرایط سخت، دنبال کارهای قابل انجام می‌گردم." },
      { dimension: "control", body: "احساس می‌کنم انتخاب‌هایم روی سرنوشت تحصیلی‌ام اثر دارد." },
    ],
  },
  {
    key: "sleep-quality",
    title: "کیفیت خواب و انرژی روزانه",
    category: "wellbeing",
    sourceUrl: "https://www.psychologytoday.com/us/tests/health/sleep-habits-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Sleep Habits Psychology Today. کیفیت خواب، نظم خواب و انرژی روزانه را می‌سنجد. نتیجه برای انتخاب ساعت مطالعه و هشدار درباره برنامه‌های شبانه استفاده می‌شود.",
    dimensions: [
      {
        key: "quality",
        title: "کیفیت خواب",
        description: "عمق و بازیابی‌بخش بودن خواب شبانه.",
        trait: "sleepQuality",
        direction: "positive",
        tip: "یک ساعت ثابت خواب و بیداری برای خودت تعیین کن.",
      },
      {
        key: "routine",
        title: "نظم خواب",
        description: "ثبات ساعت خواب و بیداری در روزهای مختلف.",
        trait: "sleepRoutine",
        direction: "positive",
        tip: "یک ساعت قبل از خواب از صفحه نمایش فاصله بگیر.",
      },
      {
        key: "energy",
        title: "انرژی روزانه",
        description: "میزان سرحال بودن و تمرکز در طول روز.",
        trait: "energy",
        direction: "positive",
        tip: "بلوک‌های سخت را در ساعات پرانرژی خودت قرار بده.",
      },
    ],
    questions: [
      { dimension: "quality", body: "شب‌ها خواب عمیق و آرامی دارم." },
      { dimension: "quality", body: "صبح‌ها با احساس بازیابی از خواب بیدار می‌شوم." },
      { dimension: "quality", body: "خوابم معمولاً با بیداری‌های مکرر مختل نمی‌شود." },
      { dimension: "routine", body: "ساعت خواب و بیداری‌ام در روزهای هفته ثابت است." },
      { dimension: "routine", body: "قبل از خواب، روتین آرام و مشخصی دارم." },
      { dimension: "routine", body: "آخر هفته‌ها برنامه خوابم را خیلی به هم نمی‌ریزم." },
      { dimension: "energy", body: "در طول روز انرژی کافی برای مطالعه دارم." },
      { dimension: "energy", body: "در ساعات مطالعه، احساس خواب‌آلودگی شدید ندارم." },
    ],
  },
  {
    key: "digital-balance",
    title: "تعادل استفاده از فضای مجازی",
    category: "wellbeing",
    sourceUrl: "https://www.psychologytoday.com/us/tests/health/too-online-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Online Behavior Psychology Today. تعادل استفاده از گوشی و شبکه‌های اجتماعی، اثر آن بر خواب و تمرکز را می‌سنجد. نتیجه برای طراحی محیط مطالعه و قواعد استفاده از گوشی استفاده می‌شود.",
    dimensions: [
      {
        key: "balance",
        title: "تعادل استفاده",
        description: "توانایی کنترل زمان استفاده از گوشی و شبکه‌های اجتماعی.",
        trait: "digitalBalance",
        direction: "positive",
        tip: "برای گوشی یک بازه مشخص در روز تعیین کن و بیرون از آن استفاده نکن.",
      },
      {
        key: "sleep_impact",
        title: "اثر بر خواب",
        description: "میزان به تأخیر انداختن خواب به‌خاطر گوشی و فضای مجازی.",
        trait: "sleepImpact",
        direction: "caution",
        tip: "گوشی را حداقل ۳۰ دقیقه قبل از خواب کنار بگذار.",
      },
      {
        key: "focus_impact",
        title: "اثر بر تمرکز",
        description: "میزان برهم‌خوردن تمرکز مطالعه به‌خاطر اعلان‌ها و شبکه‌های اجتماعی.",
        trait: "focus",
        direction: "caution",
        tip: "در زمان مطالعه، اعلان‌ها را خاموش یا گوشی را دور کن.",
      },
    ],
    questions: [
      { dimension: "balance", body: "می‌توانم زمان استفاده از گوشی و شبکه‌های اجتماعی را کنترل کنم." },
      { dimension: "balance", body: "بدون گوشی هم می‌توانم برای مدت طولانی راحت باشم." },
      { dimension: "balance", body: "استفاده از فضای مجازی زندگی روزمره‌ام را مختل نمی‌کند." },
      { dimension: "sleep_impact", body: "شب‌ها به‌خاطر گوشی دیرتر می‌خوابم." },
      { dimension: "sleep_impact", body: "قبل از خواب، استفاده از شبکه‌های اجتماعی خوابم را به تعویق می‌اندازد." },
      { dimension: "sleep_impact", body: "صبح‌ها به‌خاطر استفاده شبانه از گوشی خسته‌ام." },
      { dimension: "focus_impact", body: "در میانه مطالعه، اعلان‌ها یا شبکه‌های اجتماعی حواسم را پرت می‌کنند." },
      { dimension: "focus_impact", body: "بعد از استفاده طولانی از شبکه‌های اجتماعی، تمرکز درس خواندن سخت‌تر می‌شود." },
    ],
  },
  {
    key: "communication-skills",
    title: "مهارت‌های ارتباطی و کار تیمی",
    category: "wellbeing",
    sourceUrl: "https://www.psychologytoday.com/us/tests/relationships/interpersonal-communication-skills-test",
    description:
      "نسخه کوتاه آموزشی با الهام از آزمون Interpersonal Communication Skills Psychology Today. گوش دادن فعال، ابراز نظر و همکاری را می‌سنجد. نتیجه برای تعامل مشاور با دانش‌آموز و کار گروهی مطالعه استفاده می‌شود.",
    dimensions: [
      {
        key: "listening",
        title: "گوش دادن فعال",
        description: "توانایی توجه کامل و فهم پیام طرف مقابل.",
        trait: "agreeableness",
        direction: "positive",
        tip: "در گفت‌وگو، قبل از پاسخ دادن حرف طرف مقابل را خلاصه کن.",
      },
      {
        key: "assertiveness",
        title: "ابراز نظر",
        description: "توانایی بیان نیاز و نظر خود با احترام و قاطعیت.",
        trait: "extraversion",
        direction: "positive",
        tip: "نظرت را با جمله «من فکر می‌کنم...» شروع کن.",
      },
      {
        key: "cooperation",
        title: "همکاری تیمی",
        description: "توانایی کار مشترک، تقسیم نقش و حل اختلاف در گروه.",
        trait: "agreeableness",
        direction: "positive",
        tip: "در گروه، نقش و مسئولیت خودت را از ابتدا روشن کن.",
      },
    ],
    questions: [
      { dimension: "listening", body: "وقتی کسی صحبت می‌کند، به‌طور کامل به او توجه می‌کنم." },
      { dimension: "listening", body: "قبل از پاسخ دادن، سعی می‌کنم منظور طرف مقابل را بفهمم." },
      { dimension: "listening", body: "در گفت‌وگو، حرف دیگران را قطع نمی‌کنم." },
      { dimension: "assertiveness", body: "می‌توانم نظر مخالفم را با احترام بیان کنم." },
      { dimension: "assertiveness", body: "وقتی چیزی را نمی‌فهمم، بدون خجالت سؤال می‌کنم." },
      { dimension: "assertiveness", body: "می‌توانم نیازها و مرزهایم را روشن بگویم." },
      { dimension: "cooperation", body: "در کار گروهی، به راحتی با دیگران هماهنگ می‌شوم." },
      { dimension: "cooperation", body: "در اختلاف‌های گروهی، دنبال راه‌حل مشترک می‌گردم." },
      { dimension: "cooperation", body: "مسئولیت سهم خودم را در کار گروهی انجام می‌دهم." },
    ],
  },
];

export function catalogTestCategory(test: CatalogTest): PsychCategory {
  return test.category;
}
