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
      <head>
        {/* set the theme class before first paint to avoid a flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("lumina.theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--fg)] transition-colors duration-300">
        {children}
      </body>
    </html>
  );
}
