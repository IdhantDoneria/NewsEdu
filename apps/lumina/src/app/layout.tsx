import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumina — a quieter place to think",
  description:
    "Lumina is a minimalist luxury workspace for notes, pages and databases. Everything in its place, nothing in the way.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
        {children}
      </body>
    </html>
  );
}
