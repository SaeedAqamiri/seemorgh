import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { questionBanks, questions, subjects, users } from "../src/db/schema";
import type { Difficulty, SourceType } from "../src/lib/exam";

type SeedQuestion = {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  body: string;
  options: string[];
  correct: number;
  explanation: string;
  sourceType: SourceType;
  sourceTitle: string;
  sourceYear?: string;
  sourceDate?: string;
  tags?: string;
};

const KONKUR: Array<{ year: string; title: string }> = [
  { year: "۱۳۹۸", title: "کنکور سراسری تجربی ۱۳۹۸" },
  { year: "۱۴۰۰", title: "کنکور سراسری ریاضی ۱۴۰۰" },
  { year: "۱۴۰۲", title: "کنکور سراسری تجربی ۱۴۰۲" },
  { year: "۱۴۰۳", title: "کنکور سراسری انسانی ۱۴۰۳" },
];

const MOCK = [
  { date: "۱۴۰۴/۰۸/۱۶", title: "آزمون قلمچی ۱۴۰۴/۰۸/۱۶" },
  { date: "۱۴۰۳/۱۱/۰۴", title: "آزمون گاج ۱۴۰۳/۱۱/۰۴" },
  { date: "۱۴۰۴/۰۲/۲۰", title: "آزمون ماز ۱۴۰۴/۰۲/۲۰" },
];

const QUESTIONS: SeedQuestion[] = [
  { subject: "ریاضی", topic: "تابع", difficulty: "easy", body: "دامنهٔ تابع $f(x)=\\sqrt{x-2}$ کدام است؟", options: ["$[2,+\\infty)$", "$(-\\infty,2]$", "$\\mathbb{R}$", "$(2,+\\infty)$"], correct: 1, explanation: "زیر رادیکال باید نامنفی باشد؛ پس $x\\ge 2$.", sourceType: "konkur", sourceTitle: KONKUR[0].title, sourceYear: KONKUR[0].year, tags: "تابع,دامنه" },
  { subject: "ریاضی", topic: "مشتق", difficulty: "easy", body: "مشتق تابع $f(x)=x^3$ کدام است؟", options: ["$3x^2$", "$x^2$", "$3x$", "$x^4/4$"], correct: 1, explanation: "با قاعدهٔ توان، $f'(x)=3x^2$.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "مشتق" },
  { subject: "ریاضی", topic: "حد", difficulty: "medium", body: "حاصل $\\lim_{x\\to 0}\\frac{\\sin 3x}{x}$ کدام است؟", options: ["$0$", "$1$", "$3$", "بی‌نهایت"], correct: 3, explanation: "$\\frac{\\sin 3x}{x}=3\\cdot\\frac{\\sin 3x}{3x}\\to 3$.", sourceType: "mock", sourceTitle: MOCK[0].title, sourceDate: MOCK[0].date, tags: "حد,مثلثات" },
  { subject: "ریاضی", topic: "انتگرال", difficulty: "medium", body: "مقدار $\\int_0^1 2x\\,dx$ کدام است؟", options: ["$0$", "$1$", "$2$", "$1/2$"], correct: 2, explanation: "$\\int 2x\\,dx=x^2$ و $1^2-0^2=1$.", sourceType: "konkur", sourceTitle: KONKUR[1].title, sourceYear: KONKUR[1].year, tags: "انتگرال" },
  { subject: "ریاضی", topic: "مشتق", difficulty: "hard", body: "مشتق تابع $f(x)=\\tan x$ کدام است؟", options: ["$\\cot x$", "$1+\\tan^2 x$", "$-\\csc^2 x$", "$\\sin x\\cos x$"], correct: 2, explanation: "$(\\tan x)'=1/\\cos^2x=1+\\tan^2x$.", sourceType: "konkur", sourceTitle: KONKUR[2].title, sourceYear: KONKUR[2].year, tags: "مشتق,مثلثات" },
  { subject: "ریاضی", topic: "ترکیب توابع", difficulty: "very_hard", body: "اگر $f(x)=x^2$ و $g(x)=\\sqrt{x}$ باشد، $(f\\circ g)(x)$ برای $x\\ge 0$ کدام است؟", options: ["$x$", "$x^2$", "$\\sqrt{x}$", "$x^4$"], correct: 1, explanation: "$f(g(x))=(\\sqrt{x})^2=x$ برای $x\\ge0$.", sourceType: "mock", sourceTitle: MOCK[1].title, sourceDate: MOCK[1].date, tags: "ترکیب توابع" },
  { subject: "ریاضی", topic: "معادله درجه دوم", difficulty: "medium", body: "ریشه‌های معادلهٔ $x^2-5x+6=0$ کدام‌اند؟", options: ["$1,6$", "$2,3$", "$-2,-3$", "$1,5$"], correct: 2, explanation: "$(x-2)(x-3)=0$.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "معادله" },

  { subject: "فیزیک", topic: "قانون دوم نیوتن", difficulty: "easy", body: "واحد نیرو در SI کدام است؟", options: ["ژول", "وات", "نیوتن", "پاسکال"], correct: 3, explanation: "نیرو بر حسب نیوتن ($kg\\cdot m/s^2$) است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "نیرو" },
  { subject: "فیزیک", topic: "نور", difficulty: "easy", body: "سرعت نور در خلأ تقریباً کدام است؟", options: ["$3\\times10^5\\,m/s$", "$3\\times10^8\\,m/s$", "$3\\times10^{10}\\,m/s$", "$340\\,m/s$"], correct: 2, explanation: "سرعت نور در خلأ حدود $3\\times10^8$ متر بر ثانیه است.", sourceType: "konkur", sourceTitle: KONKUR[0].title, sourceYear: KONKUR[0].year, tags: "نور" },
  { subject: "فیزیک", topic: "دینامیک", difficulty: "medium", body: "بر جسمی با جرم $2\\,kg$ شتاب $3\\,m/s^2$ وارد می‌شود. نیروی خالص چند نیوتن است؟", options: ["$1.5$", "$5$", "$6$", "$9$"], correct: 3, explanation: "$F=ma=2\\times3=6\\,N$.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "دینامیک" },
  { subject: "فیزیک", topic: "انرژی", difficulty: "medium", body: "انرژی جنبشی جسمی با جرم $m$ و سرعت $v$ برابر است با:", options: ["$mv$", "$\\frac12 mv^2$", "$mgh$", "$\\frac12 kx^2$"], correct: 2, explanation: "رابطهٔ انرژی جنبشی $K=\\frac12 mv^2$ است.", sourceType: "mock", sourceTitle: MOCK[2].title, sourceDate: MOCK[2].date, tags: "انرژی" },
  { subject: "فیزیک", topic: "مدار الکتریکی", difficulty: "hard", body: "مقاومت معادل دو مقاومت $4\\,\\Omega$ و $4\\,\\Omega$ که موازی بسته شده‌اند چند اهم است؟", options: ["$8$", "$4$", "$2$", "$1$"], correct: 3, explanation: "$\\frac1R=\\frac14+\\frac14=\\frac12$ پس $R=2\\,\\Omega$.", sourceType: "konkur", sourceTitle: KONKUR[2].title, sourceYear: KONKUR[2].year, tags: "مقاومت,مدار" },
  { subject: "فیزیک", topic: "نوسان", difficulty: "very_hard", body: "دورهٔ تناوب آونگ ساده با طول $L$ در جایی که شتاب گرانش $g$ است، کدام است؟", options: ["$2\\pi\\sqrt{L/g}$", "$2\\pi\\sqrt{g/L}$", "$\\sqrt{L/g}$", "$2\\pi L/g$"], correct: 1, explanation: "دورهٔ آونگ ساده $T=2\\pi\\sqrt{L/g}$ است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "نوسان" },
  { subject: "فیزیک", topic: "قوانین نیوتن", difficulty: "easy", body: "اگر بر جسمی نیروی خالص وارد نشود، جسم در حال سکون یا حرکت یکنواخت می‌ماند. این بیان کدام قانون است؟", options: ["قانون اول نیوتن", "قانون دوم نیوتن", "قانون سوم نیوتن", "قانون گرانش"], correct: 1, explanation: "این تعریف قانون اول نیوتن (惯性) است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "قوانین نیوتن" },

  { subject: "شیمی", topic: "ساختار اتم", difficulty: "easy", body: "عدد اتمی هیدروژن کدام است؟", options: ["$0$", "$1$", "$2$", "$3$"], correct: 2, explanation: "هیدروژن یک پروتون دارد؛ عدد اتمی آن ۱ است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "اتم" },
  { subject: "شیمی", topic: "ترکیبات", difficulty: "easy", body: "فرمول شیمیایی آب کدام است؟", options: ["$H_2O$", "$CO_2$", "$CH_4$", "$H_2O_2$"], correct: 1, explanation: "آب از دو اتم هیدروژن و یک اتم اکسیژن ساخته شده است.", sourceType: "konkur", sourceTitle: KONKUR[0].title, sourceYear: KONKUR[0].year, tags: "فرمول" },
  { subject: "شیمی", topic: "اسید و باز", difficulty: "medium", body: "pH محلول اسید قوی با غلظت $0.01\\,M$ چند است؟", options: ["$1$", "$2$", "$7$", "$12$"], correct: 2, explanation: "برای اسید قوی تک‌پروتونی $[H^+]=0.01$ و $pH=-\\log(0.01)=2$.", sourceType: "mock", sourceTitle: MOCK[0].title, sourceDate: MOCK[0].date, tags: "pH,اسید" },
  { subject: "شیمی", topic: "ترکیبات آلی", difficulty: "medium", body: "فرمول متان کدام است؟", options: ["$CH_4$", "$C_2H_6$", "$C_2H_4$", "$C_2H_2$"], correct: 1, explanation: "متان ساده‌ترین آلکان با فرمول $CH_4$ است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "آلکان" },
  { subject: "شیمی", topic: "عدد اکسایش", difficulty: "hard", body: "عدد اکسایش منگنز در $KMnO_4$ کدام است؟", options: ["$+2$", "$+4$", "$+6$", "$+7$"], correct: 4, explanation: "$(+1)+x+4(-2)=0$ بنابراین $x=+7$.", sourceType: "konkur", sourceTitle: KONKUR[2].title, sourceYear: KONKUR[2].year, tags: "اکسایش" },
  { subject: "شیمی", topic: "ترمودینامیک", difficulty: "very_hard", body: "اگر $\\Delta H$ واکنشی منفی و $\\Delta S$ آن مثبت باشد، واکنش در دماهای بالا چگونه است؟", options: ["همیشه خودبه‌خودی", "همیشه غیرخودبه‌خودی", "در دماهای بالا خودبه‌خودی", "در دماهای پایین خودبه‌خودی"], correct: 3, explanation: "$\\Delta G=\\Delta H-T\\Delta S$؛ با $\\Delta H<0$ و $\\Delta S>0$، در دماهای بالا $\\Delta G<0$ می‌شود.", sourceType: "mock", sourceTitle: MOCK[1].title, sourceDate: MOCK[1].date, tags: "ترمودینامیک" },
  { subject: "شیمی", topic: "جدول تناوبی", difficulty: "easy", body: "گازهای نجیب در کدام گروه جدول تناوبی قرار دارند؟", options: ["گروه ۱", "گروه ۲", "گروه ۱۷", "گروه ۱۸"], correct: 4, explanation: "گازهای نجیب در گروه ۱۸ (VIIIA) هستند.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "جدول تناوبی" },

  { subject: "زیست‌شناسی", topic: "ژنتیک", difficulty: "easy", body: "واحد وراثت چیست؟", options: ["ژن", "پروتئین", "سلول", "بافت"], correct: 1, explanation: "ژن واحد انتقال صفات از والدین به فرزندان است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "ژنتیک" },
  { subject: "زیست‌شناسی", topic: "دستگاه تنفس", difficulty: "easy", body: "اندام اصلی تبادل گاز در انسان کدام است؟", options: ["کبد", "کلیه", "شش", "معده"], correct: 3, explanation: "تبادل گاز در کیسه‌های هوایی شش انجام می‌شود.", sourceType: "konkur", sourceTitle: KONKUR[0].title, sourceYear: KONKUR[0].year, tags: "تنفس" },
  { subject: "زیست‌شناسی", topic: "تقسیم سلولی", difficulty: "medium", body: "کدام تقسیم سلولی باعث تولید سلول‌های دختر با همان تعداد کروموزوم سلول مادر می‌شود؟", options: ["میتوز", "میوز", "لقاح", "آپوپتوز"], correct: 1, explanation: "در میتوز تعداد کروموزوم‌ها ثابت می‌ماند.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "میتوز" },
  { subject: "زیست‌شناسی", topic: "مولکول وراثت", difficulty: "medium", body: "مادهٔ وراثتی اصلی در بیشتر جانداران کدام است؟", options: ["RNA", "DNA", "پروتئین", "لیپید"], correct: 2, explanation: "DNA حامل اصلی اطلاعات ژنتیکی است.", sourceType: "mock", sourceTitle: MOCK[0].title, sourceDate: MOCK[0].date, tags: "DNA" },
  { subject: "زیست‌شناسی", topic: "ژنتیک", difficulty: "hard", body: "از آمیزش دو فرد $Aa$ با وراثت ساده، نسبت فنوتیپی غالب به مغلوب در فرزندان چقدر است؟", options: ["$1:1$", "$3:1$", "$1:2:1$", "$9:3:3:1$"], correct: 2, explanation: "مربع پانت: $AA,Aa,Aa,aa$؛ نسبت فنوتیپی $3:1$.", sourceType: "konkur", sourceTitle: KONKUR[2].title, sourceYear: KONKUR[2].year, tags: "ژنتیک" },
  { subject: "زیست‌شناسی", topic: "تنفس سلولی", difficulty: "very_hard", body: "در تنفس هوازی کامل یک مولکول گلوکز، حدود چند ATP تولید می‌شود؟", options: ["$2$", "$4$", "$۱۸$", "$۳۶$ تا $۳۸$"], correct: 4, explanation: "با احتساب زنجیرهٔ انتقال الکترون، بازده کل حدود ۳۶ تا ۳۸ ATP است.", sourceType: "mock", sourceTitle: MOCK[1].title, sourceDate: MOCK[1].date, tags: "تنفس سلولی" },
  { subject: "زیست‌شناسی", topic: "فتوسنتز", difficulty: "easy", body: "فتوسنتز در کدام اندامک سلول گیاهی انجام می‌شود؟", options: ["میتوکندری", "کلروپلاست", "ریبوزوم", "واکوئل"], correct: 2, explanation: "کلروپلاست محل فتوسنتز است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "فتوسنتز" },

  { subject: "ادبیات فارسی", topic: "شاهنامه", difficulty: "easy", body: "سرایندهٔ شاهنامه کیست؟", options: ["سعدی", "حافظ", "فردوسی", "نظامی"], correct: 3, explanation: "شاهنامه اثر حکیم ابوالقاسم فردوسی است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "شاهنامه" },
  { subject: "ادبیات فارسی", topic: "مثنوی", difficulty: "easy", body: "«بشنو این نی چون شکایت می‌کند» آغاز کدام اثر است؟", options: ["گلستان", "مثنوی معنوی", "بوستان", "دیوان حافظ"], correct: 2, explanation: "این بیت آغاز مثنوی معنوی مولوی است.", sourceType: "konkur", sourceTitle: KONKUR[3].title, sourceYear: KONKUR[3].year, tags: "مولوی" },
  { subject: "ادبیات فارسی", topic: "آرایه‌های ادبی", difficulty: "medium", body: "در عبارت «چشمهٔ خورشید» کدام آرایه به کار رفته است؟", options: ["تشبیه", "استعاره", "کنایه", "مجاز"], correct: 2, explanation: "خورشید به چشمه تشبیه نشده بلکه چشمه استعاره از خورشید است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "آرایه" },
  { subject: "ادبیات فارسی", topic: "قالب شعر", difficulty: "medium", body: "شعری با قافیهٔ مصراع اول و دوم و سپس مصراع دوم هر بیت، در قالب کدام است؟", options: ["قصیده", "غزل", "مثنوی", "رباعی"], correct: 2, explanation: "این ویژگی قالب غزل است.", sourceType: "mock", sourceTitle: MOCK[2].title, sourceDate: MOCK[2].date, tags: "قالب" },
  { subject: "ادبیات فارسی", topic: "نثر عرفانی", difficulty: "hard", body: "کتاب «تذکرة الاولیاء» اثر کیست؟", options: ["عطار نیشابوری", "سنایی", "جامی", "غزالی"], correct: 1, explanation: "تذکرة الاولیاء از عطار نیشابوری است.", sourceType: "konkur", sourceTitle: KONKUR[3].title, sourceYear: KONKUR[3].year, tags: "عطار" },
  { subject: "ادبیات فارسی", topic: "عروض", difficulty: "very_hard", body: "وزن «فعولن فعولن فعولن فعل» متعلق به کدام بحر است؟", options: ["هزج", "رجز", "متقارب", "رمل"], correct: 3, explanation: "این وزن از بحر متقارب است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "عروض" },
  { subject: "ادبیات فارسی", topic: "گلستان", difficulty: "easy", body: "کتاب «گلستان» اثر کیست؟", options: ["حافظ", "سعدی", "مولوی", "خیام"], correct: 2, explanation: "گلستان نوشتهٔ سعدی شیرازی است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "سعدی" },

  { subject: "عربی", topic: "جمع مکسر", difficulty: "easy", body: "جمع واژهٔ «کِتاب» کدام است؟", options: ["کاتِب", "کُتُب", "مکتوب", "کتابة"], correct: 2, explanation: "«کتب» جمع مکسر کتاب است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "جمع" },
  { subject: "عربی", topic: "فعل ماضی", difficulty: "easy", body: "معنای «ذَهَبَ» چیست؟", options: ["نوشت", "رفت", "آمد", "خورد"], correct: 2, explanation: "«ذهب» یعنی رفت.", sourceType: "konkur", sourceTitle: KONKUR[3].title, sourceYear: KONKUR[3].year, tags: "ماضی" },
  { subject: "عربی", topic: "اعراب", difficulty: "medium", body: "اعراب فاعل در جملهٔ عربی چیست؟", options: ["مرفوع", "منصوب", "مجرور", "مجزوم"], correct: 1, explanation: "فاعل همیشه مرفوع است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "اعراب" },
  { subject: "عربی", topic: "ترجمه", difficulty: "medium", body: "ترجمهٔ «العِلمُ نورٌ» کدام است؟", options: ["دانش تاریکی است", "دانش نور است", "نور دانش است", "دانش ثروت است"], correct: 2, explanation: "«العلم» دانش و «نور» نور است.", sourceType: "mock", sourceTitle: MOCK[0].title, sourceDate: MOCK[0].date, tags: "ترجمه" },
  { subject: "عربی", topic: "اشتقاق", difficulty: "hard", body: "اسم فاعل از ریشهٔ «کَتَبَ» کدام است؟", options: ["مکتوب", "کاتِب", "کتاب", "مَکتَب"], correct: 2, explanation: "اسم فاعل ثلاثی مجرد بر وزن فاعل می‌آید.", sourceType: "konkur", sourceTitle: KONKUR[1].title, sourceYear: KONKUR[1].year, tags: "اشتقاق" },
  { subject: "عربی", topic: "اعراب", difficulty: "very_hard", body: "در «إنَّ اللهَ غفورٌ»، اعراب «غفورٌ» چیست؟", options: ["خبر إنّ و مرفوع", "اسم إنّ و منصوب", "فاعل و مرفوع", "مفعول و منصوب"], correct: 1, explanation: "«غفورٌ» خبر إنّ است و مرفوع می‌شود.", sourceType: "mock", sourceTitle: MOCK[1].title, sourceDate: MOCK[1].date, tags: "إنّ" },
  { subject: "عربی", topic: "مضاد", difficulty: "easy", body: "مضاد «کَبیر» کدام است؟", options: ["صغیر", "جمیل", "طویل", "قریب"], correct: 1, explanation: "کبیر به معنای بزرگ و صغیر به معنای کوچک است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "مضاد" },

  { subject: "زبان انگلیسی", topic: "Past tense", difficulty: "easy", body: "Past tense of “go” is:", options: ["goed", "gone", "went", "going"], correct: 3, explanation: "The past tense of go is went.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "grammar" },
  { subject: "زبان انگلیسی", topic: "Plural", difficulty: "easy", body: "Choose the correct plural of “child”:", options: ["childs", "children", "childes", "child"], correct: 2, explanation: "Child has an irregular plural: children.", sourceType: "konkur", sourceTitle: KONKUR[0].title, sourceYear: KONKUR[0].year, tags: "plural" },
  { subject: "زبان انگلیسی", topic: "Present simple", difficulty: "medium", body: "She ___ to school every day.", options: ["go", "goes", "going", "gone"], correct: 2, explanation: "With she/he/it we add -es: goes.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "grammar" },
  { subject: "زبان انگلیسی", topic: "Synonym", difficulty: "medium", body: "Which word is closest in meaning to “happy”?", options: ["sad", "glad", "angry", "tired"], correct: 2, explanation: "Glad means happy.", sourceType: "mock", sourceTitle: MOCK[2].title, sourceDate: MOCK[2].date, tags: "vocabulary" },
  { subject: "زبان انگلیسی", topic: "Passive voice", difficulty: "hard", body: "Choose the passive form of “Shakespeare wrote Hamlet”.", options: ["Hamlet was written by Shakespeare.", "Hamlet wrote Shakespeare.", "Hamlet is written by Shakespeare.", "Shakespeare was written Hamlet."], correct: 1, explanation: "Past simple passive: was/were + past participle.", sourceType: "konkur", sourceTitle: KONKUR[2].title, sourceYear: KONKUR[2].year, tags: "passive" },
  { subject: "زبان انگلیسی", topic: "Conditional", difficulty: "very_hard", body: "If I ___ known, I would have helped you.", options: ["have", "had", "has", "would"], correct: 2, explanation: "Third conditional uses had + past participle.", sourceType: "mock", sourceTitle: MOCK[1].title, sourceDate: MOCK[1].date, tags: "conditional" },
  { subject: "زبان انگلیسی", topic: "Antonym", difficulty: "easy", body: "The opposite of “expensive” is:", options: ["cheap", "rich", "costly", "valuable"], correct: 1, explanation: "Cheap is the opposite of expensive.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "vocabulary" },

  { subject: "دین و زندگی", topic: "نماز", difficulty: "easy", body: "نماز صبح چند رکعت است؟", options: ["یک", "دو", "سه", "چهار"], correct: 2, explanation: "نماز صبح دو رکعت است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "نماز" },
  { subject: "دین و زندگی", topic: "قبله", difficulty: "easy", body: "قبلهٔ مسلمانان کدام است؟", options: ["مسجدالنبی", "کعبه", "مسجدالاقصی", "قبرستان بقیع"], correct: 2, explanation: "قبلهٔ مسلمانان خانهٔ کعبه است.", sourceType: "konkur", sourceTitle: KONKUR[3].title, sourceYear: KONKUR[3].year, tags: "قبله" },
  { subject: "دین و زندگی", topic: "امامت", difficulty: "medium", body: "اولین امام شیعیان کیست؟", options: ["حضرت علی (ع)", "حضرت حسن (ع)", "حضرت حسین (ع)", "حضرت رضا (ع)"], correct: 1, explanation: "امام اول حضرت علی (ع) است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "امامت" },
  { subject: "دین و زندگی", topic: "قرآن", difficulty: "medium", body: "سورهٔ حمد چند آیه دارد؟", options: ["پنج", "شش", "هفت", "هشت"], correct: 3, explanation: "سورهٔ حمد هفت آیه دارد.", sourceType: "mock", sourceTitle: MOCK[0].title, sourceDate: MOCK[0].date, tags: "قرآن" },
  { subject: "دین و زندگی", topic: "قصص قرآن", difficulty: "hard", body: "در قرآن، اصحاب کهف چند نفر بودند؟", options: ["سه", "پنج", "هفت", "تعدادشان به‌روشنی بیان نشده است"], correct: 4, explanation: "قرآن تعداد دقیق اصحاب کهف را بیان نکرده و اختلاف را یادآور شده است.", sourceType: "konkur", sourceTitle: KONKUR[2].title, sourceYear: KONKUR[2].year, tags: "اصحاب کهف" },
  { subject: "دین و زندگی", topic: "قرآن", difficulty: "very_hard", body: "قرآن کریم چند سوره دارد؟", options: ["۱۰۰", "۱۱۴", "۱۲۰", "۱۱۰"], correct: 2, explanation: "قرآن ۱۱۴ سوره دارد.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "سوره" },
  { subject: "دین و زندگی", topic: "احکام", difficulty: "easy", body: "روزه در کدام ماه بر مسلمانان واجب است؟", options: ["محرم", "رمضان", "شعبان", "رجب"], correct: 2, explanation: "روزهٔ ماه رمضان واجب است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "روزه" },

  { subject: "زمین‌شناسی", topic: "منظومه شمسی", difficulty: "easy", body: "زمین چندمین سیاره از خورشید است؟", options: ["دوم", "سوم", "چهارم", "پنجم"], correct: 2, explanation: "زمین سومین سیارهٔ منظومهٔ شمسی است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "سیارات" },
  { subject: "زمین‌شناسی", topic: "جو", difficulty: "easy", body: "فراوان‌ترین گاز جو زمین کدام است؟", options: ["اکسیژن", "نیتروژن", "دی‌اکسید کربن", "آرگون"], correct: 2, explanation: "حدود ۷۸٪ جو زمین نیتروژن است.", sourceType: "konkur", sourceTitle: KONKUR[0].title, sourceYear: KONKUR[0].year, tags: "جو" },
  { subject: "زمین‌شناسی", topic: "زلزله", difficulty: "medium", body: "زلزله معمولاً در کدام محل رخ می‌دهد؟", options: ["مرکز صفحه", "گسل", "قله کوه", "دهانه آتشفشان خاموش"], correct: 2, explanation: "گسیختگی و لغزش در گسل عامل اصلی زلزله است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "زلزله" },
  { subject: "زمین‌شناسی", topic: "سنگ‌ها", difficulty: "medium", body: "سنگ آهک از کدام دسته سنگ‌هاست؟", options: ["آذرین", "رسوبی", "دگرگونی", "ماگمایی"], correct: 2, explanation: "سنگ آهک سنگی رسوبی است.", sourceType: "mock", sourceTitle: MOCK[2].title, sourceDate: MOCK[2].date, tags: "سنگ" },
  { subject: "زمین‌شناسی", topic: "ساختار زمین", difficulty: "hard", body: "کدام لایهٔ زمین بیشترین حجم را دارد؟", options: ["پوسته", "گوشته", "هسته بیرونی", "هسته درونی"], correct: 2, explanation: "گوشته بزرگ‌ترین لایهٔ زمین است.", sourceType: "konkur", sourceTitle: KONKUR[1].title, sourceYear: KONKUR[1].year, tags: "لایه‌های زمین" },
  { subject: "زمین‌شناسی", topic: "چرخه آب", difficulty: "very_hard", body: "کدام مرحله از چرخهٔ آب باعث تشکیل ابرها می‌شود؟", options: ["تبخیر", "میعان", "بارش", "نفوذ"], correct: 2, explanation: "میعان بخار آب در ارتفاع باعث تشکیل ابر می‌شود.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "چرخه آب" },

  { subject: "اقتصاد", topic: "عرضه و تقاضا", difficulty: "easy", body: "طبق قانون تقاضا، با افزایش قیمت یک کالا معمولاً مقدار تقاضا چه می‌شود؟", options: ["افزایش می‌یابد", "کاهش می‌یابد", "ثابت می‌ماند", "صفر می‌شود"], correct: 2, explanation: "رابطهٔ قیمت و مقدار تقاضا معکوس است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "تقاضا" },
  { subject: "اقتصاد", topic: "تورم", difficulty: "easy", body: "تورم به چه معناست؟", options: ["کاهش تولید", "افزایش سطح عمومی قیمت‌ها", "کاهش بیکاری", "افزایش صادرات"], correct: 2, explanation: "تورم افزایش مداوم سطح عمومی قیمت‌هاست.", sourceType: "konkur", sourceTitle: KONKUR[3].title, sourceYear: KONKUR[3].year, tags: "تورم" },
  { subject: "اقتصاد", topic: "تولید ناخالص داخلی", difficulty: "medium", body: "تولید ناخالص داخلی (GDP) چه چیزی را اندازه می‌گیرد؟", options: ["ارزش کل کالا و خدمات نهایی تولیدشده در یک کشور", "درآمد دولت", "میزان صادرات", "تعداد شاغلان"], correct: 1, explanation: "GDP ارزش بازار کالاها و خدمات نهایی تولیدشده در داخل کشور است.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "GDP" },
  { subject: "اقتصاد", topic: "تعادل بازار", difficulty: "medium", body: "در نقطهٔ تعادل بازار:", options: ["عرضه بیشتر از تقاضاست", "تقاضا بیشتر از عرضه است", "عرضه و تقاضا برابرند", "قیمت صفر است"], correct: 3, explanation: "در تعادل، مقدار عرضه برابر مقدار تقاضاست.", sourceType: "mock", sourceTitle: MOCK[0].title, sourceDate: MOCK[0].date, tags: "تعادل" },
  { subject: "اقتصاد", topic: "هزینه فرصت", difficulty: "hard", body: "هزینهٔ فرصت یک انتخاب چیست؟", options: ["پولی که پرداخت می‌شود", "ارزش بهترین گزینهٔ ازدست‌رفته", "مالیات بر درآمد", "هزینهٔ ثابت تولید"], correct: 2, explanation: "هزینهٔ فرصت ارزش بهترین گزینهٔ جایگزینی است که کنار گذاشته می‌شود.", sourceType: "konkur", sourceTitle: KONKUR[2].title, sourceYear: KONKUR[2].year, tags: "هزینه فرصت" },
  { subject: "اقتصاد", topic: "سیاست پولی", difficulty: "very_hard", body: "افزایش نرخ بهره توسط بانک مرکزی معمولاً چه اثری دارد؟", options: ["افزایش تورم", "کاهش سرمایه‌گذاری و فشار بر تورم", "افزایش مصرف", "کاهش بیکاری"], correct: 2, explanation: "افزایش نرخ بهره هزینهٔ وام را بالا می‌برد و سرمایه‌گذاری و تورم را مهار می‌کند.", sourceType: "authored", sourceTitle: "تالیف سیمرغ", tags: "سیاست پولی" },
];

async function main() {
  const db = await getDb();
  const [counselor] = await db
    .select()
    .from(users)
    .where(eq(users.role, "counselor"))
    .limit(1);

  if (!counselor) {
    console.error("هیچ مشاوری پیدا نشد. اول bun run db:seed را اجرا کنید.");
    process.exit(1);
  }

  const subjectRows = await db
    .select()
    .from(subjects)
    .where(eq(subjects.workspaceId, counselor.workspaceId));
  const subjectByTitle = new Map(subjectRows.map((subject) => [subject.title, subject]));

  for (const title of new Set(QUESTIONS.map((question) => question.subject))) {
    if (subjectByTitle.has(title)) continue;
    const [created] = await db
      .insert(subjects)
      .values({ workspaceId: counselor.workspaceId, title })
      .onConflictDoNothing()
      .returning();
    if (created) subjectByTitle.set(title, created);
  }

  const bankRows = await db
    .select()
    .from(questionBanks)
    .where(
      and(
        eq(questionBanks.workspaceId, counselor.workspaceId),
        eq(questionBanks.ownerId, counselor.id),
      ),
    );
  const bankByTitle = new Map(bankRows.map((bank) => [bank.title, bank]));

  let inserted = 0;
  let skipped = 0;

  for (const [index, item] of QUESTIONS.entries()) {
    const subject = subjectByTitle.get(item.subject);
    if (!subject) continue;

    const bankTitle = `بانک ${item.subject}`;
    let bank = bankByTitle.get(bankTitle);
    if (!bank) {
      const [created] = await db
        .insert(questionBanks)
        .values({
          workspaceId: counselor.workspaceId,
          title: bankTitle,
          subjectId: subject.id,
          createdBy: counselor.id,
          ownerId: counselor.id,
        })
        .returning();
      bank = created;
      bankByTitle.set(bankTitle, created);
    }

    const externalKey = `seed-qb-${String(index + 1).padStart(3, "0")}`;
    const [existing] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(
        and(
          eq(questions.workspaceId, counselor.workspaceId),
          eq(questions.externalKey, externalKey),
        ),
      )
      .limit(1);

    if (existing) {
      skipped += 1;
      continue;
    }

    await db.insert(questions).values({
      bankId: bank.id,
      workspaceId: counselor.workspaceId,
      subjectId: subject.id,
      topic: item.topic,
      type: "mcq",
      difficulty: item.difficulty,
      body: item.body,
      optionsJson: item.options,
      correctJson: item.correct,
      score: 1,
      explanation: item.explanation,
      tags: item.tags ?? "",
      sourceType: item.sourceType,
      sourceTitle: item.sourceTitle,
      sourceYear: item.sourceYear ?? "",
      sourceDate: item.sourceDate ?? "",
      sourceRef: `سوال ${index + 1}`,
      externalKey,
    });
    inserted += 1;
  }

  console.log(`بانک سوال: ${inserted} سوال جدید اضافه شد، ${skipped} سوال از قبل وجود داشت.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
