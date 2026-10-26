import type { Metadata, Viewport } from "next";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/700.css";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "سیمرغ | دستیار هوشمند مشاور تحصیلی",
  description:
    "برنامه‌ریزی هفتگی، پیگیری روزانه و گزارش ماهانه برای مشاوران تحصیلی.",
  applicationName: "سیمرغ",
};

export const viewport: Viewport = {
  themeColor: "#1f6f4a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
