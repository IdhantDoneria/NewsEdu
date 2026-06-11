import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dmsans",
});

export const metadata: Metadata = {
  title: "YojanaScan — Which government schemes is your MSME eligible for?",
  description:
    "Answer 10 questions, get a deterministic eligibility verdict across 25+ central & Maharashtra MSME schemes — benefit amounts, document checklists and application links. ₹499, not ₹50,000.",
  keywords: [
    "MSME schemes",
    "PMEGP eligibility",
    "CGTMSE",
    "Udyam",
    "government subsidy India",
    "Maharashtra CMEGP",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${dmSans.variable}`}>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
