// Client for the Razorpay billing backend (/api/billing). Loads Razorpay
// Checkout on demand, drives subscription checkout, verifies, and reads status.
import { currentSession } from './auth';
import type { Cycle, PlanKey } from './plans';

declare global {
  interface Window { Razorpay?: any }
}

export interface BillingConfig {
  enabled: boolean;
  keyId: string;
  plansReady: { pro: boolean; studio: boolean };
  currency: string;
}

export interface BillingStatus {
  plan: PlanKey;
  cycle: string | null;
  status: string;
  entitlements: Record<string, any>;
}

let cfgCache: BillingConfig | null = null;

export async function billingConfig(force = false): Promise<BillingConfig> {
  if (cfgCache && !force) return cfgCache;
  try {
    const r = await fetch('/api/billing/config');
    if (!r.ok) throw new Error('config');
    cfgCache = await r.json();
  } catch {
    cfgCache = { enabled: false, keyId: '', plansReady: { pro: false, studio: false }, currency: 'INR' };
  }
  return cfgCache!;
}

export async function billingStatus(): Promise<BillingStatus> {
  try {
    const r = await fetch('/api/billing/status', { credentials: 'same-origin' });
    if (!r.ok) return { plan: 'free', cycle: null, status: 'none', entitlements: {} };
    return await r.json();
  } catch {
    return { plan: 'free', cycle: null, status: 'none', entitlements: {} };
  }
}

let checkoutLoad: Promise<void> | null = null;
function loadCheckout(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (checkoutLoad) return checkoutLoad;
  checkoutLoad = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => { checkoutLoad = null; reject(new Error('Could not load Razorpay Checkout.')); };
    document.body.appendChild(s);
  });
  return checkoutLoad;
}

/** Full upgrade flow: create subscription → open Checkout → verify. Resolves on success. */
export async function startCheckout(plan: PlanKey, cycle: Cycle): Promise<void> {
  const cfg = await billingConfig();
  if (!cfg.enabled) throw new Error('Billing is not set up yet. (Add Razorpay keys in the deployment.)');

  const subRes = await fetch('/api/billing/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ plan, cycle }),
  });
  const sub = await subRes.json().catch(() => ({}));
  if (!subRes.ok) throw new Error(sub.message || 'Could not start checkout.');

  await loadCheckout();
  const session = currentSession();

  return new Promise<void>((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: sub.keyId,
      subscription_id: sub.subscriptionId,
      name: 'Zenith',
      description: `Zenith ${plan} · ${cycle}`,
      theme: { color: '#b68a36' },
      prefill: { email: session?.email || '', name: session?.name || '' },
      handler: async (resp: any) => {
        try {
          const v = await fetch('/api/billing/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ ...resp, plan, cycle }),
          });
          const data = await v.json().catch(() => ({}));
          if (v.ok && data.ok) resolve();
          else reject(new Error(data.message || 'Payment verification failed.'));
        } catch (e) {
          reject(e instanceof Error ? e : new Error('Verification failed.'));
        }
      },
      modal: { ondismiss: () => reject(new Error('cancelled')) },
    });
    rzp.open();
  });
}

export async function cancelPlan(): Promise<void> {
  const r = await fetch('/api/billing/cancel', { method: 'POST', credentials: 'same-origin' });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || 'Could not cancel.');
  }
}
