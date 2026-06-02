import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SplitEasy - Share expenses, settle up",
  description: "A simplified Splitwise-inspired expense sharing app.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
