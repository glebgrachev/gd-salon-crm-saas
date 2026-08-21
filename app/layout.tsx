import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ShopProvider } from "@/contexts/ShopContext";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BeautyApp — Админ-панель",
  description: "Админ-панель салона красоты BeautyApp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <ShopProvider>
          {children}
        </ShopProvider>
      </body>
    </html>
  );
}