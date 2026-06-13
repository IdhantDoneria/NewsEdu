import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DSPR — Elite PR & Communications",
  description:
    "DSPR is a premier public relations and strategic communications agency that transforms brands into cultural movements.",
  keywords: ["PR agency", "public relations", "brand strategy", "media relations", "communications"],
  openGraph: {
    title: "DSPR — Elite PR & Communications",
    description: "We don't just tell your story — we make the world stop and listen.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="noise-overlay" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
