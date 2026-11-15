import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import {
  psychDimensions,
  psychOptions,
  psychQuestions,
  psychTests,
  users,
  workspaces,
  type PsychDimension,
  type PsychResultRule,
} from "../src/db/schema";

const TEST_TITLE = "آزمون ۱۶ تیپ شخصیتی (MBTI)";

const DIMENSIONS = [
  {
    key: "ei",
    title: "برون‌گرایی / درون‌گرایی",
    description: "منبع انرژی و تمایل به تعامل اجتماعی را می‌سنجد.",
    bands: [
      { min: 0, max: 1, label: "درون‌گرا", code: "I", analysis: "به تنهایی و فکر کردن عمیق نیاز داری و در جمع کوچک راحت‌تری." },
      { min: 2, max: null, label: "برون‌گرا", code: "E", analysis: "از تعامل با آدم‌ها انرژی می‌گیری و در جمع راحت‌تری." },
    ],
  },
  {
    key: "sn",
    title: "حسی / شهودی",
    description: "نحوهٔ دریافت اطلاعات و توجه به جزئیات یا الگوها را می‌سنجد.",
    bands: [
      { min: 0, max: 1, label: "حسی", code: "S", analysis: "به واقعیت‌های ملموس، جزئیات و تجربهٔ مستقیم تکیه می‌کنی." },
      { min: 2, max: null, label: "شهودی", code: "N", analysis: "به الگوها، معناهای پنهان و امکان‌های آینده توجه داری." },
    ],
  },
  {
    key: "tf",
    title: "فکری / احساسی",
    description: "معیار تصمیم‌گیری؛ منطق و داده یا همدلی و ارزش‌های انسانی.",
    bands: [
      { min: 0, max: 1, label: "احساسی", code: "F", analysis: "در تصمیم‌ها تأثیر بر آدم‌ها، همدلی و ارزش‌های انسانی را در اولویت می‌گذاری." },
      { min: 2, max: null, label: "فکری", code: "T", analysis: "در تصمیم‌ها منطق، داده و درستی استدلال را در اولویت می‌گذاری." },
    ],
  },
  {
    key: "jp",
    title: "قضاوت‌گر / ادراکی",
    description: "سبک مدیریت زمان، برنامه‌ریزی و انعطاف را می‌سنجد.",
    bands: [
      { min: 0, max: 1, label: "ادراکی", code: "P", analysis: "انعطاف، کشف مسیر و نگه داشتن گزینه‌ها را دوست داری." },
      { min: 2, max: null, label: "قضاوت‌گر", code: "J", analysis: "برنامه‌ریزی، نظم و بستن کارها را دوست داری." },
    ],
  },
];

const HIGH_POLE: Record<string, string> = {
  ei: "E",
  sn: "N",
  tf: "T",
  jp: "J",
};

const QUESTIONS: {
  dimension: string;
  body: string;
  options: { body: string; pole: string }[];
}[] = [
  {
    dimension: "ei",
    body: "در یک مهمانی شلوغ معمولاً…",
    options: [
      { body: "با افراد جدید گرم می‌گیرم و از جمع انرژی می‌گیرم.", pole: "E" },
      { body: "گوشه‌ای می‌نشینم و با چند نفر نزدیک گفت‌وگو می‌کنم.", pole: "I" },
    ],
  },
  {
    dimension: "ei",
    body: "بعد از یک روز طولانی و خسته‌کننده…",
    options: [
      { body: "دوست دارم با دوستان بیرون بروم و سرم را گرم کنم.", pole: "E" },
      { body: "ترجیح می‌دهم در خانه تنها باشم و استراحت کنم.", pole: "I" },
    ],
  },
  {
    dimension: "ei",
    body: "وقتی با مسئلهٔ جدیدی روبه‌رو می‌شوی…",
    options: [
      { body: "بلند فکر می‌کنم و با دیگران مشورت می‌کنم.", pole: "E" },
      { body: "اول خودم خوب فکر می‌کنم و بعد حرف می‌زنم.", pole: "I" },
    ],
  },
  {
    dimension: "sn",
    body: "بیشتر به چه چیزی توجه می‌کنی؟",
    options: [
      { body: "جزئیات، واقعیت‌های ملموس و آنچه همین حالا هست.", pole: "S" },
      { body: "الگوها، معناهای پنهان و آنچه ممکن است بشود.", pole: "N" },
    ],
  },
  {
    dimension: "sn",
    body: "یادگیری را چطور ترجیح می‌دهی؟",
    options: [
      { body: "با مثال‌های عملی، تمرین و گام‌به‌گام.", pole: "S" },
      { body: "با نظریه، مفهوم کلی و تصویر بزرگ.", pole: "N" },
    ],
  },
  {
    dimension: "sn",
    body: "وقتی می‌خواهی یک اتفاق را توضیح بدهی…",
    options: [
      { body: "دقیق و مرحله‌به‌مرحله تعریف می‌کنم.", pole: "S" },
      { body: "از تصویر کلی، استعاره و ارتباط‌ها استفاده می‌کنم.", pole: "N" },
    ],
  },
  {
    dimension: "tf",
    body: "در تصمیم‌گیری مهم…",
    options: [
      { body: "منطق، داده و درستی استدلال را در اولویت می‌گذارم.", pole: "T" },
      { body: "تأثیر تصمیم بر آدم‌ها و ارزش‌ها را در اولویت می‌گذارم.", pole: "F" },
    ],
  },
  {
    dimension: "tf",
    body: "وقتی دوستت با مشکلی پیش می‌آید…",
    options: [
      { body: "دنبال راه‌حل عملی و علت مشکل می‌گردم.", pole: "T" },
      { body: "اول همدلی می‌کنم و احساسش را می‌فهمم.", pole: "F" },
    ],
  },
  {
    dimension: "tf",
    body: "در یک بحث…",
    options: [
      { body: "درستی استدلال برایم مهم‌تر از حفظ رابطه است.", pole: "T" },
      { body: "حفظ رابطه و احترام متقابل برایم مهم‌تر است.", pole: "F" },
    ],
  },
  {
    dimension: "jp",
    body: "برای یک سفر…",
    options: [
      { body: "از قبل برنامه، مسیر و اقامتگاه را مشخص می‌کنم.", pole: "J" },
      { body: "مسیر را در لحظه انتخاب می‌کنم و انعطاف دارم.", pole: "P" },
    ],
  },
  {
    dimension: "jp",
    body: "کارهایت را معمولاً…",
    options: [
      { body: "زودتر تمام می‌کنم و از قبل برنامه دارم.", pole: "J" },
      { body: "نزدیک مهلت با انرژی بیشتر انجام می‌دهم.", pole: "P" },
    ],
  },
  {
    dimension: "jp",
    body: "میز کار یا اتاقت…",
    options: [
      { body: "منظم و مشخص است و هر چیزی جای خودش را دارد.", pole: "J" },
      { body: "کمی بی‌نظم است اما خودم همه‌چیز را پیدا می‌کنم.", pole: "P" },
    ],
  },
];

const RULES: PsychResultRule[] = [
  { code: "ISTJ", title: "بازرس متعهد", body: "واقع‌گرا، مسئولیت‌پذیر و منظم هستی. به تعهدها پایبندی و ترجیح می‌دهی کارها با دقت و بر اساس تجربهٔ اثبات‌شده پیش بروند. در محیط‌های پرتغییر، ثبات و قابل‌اعتماد بودن نقطهٔ قوت توست." },
  { code: "ISFJ", title: "مدافع مهربان", body: "دقیق، وفادار و مراقب اطرافیان هستی. جزئیات را می‌بینی و برای آرامش و رفاه دیگران تلاش می‌کنی. گاهی باید یاد بگیری نیازهای خودت را هم به همان اندازه جدی بگیری." },
  { code: "INFJ", title: "بینشگر آرمان‌گرا", body: "ترکیبی از همدلی عمیق و دید بلندمدت داری. دنبال معنا و تغییر مثبت هستی و می‌توانی پشت ظاهر آدم‌ها را ببینی. برای اینکه ایده‌هایت زمینی شوند، به گام‌های کوچک و قابل‌اندازه‌گیری نیاز داری." },
  { code: "INTJ", title: "معمار", body: "مستقل، تحلیلی و هدف‌محور هستی. برای مسائل راه‌حل بلندمدت طراحی می‌کنی و از کارهای بی‌هدف دوری می‌کنی. مهارتت در برنامه‌ریزی است؛ انعطاف در برابر نظر دیگران آن را قوی‌تر می‌کند." },
  { code: "ISTP", title: "صنعتگر", body: "آرام، عملی و حل‌مسئله‌محور هستی. در لحظهٔ بحران خونسرد می‌مانی و با دست‌زدن به کار، مشکل را حل می‌کنی. به آزادی و تجربهٔ مستقیم نیاز داری." },
  { code: "ISFP", title: "هنرمند", body: "حساس، انعطاف‌پذیر و اهل تجربهٔ زیبایی هستی. ارزش‌های درونی‌ات را آرام اما محکم دنبال می‌کنی. در محیط‌های سخت‌گیر و پرتنش کمتر شکوفا می‌شوی." },
  { code: "INFP", title: "آرمان‌گرا", body: "خلاق، همدل و ارزش‌محور هستی. دنبال کاری هستی که با باورهایت هم‌راستا باشد و برای آزادی بیان و معنا اهمیت زیادی قائلی. واقع‌بینی و تعهدهای کوچک به تو کمک می‌کند ایده‌هایت را زنده کنی." },
  { code: "INTP", title: "متفکر", body: "کنجکاو، تحلیلی و عاشق فهمیدن هستی. از کشف ارتباط‌ها و حل مسائل پیچیده لذت می‌بری. گاهی تحلیل را جای عمل می‌گیری؛ انتخاب یک گام عملی، بهترین راه برای تبدیل ایده به نتیجه است." },
  { code: "ESTP", title: "ماجراجو", body: "پرانرژی، زیرک و اهل عمل هستی. در موقعیت‌های سریع و غیرمنتظره خوب عمل می‌کنی و از ریسک‌های حساب‌شده نمی‌ترسی. برنامه‌ریزی کوتاه و بازبینی نتیجه‌ها به تو کمک می‌کند از فرصت‌ها بهتر استفاده کنی." },
  { code: "ESFP", title: "سرگرم‌کننده", body: "گرم، خوش‌بین و اهل تجربه هستی. حالِ خوب را به جمع می‌آوری و از زندگی لذت می‌بری. تعادل بین هیجان امروز و هدف فردا، قدرت تو را بیشتر می‌کند." },
  { code: "ENFP", title: "پرشور", body: "خلاق، کنجکاو و ایده‌پرداز هستی. آدم‌ها و امکان‌های تازه را دوست داری و می‌توانی دیگران را همراه کنی. تمرکز روی چند هدف مهم، به جای همه‌چیز هم‌زمان، نتیجه‌ات را چند برابر می‌کند." },
  { code: "ENTP", title: "مبتکر", body: "ذهنی چابک، بحث‌دوست و نوآور داری. از چالش و ایده‌های تازه لذت می‌بری و سریع راه‌های جدید پیدا می‌کنی. برای به ثمر رساندن ایده‌ها، به نظم و پیگیری بلندمدت نیاز داری." },
  { code: "ESTJ", title: "مجری", body: "هدف‌گرا، منظم و تصمیم‌گیر هستی. کارها را سازماندهی می‌کنی و انتظار داری همه مسئولیت‌هایشان را انجام دهند. شنیدن احساس‌ها و نظرهای مخالف، رهبری‌ات را انسانی‌تر می‌کند." },
  { code: "ESFJ", title: "یاور", body: "دلسوز، همراه و اجتماعی هستی. برای هماهنگی و رفاه جمع تلاش می‌کنی و به بازخورد رابطه‌ها حساس هستی. مرزگذاری سالم و توجه به خواسته‌های خودت، از فرسودگی جلوگیری می‌کند." },
  { code: "ENFJ", title: "رهبر الهام‌بخش", body: "همدل، الهام‌بخش و اهل رشد هستی. پتانسیل آدم‌ها را می‌بینی و آن‌ها را همراه می‌کنی. برای اینکه دیگران را همیشه جلو نبری، باید برای خودت هم زمان و انرژی بگذاری." },
  { code: "ENTJ", title: "فرمانده", body: "جسور، راهبردی و نتیجه‌محور هستی. اهداف بزرگ را به برنامه تبدیل می‌کنی و از تصمیم‌های سخت فرار نمی‌کنی. همدلی و شنیدن صداهای مختلف، تیم‌سازی تو را قوی‌تر می‌کند." },
];

async function main() {
  const db = await getDb();
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, "دفتر مشاوره نمونه"))
    .limit(1);
  if (!workspace) {
    throw new Error("workspace missing; run `bun run db:seed` or `bun run db:import:example` first");
  }
  const [counselor] = await db
    .select()
    .from(users)
    .where(and(eq(users.workspaceId, workspace.id), eq(users.role, "counselor")))
    .limit(1);
  if (!counselor) throw new Error("counselor missing");

  const [existing] = await db
    .select({ id: psychTests.id })
    .from(psychTests)
    .where(and(eq(psychTests.workspaceId, workspace.id), eq(psychTests.title, TEST_TITLE)))
    .limit(1);
  if (existing) {
    console.log(`psych demo already exists: ${TEST_TITLE}`);
    process.exit(0);
  }

  const [test] = await db
    .insert(psychTests)
    .values({
      workspaceId: workspace.id,
      title: TEST_TITLE,
      description:
        "آزمون کوتاه ۱۲ سوالی برای آشنایی با چهار بُعد شخصیتی و یکی از ۱۶ تیپ. نتیجه صرفاً برای خودشناسی است و جای ارزیابی تخصصی را نمی‌گیرد.",
      status: "published",
      resultRulesJson: RULES,
      createdBy: counselor.id,
      publishedAt: new Date(),
    })
    .returning();

  const dimensionIds = new Map<string, PsychDimension>();
  for (const [index, dimension] of DIMENSIONS.entries()) {
    const [row] = await db
      .insert(psychDimensions)
      .values({
        testId: test.id,
        sortOrder: index,
        title: dimension.title,
        description: dimension.description,
        bandsJson: dimension.bands,
      })
      .returning();
    dimensionIds.set(dimension.key, row);
  }

  for (const [index, question] of QUESTIONS.entries()) {
    const dimension = dimensionIds.get(question.dimension);
    if (!dimension) throw new Error(`dimension missing: ${question.dimension}`);
    const [questionRow] = await db
      .insert(psychQuestions)
      .values({ testId: test.id, sortOrder: index, body: question.body })
      .returning();

    await db.insert(psychOptions).values(
      question.options.map((option, optionIndex) => ({
        questionId: questionRow.id,
        sortOrder: optionIndex,
        body: option.body,
        scoresJson:
          option.pole === HIGH_POLE[question.dimension]
            ? { [dimension.id]: 1 }
            : {},
      })),
    );
  }

  console.log(`psych demo ready: ${TEST_TITLE} (${QUESTIONS.length} questions, ${RULES.length} results)`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
