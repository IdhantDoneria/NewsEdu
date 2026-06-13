// Display plans for the pricing UI. Prices follow /PRICING.md and MUST match the
// amounts you configure on the Razorpay plans. The server (api/_lib/plans.js)
// owns entitlements + the Razorpay plan-id mapping.

export type PlanKey = 'free' | 'pro' | 'studio';
export type Cycle = 'monthly' | 'annual';

export interface PlanDisplay {
  key: PlanKey;
  name: string;
  tagline: string;
  paid: boolean;
  highlight?: boolean;
  inr: { monthly: number; annual: number };
  usd: { monthly: number; annual: number };
  features: string[];
}

export const PLANS: PlanDisplay[] = [
  {
    key: 'free', name: 'Zenith Free', tagline: 'Your second brain, on the house.', paid: false,
    inr: { monthly: 0, annual: 0 }, usd: { monthly: 0, annual: 0 },
    features: [
      'Full block editor & all 6 database views',
      'Up to 3 databases',
      'Single-device cloud sync',
      'Bring-your-own Gemini AI key',
      '1 GB storage · 7-day version history',
    ],
  },
  {
    key: 'pro', name: 'Zenith Pro', tagline: 'For people who live in their workspace.', paid: true, highlight: true,
    inr: { monthly: 399, annual: 3999 }, usd: { monthly: 7.99, annual: 79 },
    features: [
      'Everything in Free',
      'Unlimited databases & pages',
      'Managed AI — ~500 credits/mo, no key needed',
      'Multi-device cloud sync',
      '50 GB storage · 30-day history',
      'Email support',
    ],
  },
  {
    key: 'studio', name: 'Zenith Studio', tagline: 'Peak output, fully equipped.', paid: true,
    inr: { monthly: 799, annual: 7999 }, usd: { monthly: 14.99, annual: 149 },
    features: [
      'Everything in Pro',
      '~3,000 AI credits/mo on a higher-quality model',
      '200 GB storage · 90-day history',
      'Priority support',
      'Early access to multiplayer',
    ],
  },
];

export const ANNUAL_DISCOUNT_LABEL = '2 months free';

export function planByKey(key: string): PlanDisplay | undefined {
  return PLANS.find((p) => p.key === key);
}

export function formatINR(n: number): string {
  return n === 0 ? '₹0' : `₹${n.toLocaleString('en-IN')}`;
}
