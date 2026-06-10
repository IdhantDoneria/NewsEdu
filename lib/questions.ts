/**
 * The 10-question intake. Each answer maps 1:1 onto IntakeAnswers — the wizard
 * renders this declaratively, so adding a state or refining bands is a data
 * change, not a UI change.
 */

import type { IntakeAnswers } from "./engine/types";

export interface QuestionOption {
  value: string;
  label: string;
  hint?: string;
  icon: string; // emoji — rendered inside the option tile
}

export interface Question {
  id: keyof IntakeAnswers;
  multi: boolean;
  title: string;
  subtitle?: string;
  options: QuestionOption[];
  /** For multi questions: option that clears the others (e.g. "none"). */
  exclusiveValue?: string;
}

export const QUESTIONS: Question[] = [
  {
    id: "state",
    multi: false,
    title: "Where does your business operate from?",
    subtitle:
      "V1 covers all-India central schemes plus Maharashtra state schemes. More states are on the roadmap.",
    options: [
      { value: "MH", label: "Maharashtra", hint: "Central + Maharashtra schemes", icon: "📍" },
      { value: "OTHER", label: "Another state", hint: "Central schemes only, for now", icon: "🗺️" },
    ],
  },
  {
    id: "stage",
    multi: false,
    title: "What stage is the business at?",
    subtitle: "Several flagship subsidies fund only brand-new units — this question decides a lot.",
    options: [
      { value: "idea", label: "Not started yet", hint: "An idea, or setting up now", icon: "🌱" },
      { value: "lt1", label: "Under 1 year", hint: "Recently started operations", icon: "🐣" },
      { value: "y1to3", label: "1 – 3 years", icon: "🚀" },
      { value: "y3to10", label: "3 – 10 years", icon: "🏭" },
      { value: "gt10", label: "10+ years", icon: "🏛️" },
    ],
  },
  {
    id: "entityType",
    multi: false,
    title: "How is the business registered?",
    options: [
      { value: "proprietorship", label: "Proprietorship", hint: "Single owner", icon: "👤" },
      { value: "partnership", label: "Partnership firm", icon: "🤝" },
      { value: "pvt_ltd", label: "Private Limited", icon: "🏢" },
      { value: "llp", label: "LLP", icon: "📋" },
      { value: "shg_coop_trust", label: "SHG / Co-op / Trust", hint: "Incl. FPOs & societies", icon: "🧑‍🤝‍🧑" },
      { value: "unregistered", label: "Not registered yet", hint: "Just me, no entity", icon: "✋" },
    ],
  },
  {
    id: "sector",
    multi: false,
    title: "What does the business do?",
    subtitle: "Pick the closest. Trading is excluded from several subsidies — we account for that.",
    options: [
      { value: "manufacturing", label: "Manufacturing", icon: "⚙️" },
      { value: "services", label: "Services", icon: "🛠️" },
      { value: "trading", label: "Trading / retail", hint: "Buying & selling", icon: "🏪" },
      { value: "food_processing", label: "Food processing", icon: "🍱" },
      { value: "agri_allied", label: "Agri & allied", hint: "Dairy, poultry, fisheries…", icon: "🌾" },
      { value: "artisan", label: "Artisan / craft", hint: "Traditional trades", icon: "🪡" },
    ],
  },
  {
    id: "udyam",
    multi: false,
    title: "Do you have Udyam Registration?",
    subtitle: "The free MSME registration at udyamregistration.gov.in. It's the key that unlocks most central schemes.",
    options: [
      { value: "yes", label: "Yes, registered", icon: "✅" },
      { value: "no", label: "Not yet", hint: "Takes ~15 minutes, free", icon: "⏳" },
    ],
  },
  {
    id: "investment",
    multi: false,
    title: "Investment in plant, machinery or equipment?",
    subtitle: "Original cost, excluding land & building. Bands follow the revised MSME classification (FY 2025-26).",
    options: [
      { value: "lt25l", label: "Under ₹25 lakh", icon: "🔩" },
      { value: "l25to2_5cr", label: "₹25 lakh – ₹2.5 crore", icon: "🔧" },
      { value: "cr2_5to25", label: "₹2.5 – 25 crore", icon: "🏗️" },
      { value: "cr25to125", label: "₹25 – 125 crore", icon: "🏰" },
      { value: "gt125cr", label: "Above ₹125 crore", icon: "🌆" },
    ],
  },
  {
    id: "turnover",
    multi: false,
    title: "Annual turnover, last financial year?",
    options: [
      { value: "pre", label: "Pre-revenue", hint: "Not started selling", icon: "🫙" },
      { value: "lt2cr", label: "Under ₹2 crore", icon: "📈" },
      { value: "cr2to10", label: "₹2 – 10 crore", icon: "💼" },
      { value: "cr10to100", label: "₹10 – 100 crore", icon: "🏦" },
      { value: "cr100to500", label: "₹100 – 500 crore", icon: "🚢" },
      { value: "gt500cr", label: "Above ₹500 crore", icon: "🌍" },
    ],
  },
  {
    id: "social",
    multi: false,
    title: "Social category of the main owner?",
    subtitle: "Many schemes carry higher subsidies for SC/ST/OBC/minority entrepreneurs. Asked only to match you correctly.",
    options: [
      { value: "general", label: "General", icon: "🧑" },
      { value: "sc", label: "SC", icon: "🧑" },
      { value: "st", label: "ST", icon: "🧑" },
      { value: "obc", label: "OBC", icon: "🧑" },
      { value: "minority", label: "Minority", icon: "🧑" },
    ],
  },
  {
    id: "profile",
    multi: true,
    title: "Does any of this describe the main owner?",
    subtitle: "Select all that apply.",
    exclusiveValue: "none",
    options: [
      { value: "woman", label: "Woman entrepreneur", icon: "👩‍💼" },
      { value: "youth18to35", label: "18 – 35 years old", icon: "🎓" },
      { value: "divyang", label: "Person with disability", icon: "♿" },
      { value: "exserviceman", label: "Ex-serviceman", icon: "🎖️" },
      { value: "none", label: "None of these", icon: "➖" },
    ],
  },
  {
    id: "needs",
    multi: true,
    title: "What are you looking for right now?",
    subtitle: "Select all that apply — this orders your results.",
    options: [
      { value: "capital", label: "Loan / working capital", icon: "💰" },
      { value: "subsidy", label: "Capital subsidy", hint: "On new investment", icon: "🏷️" },
      { value: "quality", label: "Certifications & quality", hint: "ZED, LEAN…", icon: "🥇" },
      { value: "market", label: "Govt tenders & marketing", icon: "📣" },
      { value: "infra", label: "Cluster / infrastructure", icon: "🏗️" },
      { value: "export", label: "Export support", icon: "✈️" },
    ],
  },
];

/** sessionStorage keys shared across pages. */
export const ANSWERS_KEY = "yojanascan.answers.v1";
export const PAID_KEY = "yojanascan.paid.v1";
