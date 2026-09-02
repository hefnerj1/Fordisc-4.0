import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import {
  CreateOrganization,
  OrganizationProfile,
  Show,
  SignInButton,
  UserButton,
  useAuth,
  useClerk,
  useReverification,
  useOrganization,
  useUser
} from '@clerk/react';
import { CheckoutButton } from '@clerk/react/experimental';
import { apiGet, FD4_SESSION_ENDED_EVENT, setApiAuthTokenProvider } from './api';
import { ANONYMOUS_FREE_AUTHORIZATION, Fd4AccessProvider } from './access';
import type { AuthorizationSummary } from './access';

type ClerkAuthShellProps = {
  children: ReactNode;
};

type AuthorizationResponse = {
  status: string;
  authorization: AuthorizationSummary;
};

type PlanSelection = 'free' | 'student' | 'pro' | 'institution';

const CLERK_BILLING_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(import.meta.env.VITE_CLERK_BILLING_ENABLED ?? '0').toLowerCase()
);
const PUBLIC_SIGNUP_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(import.meta.env.VITE_FD4_PUBLIC_SIGNUP_ENABLED ?? '0').toLowerCase()
);
const PUBLIC_FREE_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(import.meta.env.VITE_FD4_PUBLIC_FREE_ENABLED ?? '1').toLowerCase()
);

const STUDENT_PLAN_ID = String(import.meta.env.VITE_CLERK_STUDENT_PLAN_ID ?? 'cplan_3HHNPGhhocjgC7bCczaDZhjQIMO').trim();
const PRO_PLAN_ID = String(import.meta.env.VITE_CLERK_PRO_PLAN_ID ?? 'cplan_3Grg61YAfyMjpkWqoFYtVvrdXCY').trim();
const INSTITUTION_PLAN_ID = String(import.meta.env.VITE_CLERK_INSTITUTION_PLAN_ID ?? 'cplan_3HHKaIeE74us1MVGx9pm1mgxbXp').trim();
const SUPPORT_EMAIL = String(import.meta.env.VITE_FD4_SUPPORT_EMAIL ?? 'fordisc.support@gmail.com').trim();
const STUDENT_PRICE = String(import.meta.env.VITE_FD4_STUDENT_PRICE ?? '$30/year').trim();
const PRO_PRICE = String(import.meta.env.VITE_FD4_PRO_PRICE ?? '$100/year').trim();
const INSTITUTION_PRICE = String(import.meta.env.VITE_FD4_INSTITUTION_PRICE ?? '$600/year').trim();
const INSTITUTION_INCLUDED_SEATS = String(import.meta.env.VITE_FD4_INSTITUTION_INCLUDED_SEATS ?? '15').trim();
const INSTITUTION_EXTRA_SEAT_PRICE = String(import.meta.env.VITE_FD4_INSTITUTION_EXTRA_SEAT_PRICE ?? '').trim();
const TOUCHNET_STORE_URL = String(
  import.meta.env.VITE_FD4_TOUCHNET_STORE_URL
    ?? 'https://secure.touchnet.com/C21610_ustores/web/store_main.jsp?STOREID=15&SINGLESTORE=true'
).trim();

function useCurrentPath() {
  const [path, setPath] = useState(() => window.location.pathname || '/');
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
      setPath(nextPath);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  return { path, navigate };
}

function selectedPlanFromPath(path: string): PlanSelection | null {
  const match = path.match(/^\/subscribe\/(free|student|pro|institution)(?:\/|$)/i);
  return match ? (match[1].toLowerCase() as PlanSelection) : null;
}

function sourceLabel(authz?: AuthorizationSummary | null) {
  if (!authz) return 'Checking access';
  if (authz.access_label) return authz.access_label;
  if (authz.access_tier === 'student') return 'Fordisc Student';
  if (authz.access_tier === 'free') return 'Fordisc Demo';
  if (authz.payer_scope === 'organization') return 'Fordisc Institution';
  const normalized = String(authz.source || '').toLowerCase();
  if (normalized.startsWith('pro:') || normalized === 'touchnet:pro') return 'Fordisc Pro';
  if (normalized.includes('beta') || normalized.includes('metadata') || normalized.includes('admin')) return 'Full FORDISC access';
  return 'Full FORDISC access';
}

function institutionAdditionalUsersCopy() {
  const value = INSTITUTION_EXTRA_SEAT_PRICE.trim();
  if (!value || /(?:price\s*)?tbd|to be determined/i.test(value)) {
    return 'Contact subscription support for additional named-user pricing.';
  }
  if (/contact/i.test(value)) return 'Contact subscription support for additional named-user pricing.';
  return `Additional named users: ${value}.`;
}


function isOrganizationAdmin(role?: string | null) {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'admin' || normalized === 'org:admin' || normalized.endsWith(':admin');
}


function clerkErrorMessage(error: unknown, fallback: string) {
  const candidate = error as {
    errors?: Array<{ longMessage?: string; message?: string }>;
    message?: string;
  };
  return candidate?.errors?.[0]?.longMessage
    || candidate?.errors?.[0]?.message
    || candidate?.message
    || fallback;
}

function emailDomain(address: string) {
  const normalized = address.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  return at >= 0 ? normalized.slice(at + 1).replace(/\.$/, '') : '';
}

function emailMatchesInstitutionalSuffix(address: string, suffixes: string[]) {
  const domain = emailDomain(address);
  if (!domain) return false;
  return suffixes.some((rawSuffix) => {
    const suffix = rawSuffix.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
    if (!suffix) return false;
    if (suffix.startsWith('.')) return domain.endsWith(suffix);
    return domain === suffix || domain.endsWith(`.${suffix}`);
  });
}

export default function ClerkAuthShell({ children }: ClerkAuthShellProps) {
  const { isLoaded, isSignedIn, getToken, orgId } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { path, navigate } = useCurrentPath();
  const [authz, setAuthz] = useState<AuthorizationSummary | null>(null);
  const [authzLoading, setAuthzLoading] = useState(false);
  const [authzError, setAuthzError] = useState('');
  const [sessionEndedMessage, setSessionEndedMessage] = useState('');
  const isAnonymousFreeRoute = PUBLIC_FREE_ENABLED && (path === '/try' || path.startsWith('/try/'));
  const isPlansRoute = path.startsWith('/billing') || path.startsWith('/pricing') || path.startsWith('/plans');
  const isInstitutionManagementRoute = path.startsWith('/institution/manage');
  const selectedPlan = selectedPlanFromPath(path);
  const primaryEmail = useMemo(() => user?.primaryEmailAddress?.emailAddress ?? '', [user]);

  useEffect(() => {
    const onSessionEnded = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setSessionEndedMessage(detail?.message || 'This FORDISC session has ended. Sign in again to continue.');
      setAuthz(null);
      setAuthzError('');
    };
    window.addEventListener(FD4_SESSION_ENDED_EVENT, onSessionEnded);
    return () => window.removeEventListener(FD4_SESSION_ENDED_EVENT, onSessionEnded);
  }, []);

  const returnToSignIn = useCallback(async () => {
    setSessionEndedMessage('');
    setApiAuthTokenProvider(null);
    try {
      await signOut();
    } catch {
      // Clerk may already have ended this displaced session.
    }
    window.location.assign('/');
  }, [signOut]);

  const loadAuthorization = useCallback(async (forceRefresh = false) => {
    setAuthzLoading(true);
    setAuthzError('');
    try {
      const response = await apiGet<AuthorizationResponse>(forceRefresh ? '/authz/me?refresh=1' : '/authz/me');
      setAuthz(response.authorization);
    } catch (error) {
      setAuthz(null);
      setAuthzError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthzLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setApiAuthTokenProvider(null);
      setAuthz(null);
      setAuthzError('');
      return;
    }
    setApiAuthTokenProvider(async () => getToken());
    loadAuthorization();
    return () => setApiAuthTokenProvider(null);
  }, [getToken, isLoaded, isSignedIn, loadAuthorization, orgId]);

  const refreshAccess = useCallback(async () => {
    await user?.reload?.();
    // Student eligibility and billing claims can change while this page is
    // open. Force Clerk to mint a fresh signed session token before asking
    // the backend to re-evaluate access.
    await getToken({ skipCache: true });
    await loadAuthorization(true);
  }, [getToken, loadAuthorization, user]);

  const finishIndividualCheckout = useCallback(async () => {
    await refreshAccess();
    navigate('/app');
  }, [navigate, refreshAccess]);

  const finishInstitutionCheckout = useCallback(async () => {
    await refreshAccess();
    navigate('/institution/manage');
  }, [navigate, refreshAccess]);

  // The public Free workspace must not wait for Clerk before it can render.
  // A direct visit to /try therefore opens immediately unless an authenticated
  // session has already been established.
  if (isAnonymousFreeRoute && isSignedIn !== true) {
    return (
      <>
        <a className="skip-link" href="#main-workspace">Skip to main content</a>
        <AnonymousFreeBar onPlans={() => navigate('/')} signInReady={isLoaded} />
        <Fd4AccessProvider authorization={ANONYMOUS_FREE_AUTHORIZATION}>{children}</Fd4AccessProvider>
      </>
    );
  }

  if (!isLoaded) {
    return (
      <div className="auth-shell auth-loading-screen">
        <div className="auth-card">
          <h1>FORDISC 4.0</h1>
          <p>Loading secure access…</p>
        </div>
      </div>
    );
  }

  if (sessionEndedMessage) {
    return <SessionEndedPage message={sessionEndedMessage} onReturnToSignIn={returnToSignIn} />;
  }

  if (!isSignedIn) {
    return (
      <PublicLanding publicSignupEnabled={PUBLIC_SIGNUP_ENABLED} publicFreeEnabled={PUBLIC_FREE_ENABLED} onTryFree={() => navigate('/try')} />
    );
  }

  const activeOrganizationId = authz?.organization?.id;
  const activeOrganizationRole = authz?.organization?.role;
  const applicationWorkspaceVisible = !authzLoading && !authzError && !isPlansRoute && !selectedPlan && !isInstitutionManagementRoute && Boolean(authz?.authorized);

  return (
    <>
      <a className="skip-link" href={applicationWorkspaceVisible ? '#main-workspace' : '#fd4-route-content'}>Skip to main content</a>
      <div className="clerk-beta-bar">
        <div>
          <strong>FORDISC 4.0</strong>
          <span>{primaryEmail ? `Signed in as ${primaryEmail}` : 'Signed in'}</span>
          <span className={`access-status ${authz?.authorized ? 'access-status-ok' : 'access-status-waiting'}`}>
            {authzLoading ? 'Checking access…' : sourceLabel(authz)}
          </span>
        </div>
        <div className="clerk-beta-actions">
          <button className="secondary small-button" onClick={() => navigate('/app')}>FORDISC 4.0</button>
          <button className="secondary small-button" onClick={() => navigate('/plans')}>Plans</button>
          {activeOrganizationId && isOrganizationAdmin(activeOrganizationRole) && (
            <button className="secondary small-button" onClick={() => navigate('/institution/manage')}>Manage Institution</button>
          )}
          <button className="secondary small-button" onClick={refreshAccess}>Refresh access</button>
          <UserButton />
        </div>
      </div>

      <div id="fd4-route-content" tabIndex={-1}>
        {authzLoading ? (
          <AccessLoading />
        ) : authzError ? (
          <AccessError message={authzError} onRefresh={refreshAccess} />
        ) : isPlansRoute ? (
          <BillingPage
            authz={authz}
            onRefresh={refreshAccess}
          />
        ) : selectedPlan ? (
          <SubscriptionPage
            plan={selectedPlan}
            authz={authz}
            billingEnabled={CLERK_BILLING_ENABLED}
            onBack={() => navigate('/plans')}
            onOpenApp={() => navigate('/app')}
            onRefresh={refreshAccess}
            onIndividualComplete={finishIndividualCheckout}
            onInstitutionComplete={finishInstitutionCheckout}
          />
        ) : isInstitutionManagementRoute ? (
          <InstitutionManagementPage
            authz={authz}
            onBack={() => navigate('/app')}
            onInstitutionalLicensing={() => navigate('/plans')}
          />
        ) : authz?.authorized ? (
          <Fd4AccessProvider authorization={authz}>{children}</Fd4AccessProvider>
        ) : (
          <AccessRequiredPage
            onBilling={() => navigate('/plans')}
            onRefresh={refreshAccess}
          />
        )}
      </div>
    </>
  );
}

function SessionEndedPage({
  message,
  onReturnToSignIn
}: {
  message: string;
  onReturnToSignIn: () => void | Promise<void>;
}) {
  return (
    <div className="auth-shell auth-loading-screen">
      <div className="auth-card">
        <p className="auth-eyebrow">Session ended</p>
        <h1>FORDISC 4.0</h1>
        <p>{message}</p>
        <button className="primary auth-primary-button" onClick={onReturnToSignIn}>Return to sign in</button>
      </div>
    </div>
  );
}


function AnonymousFreeBar({ onPlans, signInReady }: { onPlans: () => void; signInReady: boolean }) {
  return (
    <div className="anonymous-free-bar">
      <div>
        <strong>Fordisc Demo</strong>
        <span>No sign-in required · Built-in Demo Cases only</span>
      </div>
      <div className="anonymous-free-actions">
        <button className="secondary small-button" onClick={onPlans}>Plans and subscriptions</button>
        {signInReady && (
          <SignInButton mode="modal" forceRedirectUrl="/app">
            <button className="primary small-button">Sign in</button>
          </SignInButton>
        )}
      </div>
    </div>
  );
}

function PublicLanding({ publicSignupEnabled, publicFreeEnabled, onTryFree }: { publicSignupEnabled: boolean; publicFreeEnabled: boolean; onTryFree: () => void }) {
  return (
    <div className="auth-shell public-fordisc-landing">
      <a className="skip-link" href="#public-main-content">Skip to main content</a>
      <main id="public-main-content" tabIndex={-1} className="auth-landing-card auth-landing-card-plans">
        <div className="public-landing-heading">
          <div className="auth-brand-row">
            <img src="/FD4.ico" alt="" className="auth-brand-icon" />
            <div>
              <h1>FORDISC 4.0</h1>
            </div>
          </div>
          <SignInButton mode="modal" forceRedirectUrl="/app">
            <button className="primary auth-primary-button public-sign-in-button">Sign in</button>
          </SignInButton>
        </div>

        <p className="auth-lede">
          Review the available FORDISC plans below. Purchases are completed through the University of Tennessee, Knoxville.
        </p>

        {publicFreeEnabled && (
          <section className="public-free-try-panel" aria-label="Try the Fordisc Demo">
            <div>
              <p className="auth-eyebrow">No account required</p>
              <h2>Try the Fordisc Demo</h2>
              <p>Run the built-in Demo Case for FDB, Howells, or Postcranial and review the Results and Graphs screens before subscribing.</p>
            </div>
            <button className="primary public-free-try-button" onClick={onTryFree}>Try the Fordisc Demo</button>
          </section>
        )}

        {!publicSignupEnabled && (
          <div className="auth-config-warning">
            Account creation is currently invitation-only. Existing users may sign in above.
          </div>
        )}

        <section className="public-plan-summary" aria-label="FORDISC subscription plans">
          <PublicPlanCard title="Fordisc Demo" price="No charge" description="Try built-in Demo Cases without signing in. No measurement entry or case storage." />
          <PublicPlanCard title="Fordisc Student" price={STUDENT_PRICE} description="FDB and Postcranial access for verified students, including measurement entry, results, and graphs." />
          <PublicPlanCard title="Fordisc Pro" price={PRO_PRICE} description="Full individual access to all FORDISC 4.0 modules and tools." />
          <PublicPlanCard
            title="Fordisc Institution"
            price={INSTITUTION_PRICE}
            description={`Full access for institutions and laboratories. Includes ${INSTITUTION_INCLUDED_SEATS} named users. ${institutionAdditionalUsersCopy()}`}
          />
        </section>

        <TouchNetPurchasePanel />

        <p className="subscription-support">
          Subscription and eligibility support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </main>
    </div>
  );
}

function PublicPlanCard({
  title,
  price,
  description
}: {
  title: string;
  price: string;
  description: string;
}) {
  return (
    <article className="public-plan-card">
      <h2>{title}</h2>
      <strong>{price}</strong>
      <p className="plan-brief-description">{description}</p>
    </article>
  );
}

function TouchNetPurchasePanel() {
  return (
    <section className="touchnet-purchase-panel" aria-label="Purchase FORDISC access">
      <div className="touchnet-purchase-copy">
        <p className="auth-eyebrow">UTK FORDISC Store</p>
        <h2>Purchase FORDISC access</h2>
        <p>Select the appropriate subscription through the University of Tennessee, Knoxville secure storefront.</p>
      </div>
      <a
        className="primary plan-checkout-button touchnet-purchase-button"
        href={TOUCHNET_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Purchase Access Through UTK
      </a>
      <p className="touchnet-credential-notice">
        After your purchase is verified, you will receive a FORDISC account-activation email. Follow the instructions in that email to activate your account and create your password. Account setup may take up to 24 hours.
      </p>
    </section>
  );
}

function AccessLoading() {
  return (
    <div className="billing-shell">
      <section className="billing-card">
        <p className="auth-eyebrow">Access check</p>
        <h1>Checking FORDISC access…</h1>
        <p>Please wait while FORDISC verifies your access.</p>
      </section>
    </div>
  );
}

function AccessError({ message, onRefresh }: { message: string; onRefresh: () => void }) {
  return (
    <div className="billing-shell">
      <section className="billing-card">
        <p className="auth-eyebrow">Access check</p>
        <h1>Access check failed</h1>
        <p>{message}</p>
        <button className="primary auth-primary-button" onClick={onRefresh}>Try again</button>
      </section>
    </div>
  );
}

function AccessRequiredPage({
  onBilling,
  onRefresh
}: {
  onBilling: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="billing-shell">
      <section className="billing-card">
        <p className="auth-eyebrow">FORDISC access</p>
        <h1>Access could not be resolved</h1>
        <p>FORDISC could not determine your access. Select Refresh access or contact subscription support.</p>
        <div className="auth-actions">
          <button className="primary auth-primary-button" onClick={onBilling}>View plans</button>
          <button className="secondary auth-secondary-button" onClick={onRefresh}>Refresh access</button>
        </div>
        <p className="subscription-support">Support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      </section>
    </div>
  );
}

type AccessDiagnostic = {
  title: string;
  message: string;
  tone: 'warning' | 'error';
};

function manualSubscriptionDiagnostic(authz: AuthorizationSummary | null): AccessDiagnostic | null {
  const subscription = authz?.manual_subscription;
  if (!subscription?.present) return null;

  const status = String(subscription.authorization_status || subscription.status || '').trim().toLowerCase();
  if (status === 'active' && subscription.tier === 'student' && !authz?.student_eligibility?.eligible) {
    const eligibilityStatus = String(authz?.student_eligibility?.status || '').trim().toLowerCase();
    if (eligibilityStatus === 'no_verified_email' || eligibilityStatus === 'session_email_not_verified') {
      return {
        tone: 'warning',
        title: 'Student email verification required',
        message: 'The Student subscription is active, but the account does not yet have a verified email address.'
      };
    }
    if (eligibilityStatus === 'no_verified_eligible_email') {
      return {
        tone: 'warning',
        title: 'Eligible institutional email required',
        message: 'The Student subscription is active, but a verified .edu, .gov, .mil, or separately approved institutional email is required.'
      };
    }
    return {
      tone: 'warning',
      title: 'Student eligibility could not be confirmed',
      message: 'Your institutional email is verified, but Student eligibility could not be confirmed. Select Refresh access or contact subscription support.'
    };
  }

  if (status === 'active') return null;
  return {
    tone: status === 'expired' || status === 'not_yet_active' || status === 'inactive' ? 'warning' : 'error',
    title: 'Subscription information needs attention',
    message: 'Your subscription information needs administrative attention. Select Refresh access. If access is still unavailable, contact subscription support.'
  };
}

function BillingPage({
  authz,
  onRefresh
}: {
  authz: AuthorizationSummary | null;
  onRefresh: () => void;
}) {
  const currentTier = authz?.access_tier ?? 'free';
  const currentIsPro = currentTier === 'full' && authz?.payer_scope === 'user';
  const currentIsInstitution = currentTier === 'full' && authz?.payer_scope === 'organization';
  const manualSubscription = authz?.manual_subscription;
  const accessDiagnostic = manualSubscriptionDiagnostic(authz);

  return (
    <div className="billing-shell">
      <section className="billing-card billing-card-wide">
        <div className="billing-heading-row">
          <div>
            <p className="auth-eyebrow">FORDISC subscriptions</p>
            <h1>FORDISC access plans</h1>
            <p>Current access: <strong>{sourceLabel(authz)}</strong></p>
            {manualSubscription?.active && manualSubscription.valid_until && (
              <p className="manual-subscription-validity">Access through <strong>{formatSubscriptionDate(manualSubscription.valid_until)}</strong></p>
            )}
          </div>
        </div>

        {accessDiagnostic && (
          <div className={`access-diagnostic access-diagnostic-${accessDiagnostic.tone}`} role="alert">
            <strong>{accessDiagnostic.title}</strong>
            <span>{accessDiagnostic.message}</span>
          </div>
        )}

        <p className="plan-page-guidance">
          Review the available plans below. Subscription purchases are completed through the University of Tennessee, Knoxville.
        </p>

        <div className="fd4-plan-grid fd4-plan-grid-compact">
          <PlanChoiceCard
            title="Fordisc Demo"
            price="No charge"
            description="Try built-in Demo Cases without signing in. No measurement entry or case storage."
            current={currentTier === 'free'}
          />
          <PlanChoiceCard
            title="Fordisc Student"
            price={STUDENT_PRICE}
            description="FDB and Postcranial access for verified students, including measurement entry, results, and graphs."
            current={currentTier === 'student'}
          />
          <PlanChoiceCard
            title="Fordisc Pro"
            price={PRO_PRICE}
            description="Full individual access to all FORDISC 4.0 modules and tools."
            current={currentIsPro}
          />
          <PlanChoiceCard
            title="Fordisc Institution"
            price={INSTITUTION_PRICE}
            description={`Full access for institutions and laboratories. Includes ${INSTITUTION_INCLUDED_SEATS} named users. ${institutionAdditionalUsersCopy()}`}
            current={currentIsInstitution}
          />
        </div>

        <TouchNetPurchasePanel />

        <div className="auth-actions">
          <button className="secondary auth-secondary-button" onClick={onRefresh}>Refresh access</button>
        </div>
        <p className="subscription-support">Subscription and eligibility support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      </section>
    </div>
  );
}

function formatSubscriptionDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function PlanChoiceCard({
  title,
  price,
  description,
  current
}: {
  title: string;
  price: string;
  description: string;
  current: boolean;
}) {
  return (
    <article className={`fd4-plan-card fd4-plan-card-compact ${current ? 'current-plan' : ''}`}>
      <div className="fd4-plan-card-heading">
        <h2>{title}</h2>
        <strong>{price}</strong>
      </div>
      <p className="plan-brief-description">{description}</p>
      {current && <div className="current-plan-label">Current access</div>}
    </article>
  );
}

function SubscriptionPage({
  plan,
  authz,
  billingEnabled,
  onBack,
  onOpenApp,
  onRefresh,
  onIndividualComplete,
  onInstitutionComplete
}: {
  plan: PlanSelection;
  authz: AuthorizationSummary | null;
  billingEnabled: boolean;
  onBack: () => void;
  onOpenApp: () => void;
  onRefresh: () => Promise<void>;
  onIndividualComplete: () => Promise<void>;
  onInstitutionComplete: () => Promise<void>;
}) {
  if (plan === 'free') {
    return <FreeSubscriptionPage onOpenApp={onOpenApp} />;
  }
  if (plan === 'student') {
    return (
      <StudentSubscriptionPage
        authz={authz}
        billingEnabled={billingEnabled}
        onBack={onBack}
        onOpenApp={onOpenApp}
        onRefresh={onRefresh}
        onComplete={onIndividualComplete}
      />
    );
  }
  if (plan === 'pro') {
    return (
      <ProSubscriptionPage
        authz={authz}
        billingEnabled={billingEnabled}
        onBack={onBack}
        onOpenApp={onOpenApp}
        onComplete={onIndividualComplete}
      />
    );
  }
  return (
    <InstitutionSubscriptionPage
      authz={authz}
      billingEnabled={billingEnabled}
      onBack={onBack}
      onOpenApp={onOpenApp}
      onComplete={onInstitutionComplete}
    />
  );
}

function FreeSubscriptionPage({ onOpenApp }: { onOpenApp: () => void }) {
  useEffect(() => {
    onOpenApp();
  }, [onOpenApp]);

  return (
    <div className="billing-shell">
      <section className="billing-card subscription-flow-card">
        <p className="auth-eyebrow">Fordisc Demo</p>
        <h1>Your Demo access is ready</h1>
        <p>Opening the read-only Demo Case workspace…</p>
        <button className="primary auth-primary-button" onClick={onOpenApp}>Open Fordisc Demo</button>
      </section>
    </div>
  );
}

function StudentSubscriptionPage({
  authz,
  billingEnabled,
  onBack,
  onOpenApp,
  onRefresh,
  onComplete
}: {
  authz: AuthorizationSummary | null;
  billingEnabled: boolean;
  onBack: () => void;
  onOpenApp: () => void;
  onRefresh: () => Promise<void>;
  onComplete: () => Promise<void>;
}) {
  const { isLoaded: userLoaded, user } = useUser();
  const [studentAttestation, setStudentAttestation] = useState(false);
  const [institutionalEmail, setInstitutionalEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState<ReturnType<NonNullable<typeof user>['createEmailAddress']> extends Promise<infer T> ? T | null : null>(null);
  const [verificationStep, setVerificationStep] = useState<'email' | 'code'>('email');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');

  const createInstitutionalEmail = useReverification(async (email: string) => {
    if (!user) throw new Error('Your account is still loading. Please try again.');
    return user.createEmailAddress({ email });
  });

  const makeInstitutionalEmailPrimary = useReverification(async (emailAddressId: string) => {
    if (!user) throw new Error('Your account is still loading. Please try again.');
    return user.update({ primaryEmailAddressId: emailAddressId });
  });

  const studentEligibility = authz?.student_eligibility;
  const studentEligible = Boolean(studentEligibility?.eligible);
  const studentAlreadyActive = authz?.access_tier === 'student';
  const fullAlreadyActive = authz?.access_tier === 'full';
  const eligibilityStatus = String(studentEligibility?.status || 'not_checked');
  const acceptedSuffixList = studentEligibility?.accepted_domain_suffixes?.length
    ? studentEligibility.accepted_domain_suffixes
    : ['.edu', '.mil', '.gov'];
  const acceptedSuffixes = acceptedSuffixList.join(', ');
  const eligibilityNeedsAttention = eligibilityStatus === 'verification_unavailable';

  const clientVerifiedInstitutionalEmail = useMemo(() => {
    return user?.emailAddresses.find((row) => {
      const verified = String(row.verification?.status || '').toLowerCase() === 'verified';
      return verified && emailMatchesInstitutionalSuffix(row.emailAddress, acceptedSuffixList);
    }) ?? null;
  }, [acceptedSuffixList, user]);

  const clientInstitutionalEmailIsPrimary = Boolean(
    clientVerifiedInstitutionalEmail && user?.primaryEmailAddress?.id === clientVerifiedInstitutionalEmail.id
  );

  useEffect(() => {
    if (studentEligible) {
      setVerificationStep('email');
      setPendingEmail(null);
      setVerificationCode('');
      setEmailError('');
      setEmailMessage('');
    }
  }, [studentEligible]);

  const activateVerifiedInstitutionalEmail = async (emailResource: NonNullable<typeof clientVerifiedInstitutionalEmail>) => {
    if (!user) throw new Error('Your account is still loading. Please try again.');
    if (user.primaryEmailAddress?.id !== emailResource.id) {
      await makeInstitutionalEmailPrimary(emailResource.id);
    }
    await user.reload();
    await onRefresh();
  };

  const handleUseVerifiedInstitutionalEmail = async () => {
    if (!clientVerifiedInstitutionalEmail) return;
    setEmailBusy(true);
    setEmailError('');
    setEmailMessage('');
    try {
      await activateVerifiedInstitutionalEmail(clientVerifiedInstitutionalEmail);
      setEmailMessage('The verified institutional email is now the primary Student-eligibility email. Access has been rechecked.');
    } catch (error) {
      setEmailError(clerkErrorMessage(error, 'The institutional email could not be made primary.'));
    } finally {
      setEmailBusy(false);
    }
  };

  const handleSendInstitutionalCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = institutionalEmail.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError('Enter a valid institutional email address.');
      return;
    }
    if (!userLoaded || !user) {
      setEmailError('Your account is still loading. Please try again.');
      return;
    }

    setEmailBusy(true);
    setEmailError('');
    setEmailMessage('');
    try {
      let emailResource = user.emailAddresses.find(
        (row) => row.emailAddress.trim().toLowerCase() === normalizedEmail
      );
      if (!emailResource) {
        emailResource = await createInstitutionalEmail(normalizedEmail);
      }
      if (!emailResource) throw new Error('The institutional email could not be loaded.');

      if (String(emailResource.verification?.status || '').toLowerCase() === 'verified') {
        await activateVerifiedInstitutionalEmail(emailResource);
        setEmailMessage('That institutional email was already verified and is now being used for Student eligibility.');
        return;
      }

      await emailResource.prepareVerification({ strategy: 'email_code' });
      setPendingEmail(emailResource);
      setVerificationStep('code');
      setVerificationCode('');
      setEmailMessage(`A verification code was sent to ${normalizedEmail}.`);
    } catch (error) {
      setEmailError(clerkErrorMessage(error, 'The institutional email could not be added or verified.'));
    } finally {
      setEmailBusy(false);
    }
  };

  const handleVerifyInstitutionalCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = verificationCode.trim();
    if (!pendingEmail) {
      setEmailError('Start again by entering the institutional email address.');
      setVerificationStep('email');
      return;
    }
    if (!code) {
      setEmailError('Enter the verification code sent to your institutional email.');
      return;
    }

    setEmailBusy(true);
    setEmailError('');
    setEmailMessage('');
    try {
      const verifiedEmail = await pendingEmail.attemptVerification({ code });
      if (String(verifiedEmail.verification?.status || '').toLowerCase() !== 'verified') {
        throw new Error('The institutional email was not verified. Please check the code and try again.');
      }
      await activateVerifiedInstitutionalEmail(verifiedEmail);
      setEmailMessage('Institutional email verified and selected as the primary Student-eligibility email. Access has been rechecked.');
      setVerificationStep('email');
      setPendingEmail(null);
      setVerificationCode('');
    } catch (error) {
      setEmailError(clerkErrorMessage(error, 'The verification code could not be confirmed.'));
    } finally {
      setEmailBusy(false);
    }
  };


  return (
    <div className="billing-shell">
      <section className="billing-card subscription-flow-card">
        <SubscriptionHeading title="Fordisc Student" price={STUDENT_PRICE} onBack={onBack} />

        {fullAlreadyActive || studentAlreadyActive ? (
          <ActiveSubscriptionMessage label={sourceLabel(authz)} onOpenApp={onOpenApp} />
        ) : studentEligible ? (
          <>
            <div className="eligibility-status eligible">
              Eligible through verified {studentEligibility?.verified_domain ?? 'institutional'} email.
            </div>
            <label className="student-attestation">
              <input type="checkbox" checked={studentAttestation} onChange={(event: ChangeEvent<HTMLInputElement>) => setStudentAttestation(event.target.checked)} />
              <span>I confirm that I am currently enrolled as a student and am using an institutional email assigned to me.</span>
            </label>
            {billingEnabled && STUDENT_PLAN_ID ? (
              <Show when="signed-in">
                <CheckoutButton planId={STUDENT_PLAN_ID} planPeriod="annual" for="user" onSubscriptionComplete={onComplete}>
                  <button className="primary plan-checkout-button" disabled={!studentAttestation}>Continue to Student checkout</button>
                </CheckoutButton>
              </Show>
            ) : (
              <button className="primary plan-checkout-button" disabled>Student checkout unavailable</button>
            )}
            {!studentAttestation && (
              <p className="student-checkout-note">Confirm the student attestation to enable checkout.</p>
            )}
          </>
        ) : (
          <>
            <div className="eligibility-status not-eligible">
              {clientVerifiedInstitutionalEmail
                ? clientInstitutionalEmailIsPrimary
                  ? 'A verified institutional email is present and selected. FORDISC is waiting for access to refresh.'
                  : 'A verified institutional email is present. Select it as the Student-eligibility email below.'
                : `No verified qualifying institutional email was found. Accepted domains include ${acceptedSuffixes}, plus any approved institutional domains.`}
            </div>

            <section className="student-email-verification" aria-label="Verify an institutional email">
              <div>
                <h2>Verify an institutional email</h2>
                <p>
                  Add an institutional email to this personal account. A verification code will be sent to that address; verifying it does not create or join an institutional account.
                </p>
              </div>

              {eligibilityNeedsAttention && (
                <div className="student-email-admin-warning">
                  Student eligibility could not be confirmed. Select Refresh access or contact subscription support.
                </div>
              )}

              {clientVerifiedInstitutionalEmail && !clientInstitutionalEmailIsPrimary && (
                <div className="student-email-existing">
                  <span>Verified: <strong>{clientVerifiedInstitutionalEmail.emailAddress}</strong></span>
                  <button
                    className="primary plan-checkout-button"
                    type="button"
                    onClick={handleUseVerifiedInstitutionalEmail}
                    disabled={emailBusy}
                  >
                    {emailBusy ? 'Updating…' : 'Use this email for Student eligibility'}
                  </button>
                </div>
              )}

              {verificationStep === 'email' ? (
                <form className="student-email-form" onSubmit={handleSendInstitutionalCode}>
                  <label htmlFor="fd4-student-institutional-email">Institutional email</label>
                  <input
                    id="fd4-student-institutional-email"
                    type="email"
                    autoComplete="email"
                    value={institutionalEmail}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setInstitutionalEmail(event.target.value)}
                    placeholder="student@university.edu"
                    disabled={emailBusy}
                  />
                  <button className="primary plan-checkout-button" type="submit" disabled={emailBusy || !userLoaded}>
                    {emailBusy ? 'Sending code…' : 'Send verification code'}
                  </button>
                </form>
              ) : (
                <form className="student-email-form" onSubmit={handleVerifyInstitutionalCode}>
                  <label htmlFor="fd4-student-verification-code">Verification code</label>
                  <input
                    id="fd4-student-verification-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={verificationCode}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setVerificationCode(event.target.value)}
                    placeholder="Enter code"
                    disabled={emailBusy}
                  />
                  <button className="primary plan-checkout-button" type="submit" disabled={emailBusy}>
                    {emailBusy ? 'Verifying…' : 'Verify institutional email'}
                  </button>
                  <button
                    className="secondary plan-checkout-button"
                    type="button"
                    onClick={() => {
                      setVerificationStep('email');
                      setPendingEmail(null);
                      setVerificationCode('');
                      setEmailError('');
                      setEmailMessage('');
                    }}
                    disabled={emailBusy}
                  >
                    Use a different email
                  </button>
                </form>
              )}

              {emailMessage && <div className="student-email-message success" role="status">{emailMessage}</div>}
              {emailError && <div className="student-email-message error" role="alert">{emailError}</div>}
            </section>

            <button className="secondary plan-checkout-button" onClick={onRefresh}>Recheck institutional email</button>
          </>
        )}
        <p className="subscription-support">Support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      </section>
    </div>
  );
}

function ProSubscriptionPage({
  authz,
  billingEnabled,
  onBack,
  onOpenApp,
  onComplete
}: {
  authz: AuthorizationSummary | null;
  billingEnabled: boolean;
  onBack: () => void;
  onOpenApp: () => void;
  onComplete: () => Promise<void>;
}) {
  const proAlreadyActive = authz?.access_tier === 'full' && authz?.payer_scope !== 'organization';

  return (
    <div className="billing-shell">
      <section className="billing-card subscription-flow-card">
        <SubscriptionHeading title="Fordisc Pro" price={PRO_PRICE} onBack={onBack} />
        {proAlreadyActive ? (
          <ActiveSubscriptionMessage label={sourceLabel(authz)} onOpenApp={onOpenApp} />
        ) : billingEnabled && PRO_PLAN_ID ? (
          <Show when="signed-in">
            <CheckoutButton planId={PRO_PLAN_ID} planPeriod="annual" for="user" onSubscriptionComplete={onComplete}>
              <button className="primary plan-checkout-button">Continue to Pro checkout</button>
            </CheckoutButton>
          </Show>
        ) : (
          <button className="primary plan-checkout-button" disabled>Pro checkout unavailable</button>
        )}
        <p className="subscription-support">Support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      </section>
    </div>
  );
}

function InstitutionSubscriptionPage({
  authz,
  billingEnabled,
  onBack,
  onOpenApp,
  onComplete
}: {
  authz: AuthorizationSummary | null;
  billingEnabled: boolean;
  onBack: () => void;
  onOpenApp: () => void;
  onComplete: () => Promise<void>;
}) {
  const activeOrganizationId = authz?.organization?.id;
  const { organization: activeOrganization } = useOrganization();
  const institutionAlreadyActive = authz?.access_tier === 'full' && authz?.payer_scope === 'organization';

  return (
    <div className="billing-shell">
      <section className="billing-card subscription-flow-card institution-subscription-card">
        <SubscriptionHeading title="Fordisc Institution" price={INSTITUTION_PRICE} onBack={onBack} />

        {institutionAlreadyActive ? (
          <ActiveSubscriptionMessage label="Fordisc Institution" onOpenApp={onOpenApp} />
        ) : !activeOrganizationId ? (
          <div className="institution-create-flow">
            <p>
              Create the institutional account here. This step is shown only after a user explicitly chooses Institutional Licensing; Student and Pro accounts remain personal, and Fordisc Demo requires no account.
            </p>
            <CreateOrganization
              routing="hash"
              afterCreateOrganizationUrl="/subscribe/institution"
              skipInvitationScreen
            />
          </div>
        ) : (
          <>
            <div className="active-institution-summary">
              <span>Institution</span>
              <strong>{activeOrganization?.name || authz?.organization?.slug || 'Institution account'}</strong>
            </div>
            {billingEnabled && INSTITUTION_PLAN_ID ? (
              <Show when="signed-in">
                <CheckoutButton planId={INSTITUTION_PLAN_ID} planPeriod="annual" for="organization" onSubscriptionComplete={onComplete}>
                  <button className="primary plan-checkout-button">Continue to institutional checkout</button>
                </CheckoutButton>
              </Show>
            ) : (
              <button className="primary plan-checkout-button" disabled>Institution checkout unavailable</button>
            )}
          </>
        )}
        <p className="subscription-support">Support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      </section>
    </div>
  );
}

function SubscriptionHeading({ title, price, onBack }: { title: string; price: string; onBack: () => void }) {
  return (
    <div className="billing-heading-row subscription-heading-row">
      <div>
        <p className="auth-eyebrow">FORDISC subscription</p>
        <h1>{title}</h1>
        <strong className="subscription-flow-price">{price}</strong>
      </div>
      <button className="secondary small-button" onClick={onBack}>Back to plans</button>
    </div>
  );
}

function ActiveSubscriptionMessage({ label, onOpenApp }: { label: string; onOpenApp: () => void }) {
  return (
    <div className="active-subscription-message">
      <strong>{label} is already active.</strong>
      <button className="primary plan-checkout-button" onClick={onOpenApp}>Open FORDISC</button>
    </div>
  );
}

function InstitutionManagementPage({
  authz,
  onBack,
  onInstitutionalLicensing
}: {
  authz: AuthorizationSummary | null;
  onBack: () => void;
  onInstitutionalLicensing: () => void;
}) {
  const activeOrganizationId = authz?.organization?.id;
  const admin = isOrganizationAdmin(authz?.organization?.role);

  return (
    <div className="billing-shell">
      <section className="billing-card billing-card-wide institution-management-card">
        <div className="billing-heading-row">
          <div>
            <p className="auth-eyebrow">Institution account</p>
            <h1>Manage Institution</h1>
            <p>
              {admin
                ? 'Institution administrators can invite named members, change roles, remove members, and review membership.'
                : 'Institution members can review their membership. Only Institution administrators can invite or remove members.'}
            </p>
          </div>
          <button className="secondary small-button" onClick={onBack}>Back to FORDISC</button>
        </div>

        {activeOrganizationId ? (
          <OrganizationProfile routing="hash" afterLeaveOrganizationUrl="/app" />
        ) : (
          <div className="auth-config-warning">
            <p>No institution is active in this session.</p>
            <button className="primary auth-primary-button" onClick={onInstitutionalLicensing}>Open Institutional Licensing</button>
          </div>
        )}
      </section>
    </div>
  );
}
