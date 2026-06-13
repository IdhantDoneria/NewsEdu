import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { currentSession } from '../../lib/auth';
import { billingConfig, billingStatus, cancelPlan, startCheckout, type BillingConfig, type BillingStatus } from '../../lib/billing';
import { ANNUAL_DISCOUNT_LABEL, formatINR, planByKey, PLANS, type Cycle, type PlanKey } from '../../lib/plans';
import { setPricingOpen, useStore } from '../../lib/store';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/Toast';
import './billing.css';

export function PricingModal() {
  const open = useStore((s) => s.pricingOpen);
  const [cycle, setCycle] = useState<Cycle>('annual');
  const [cfg, setCfg] = useState<BillingConfig | null>(null);
  const [current, setCurrent] = useState<PlanKey>('free');
  const [busy, setBusy] = useState<PlanKey | null>(null);

  useEffect(() => {
    if (!open) return;
    void billingConfig().then(setCfg);
    void billingStatus().then((s) => setCurrent(s.plan));
  }, [open]);

  if (!open) return null;
  const close = () => setPricingOpen(false);
  const session = currentSession();

  const upgrade = async (plan: PlanKey) => {
    if (!session || session.provider === 'guest') {
      toast('Create an account first to upgrade');
      return;
    }
    setBusy(plan);
    try {
      await startCheckout(plan, cycle);
      toast(`Welcome to Zenith ${plan === 'pro' ? 'Pro' : 'Studio'} ✦`);
      setCurrent(plan);
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Checkout failed';
      if (msg !== 'cancelled') toast(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal onClose={close} className="pricing-modal">
      <div className="pricing">
        <button className="icon-btn pricing-close" onClick={close}><X size={18} /></button>
        <div className="pricing-head">
          <div className="pricing-kicker"><Sparkles size={14} style={{ color: 'var(--gold)' }} /> Zenith plans</div>
          <h1>Reach your summit faster.</h1>
          <p>Start free. Upgrade when Zenith becomes the place you think. Cancel anytime.</p>
          <div className="pricing-toggle">
            <button className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
            <button className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>
              Annual <span className="save">{ANNUAL_DISCOUNT_LABEL}</span>
            </button>
          </div>
        </div>

        <div className="pricing-grid">
          {PLANS.map((p) => {
            const price = p.inr[cycle];
            const perMonth = cycle === 'annual' && p.paid ? Math.round(p.inr.annual / 12) : price;
            const isCurrent = current === p.key;
            return (
              <div key={p.key} className={`plan-card ${p.highlight ? 'highlight' : ''}`}>
                {p.highlight && <div className="plan-badge">Most popular</div>}
                <div className="plan-name">{p.name}</div>
                <div className="plan-tagline">{p.tagline}</div>
                <div className="plan-price">
                  {p.paid ? (
                    <>
                      <span className="amount">{formatINR(perMonth)}</span>
                      <span className="per">/mo</span>
                    </>
                  ) : (
                    <span className="amount">Free</span>
                  )}
                </div>
                {p.paid && (
                  <div className="plan-sub">
                    {cycle === 'annual' ? `${formatINR(p.inr.annual)} billed yearly` : 'billed monthly'}
                    {' · '}${cycle === 'annual' ? p.usd.annual : p.usd.monthly}
                  </div>
                )}
                {!p.paid ? (
                  <button className="btn plan-cta" disabled>{isCurrent ? 'Your plan' : 'Included'}</button>
                ) : isCurrent ? (
                  <button className="btn plan-cta" disabled>Current plan</button>
                ) : (
                  <button className={`btn ${p.highlight ? 'gold' : 'primary'} plan-cta`} disabled={busy !== null} onClick={() => upgrade(p.key)}>
                    {busy === p.key ? <Loader2 size={15} className="spin" /> : `Upgrade to ${p.name.replace('Zenith ', '')}`}
                  </button>
                )}
                <ul className="plan-features">
                  {p.features.map((f, i) => (
                    <li key={i}><Check size={14} /> {f}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="pricing-foot">
          {cfg && !cfg.enabled
            ? <span>⚠ Billing isn’t connected on this deployment yet — add Razorpay keys to enable upgrades.</span>
            : <span>Secure payments by Razorpay · UPI, cards, netbanking & wallets · GST invoice on request.</span>}
        </div>
      </div>
    </Modal>
  );
}

// ─── Settings → Plan & billing ───────────────────────────────────────────────

export function BillingSettingsSection() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => billingStatus().then(setStatus);
  useEffect(() => { void refresh(); }, []);

  const plan = status ? planByKey(status.plan) : undefined;
  const isPaid = status && status.plan !== 'free';

  return (
    <div>
      <div className="billing-plan-row">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 650, fontSize: 15 }}>{plan?.name ?? 'Zenith Free'}</span>
            {isPaid && <span className="billing-plan-badge">{status?.status === 'cancelling' ? 'Cancels soon' : 'Active'}</span>}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 3 }}>
            {isPaid ? `${status?.cycle === 'annual' ? 'Billed yearly' : 'Billed monthly'} · manage anytime` : 'Upgrade to unlock managed AI, multi-device sync and more.'}
          </div>
        </div>
        <button className="btn gold small" onClick={() => setPricingOpen(true)}>
          <Sparkles size={14} /> {isPaid ? 'Change plan' : 'Upgrade'}
        </button>
      </div>

      {isPaid && status?.status !== 'cancelling' && (
        <button
          className="btn small danger"
          disabled={busy}
          onClick={async () => {
            if (!confirm('Cancel your subscription at the end of the current billing cycle?')) return;
            setBusy(true);
            try { await cancelPlan(); toast('Subscription will cancel at period end'); await refresh(); }
            catch (e) { toast(e instanceof Error ? e.message : 'Could not cancel'); }
            finally { setBusy(false); }
          }}
        >
          Cancel subscription
        </button>
      )}

      <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 16, lineHeight: 1.6 }}>
        Payments are processed securely by Razorpay. Your plan unlocks features across this account on every device you sign in to.
      </p>
    </div>
  );
}
