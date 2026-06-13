// Zenith plans + entitlements (server source of truth). Razorpay plan IDs come
// from env so you create the plans in the dashboard and paste their IDs.
// Tiers and prices follow the pricing research in /PRICING.md.

const ENTITLEMENTS = {
  free:   { label: 'Free',   managedAI: false, aiCredits: 0,    sync: 'single', maxDatabases: 3,  storageGB: 1,   fileMB: 5,   historyDays: 7,  support: 'community', earlyMultiplayer: false },
  pro:    { label: 'Pro',    managedAI: true,  aiCredits: 500,  sync: 'multi',  maxDatabases: -1, storageGB: 50,  fileMB: 50,  historyDays: 30, support: 'email',     earlyMultiplayer: false },
  studio: { label: 'Studio', managedAI: true,  aiCredits: 3000, sync: 'multi',  maxDatabases: -1, storageGB: 200, fileMB: 250, historyDays: 90, support: 'priority',  earlyMultiplayer: true },
};

const PAID = ['pro', 'studio'];

function entitlements(plan) {
  return ENTITLEMENTS[plan] || ENTITLEMENTS.free;
}

/** Razorpay plan id for a (plan, cycle); cycle is 'monthly' | 'annual'. */
function planIdFor(plan, cycle) {
  const c = cycle === 'annual' ? 'ANNUAL' : 'MONTHLY';
  return process.env[`RAZORPAY_PLAN_${plan.toUpperCase()}_${c}`] || '';
}

function plansReady() {
  return {
    pro: !!(planIdFor('pro', 'monthly') || planIdFor('pro', 'annual')),
    studio: !!(planIdFor('studio', 'monthly') || planIdFor('studio', 'annual')),
  };
}

module.exports = { ENTITLEMENTS, PAID, entitlements, planIdFor, plansReady };
