import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "سیمرغ | دستیار هوشمند مشاور تحصیلی",
    short_name: "سیمرغ",
    description:
      "برنامه‌ریزی هفتگی، پیگیری روزانه، آزمون زمان‌دار و گزارش برای مشاوران تحصیلی.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f7f5",
    theme_color: "#1f6f4a",
    dir: "rtl",
    lang: "fa",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
