export type PoolChapterSeed = {
  title: string;
  tests: number;
  exercises: number;
  pages: number;
};

export type PoolBookSeed = {
  subject: string;
  grade: string;
  publisher: string;
  title: string;
  unitType: "test";
  priority: number;
  chapters: PoolChapterSeed[];
};

type Blueprint = {
  subject: string;
  grade: string;
  titles: string[];
  testsPerChapter: number;
  bookTitle?: string;
  exercisesPerChapter?: number;
  pagesPerChapter?: number;
  priority?: number;
};

const PUBLISHERS = [
  { name: "خیلی سبز", factor: 1 },
  { name: "گاج", factor: 1.1 },
  { name: "مبتکران", factor: 0.9 },
] as const;

const lessons = (count: number) => Array.from({ length: count }, (_, index) => `درس ${index + 1}`);
const units = (count: number) => Array.from({ length: count }, (_, index) => `Unit ${index + 1}`);

const BLUEPRINTS: Blueprint[] = [
  // ── تجربی / ریاضی ──────────────────────────────────────────────────────
  {
    subject: "زیست‌شناسی",
    grade: "دهم",
    testsPerChapter: 110,
    titles: [
      "دنیای زنده",
      "گوارش و جذب مواد",
      "تبادلات گازی",
      "گردش مواد در بدن",
      "تنظیم اسمزی و دفع مواد زائد",
      "از یاخته تا گیاه",
      "جذب و انتقال مواد در گیاهان",
    ],
  },
  {
    subject: "زیست‌شناسی",
    grade: "یازدهم",
    testsPerChapter: 105,
    titles: [
      "تنظیم عصبی",
      "حواس",
      "دستگاه حرکتی",
      "ایمنی",
      "تقسیم یاخته",
      "تولیدمثل",
      "تولیدمثل در گیاهان",
      "رفتارهای جانوران",
    ],
  },
  {
    subject: "زیست‌شناسی",
    grade: "دوازدهم",
    testsPerChapter: 120,
    titles: [
      "مولکول‌های اطلاعاتی",
      "جریان اطلاعات",
      "انتقال اطلاعات",
      "تنظیم بیان ژن",
      "از ماده به انرژی",
      "از انرژی به ماده",
      "فناوری‌های نوین زیستی",
      "رفتارهای جانوران",
    ],
  },
  { subject: "شیمی", grade: "دهم", testsPerChapter: 100, titles: [
    "کیهان، زادگاه الفبای هستی",
    "ردپای گازها در زندگی",
    "آب، آهنگ زندگی",
  ] },
  { subject: "شیمی", grade: "یازدهم", testsPerChapter: 105, titles: [
    "قدر هدایای زمینی را بدانیم",
    "در پی غذای سالم",
    "پوشاک، نیازی پایان‌ناپذیر",
  ] },
  { subject: "شیمی", grade: "دوازدهم", testsPerChapter: 110, titles: [
    "مولکول‌ها در خدمت تندرستی",
    "آسایش و رفاه در سایه شیمی",
    "شیمی پیشرو",
    "شیمی، راهی به سوی آینده روشن",
  ] },
  { subject: "فیزیک", grade: "دهم", testsPerChapter: 95, titles: [
    "فیزیک و اندازه‌گیری",
    "کار، انرژی و توان",
    "ویژگی‌های فیزیکی مواد",
    "دما و گرما",
  ] },
  { subject: "فیزیک", grade: "یازدهم", testsPerChapter: 100, titles: [
    "الکتریسیته ساکن",
    "جریان الکتریکی و مدارهای جریان مستقیم",
    "مغناطیس",
    "القای الکترومغناطیسی",
  ] },
  { subject: "فیزیک", grade: "دوازدهم", testsPerChapter: 105, titles: [
    "حرکت بر خط راست",
    "دینامیک و حرکت دایره‌ای",
    "نوسان و موج",
    "برهم‌کنش موج‌ها",
    "آشنایی با فیزیک اتمی و هسته‌ای",
  ] },
  { subject: "ریاضی", grade: "دهم", testsPerChapter: 90, titles: [
    "مجموعه، الگو و دنباله",
    "مثلثات",
    "توان‌های رسیدن",
    "چندجمله‌ای‌ها",
    "تابع",
    "شمارش، بدون شمردن",
  ] },
  { subject: "ریاضی", grade: "یازدهم", testsPerChapter: 90, titles: [
    "هندسه تحلیلی و جبر",
    "تابع",
    "توابع نمایی و لگاریتمی",
    "حد و پیوستگی",
    "احتمال",
    "آمار",
  ] },
  { subject: "ریاضی", grade: "دوازدهم", testsPerChapter: 95, titles: [
    "تابع",
    "مثلثات",
    "حدهای نامتناهی و حد در بی‌نهایت",
    "مشتق",
    "کاربردهای مشتق",
    "هندسه",
    "احتمال",
  ] },
  { subject: "حسابان", grade: "دهم", bookTitle: "ریاضی دهم", testsPerChapter: 95, titles: [
    "مجموعه، الگو و دنباله",
    "مثلثات",
    "توان‌های رسیدن",
    "چندجمله‌ای‌ها",
    "تابع",
    "شمارش، بدون شمردن",
  ] },
  { subject: "حسابان", grade: "یازدهم", bookTitle: "حسابان ۱", testsPerChapter: 100, titles: [
    "جبر و معادله",
    "تابع",
    "توابع نمایی و لگاریتمی",
    "مثلثات",
    "حد و پیوستگی",
  ] },
  { subject: "حسابان", grade: "دوازدهم", bookTitle: "حسابان ۲", testsPerChapter: 105, titles: [
    "تابع",
    "مثلثات",
    "حد و پیوستگی",
    "مشتق",
    "کاربرد مشتق",
  ] },
  { subject: "هندسه", grade: "دهم", bookTitle: "هندسه ۱", testsPerChapter: 75, titles: [
    "ترسیم‌های هندسی",
    "قضیه تالس، تشابه و کاربردهای آن",
    "چندضلعی‌ها",
    "تجسم فضایی",
  ] },
  { subject: "هندسه", grade: "یازدهم", bookTitle: "هندسه ۲", testsPerChapter: 75, titles: [
    "دایره",
    "تبدیل‌های هندسی",
    "روابط طولی در مثلث",
    "هندسه فضایی",
  ] },
  { subject: "هندسه", grade: "دوازدهم", bookTitle: "هندسه ۳", testsPerChapter: 80, titles: [
    "دایره",
    "تبدیل‌های هندسی",
    "مقاطع مخروطی",
    "بردارها و هندسه تحلیلی",
  ] },
  { subject: "گسسته", grade: "دوازدهم", bookTitle: "ریاضیات گسسته", testsPerChapter: 70, titles: [
    "آشنایی با نظریه اعداد",
    "گراف و مدل‌سازی",
    "ترکیبیات",
    "احتمال",
  ] },
  { subject: "آمار و احتمال", grade: "یازدهم", testsPerChapter: 65, titles: [
    "آشنایی با مبانی ریاضیات",
    "احتمال",
    "آمار توصیفی",
    "آمار استنباطی",
  ] },
  { subject: "زمین‌شناسی", grade: "یازدهم", testsPerChapter: 55, titles: [
    "آفرینش کیهان و تکوین زمین",
    "منابع آب و خاک",
    "آب در هوا و زمین",
    "زمین‌ساخت ورقه‌ای",
    "فسیل و تاریخ زمین",
    "کانی‌ها و سنگ‌ها",
    "زمین‌لرزه و گسل",
    "زمین و انرژی",
  ] },

  // ── عمومی ──────────────────────────────────────────────────────────────
  { subject: "ادبیات فارسی", grade: "دهم", testsPerChapter: 18, titles: lessons(18) },
  { subject: "ادبیات فارسی", grade: "یازدهم", testsPerChapter: 18, titles: lessons(18) },
  { subject: "ادبیات فارسی", grade: "دوازدهم", testsPerChapter: 20, titles: lessons(18) },
  { subject: "عربی", grade: "دهم", testsPerChapter: 55, titles: lessons(10) },
  { subject: "عربی", grade: "یازدهم", testsPerChapter: 55, titles: lessons(9) },
  { subject: "عربی", grade: "دوازدهم", testsPerChapter: 60, titles: lessons(9) },
  { subject: "دین و زندگی", grade: "دهم", testsPerChapter: 45, titles: lessons(12) },
  { subject: "دین و زندگی", grade: "یازدهم", testsPerChapter: 45, titles: lessons(11) },
  { subject: "دین و زندگی", grade: "دوازدهم", testsPerChapter: 50, titles: lessons(10) },
  { subject: "زبان انگلیسی", grade: "دهم", testsPerChapter: 80, titles: units(4) },
  { subject: "زبان انگلیسی", grade: "یازدهم", testsPerChapter: 80, titles: units(4) },
  { subject: "زبان انگلیسی", grade: "دوازدهم", testsPerChapter: 85, titles: units(4) },

  // ── انسانی ─────────────────────────────────────────────────────────────
  { subject: "ریاضی و آمار", grade: "دهم", bookTitle: "ریاضی و آمار ۱", testsPerChapter: 65, titles: [
    "مجموعه، منطق و شمارش",
    "آمار",
    "احتمال",
    "توابع",
  ] },
  { subject: "ریاضی و آمار", grade: "یازدهم", bookTitle: "ریاضی و آمار ۲", testsPerChapter: 70, titles: [
    "آمار",
    "احتمال",
    "توابع",
    "مدل‌سازی",
  ] },
  { subject: "ریاضی و آمار", grade: "دوازدهم", bookTitle: "ریاضی و آمار ۳", testsPerChapter: 70, titles: [
    "آمار",
    "احتمال",
    "توابع",
    "کاربرد ریاضی در زندگی",
  ] },
  { subject: "علوم و فنون ادبی", grade: "دهم", bookTitle: "علوم و فنون ادبی ۱", testsPerChapter: 60, titles: [
    "زبان و ادبیات",
    "عروض و قافیه",
    "آرایه‌های ادبی",
    "نقد و تحلیل",
  ] },
  { subject: "علوم و فنون ادبی", grade: "یازدهم", bookTitle: "علوم و فنون ادبی ۲", testsPerChapter: 60, titles: [
    "تاریخ ادبیات",
    "عروض و قافیه",
    "آرایه‌های ادبی",
    "نقد و تحلیل",
  ] },
  { subject: "علوم و فنون ادبی", grade: "دوازدهم", bookTitle: "علوم و فنون ادبی ۳", testsPerChapter: 65, titles: [
    "تاریخ ادبیات",
    "عروض و قافیه",
    "آرایه‌های ادبی",
    "نقد و تحلیل",
  ] },
  { subject: "اقتصاد", grade: "دهم", testsPerChapter: 50, titles: [
    "اقتصاد چیست؟",
    "تولید و توزیع",
    "بازار و قیمت",
    "دولت و اقتصاد",
  ] },
  { subject: "تاریخ", grade: "دهم", testsPerChapter: 45, titles: lessons(8) },
  { subject: "تاریخ", grade: "یازدهم", testsPerChapter: 45, titles: lessons(8) },
  { subject: "تاریخ", grade: "دوازدهم", testsPerChapter: 50, titles: lessons(8) },
  { subject: "جغرافیا", grade: "دهم", testsPerChapter: 50, titles: [
    "جغرافیا و پدیده‌های جغرافیایی",
    "موقعیت و محیط",
    "منابع و فعالیت‌های اقتصادی",
    "جمعیت و شهرها",
  ] },
  { subject: "جغرافیا", grade: "یازدهم", testsPerChapter: 50, titles: lessons(4) },
  { subject: "جغرافیا", grade: "دوازدهم", testsPerChapter: 50, titles: lessons(4) },
  { subject: "جامعه‌شناسی", grade: "دهم", testsPerChapter: 50, titles: [
    "جهان اجتماعی",
    "فرهنگ",
    "جامعه و خانواده",
    "نظام اجتماعی",
  ] },
  { subject: "جامعه‌شناسی", grade: "یازدهم", testsPerChapter: 50, titles: lessons(4) },
  { subject: "جامعه‌شناسی", grade: "دوازدهم", testsPerChapter: 50, titles: lessons(4) },
  { subject: "منطق", grade: "دهم", testsPerChapter: 50, titles: [
    "منطق و اندیشه",
    "مفهوم و مصداق",
    "تعریف",
    "قیاس",
  ] },
  { subject: "فلسفه", grade: "یازدهم", bookTitle: "فلسفه ۱", testsPerChapter: 45, titles: [
    "فلسفه چیست؟",
    "چیستی انسان",
    "انسان و خدا",
    "انسان و جهان",
  ] },
  { subject: "فلسفه", grade: "دوازدهم", bookTitle: "فلسفه ۲", testsPerChapter: 45, titles: [
    "هستی و چیستی",
    "جهان ممکنات",
    "خدا و جهان",
    "انسان و آزادی",
  ] },
  { subject: "روان‌شناسی", grade: "یازدهم", testsPerChapter: 50, titles: [
    "روان‌شناسی چیست؟",
    "احساس و ادراک",
    "یادگیری",
    "حافظه و تفکر",
  ] },
];

export function buildPoolBooks(): PoolBookSeed[] {
  const books: PoolBookSeed[] = [];
  for (const blueprint of BLUEPRINTS) {
    for (const publisher of PUBLISHERS) {
      const chapters = blueprint.titles.map((title) => {
        const tests = Math.max(10, Math.round(blueprint.testsPerChapter * publisher.factor));
        return {
          title,
          tests,
          exercises:
            blueprint.exercisesPerChapter ??
            Math.max(3, Math.round(tests * 0.25)),
          pages: blueprint.pagesPerChapter ?? 0,
        } satisfies PoolChapterSeed;
      });
      const baseTitle = blueprint.bookTitle ?? `${blueprint.subject} ${blueprint.grade}`;
      books.push({
        subject: blueprint.subject,
        grade: blueprint.grade,
        publisher: publisher.name,
        title: `${baseTitle} — ${publisher.name}`,
        unitType: "test",
        priority: blueprint.priority ?? 3,
        chapters,
      });
    }
  }
  return books;
}

export const POOL_PUBLISHERS = PUBLISHERS.map((publisher) => publisher.name);
