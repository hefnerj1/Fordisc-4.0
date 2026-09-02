> **Student eligibility update:** This package includes a signed session-claim fallback and improved Clerk lookup diagnostics. For the current Student setup, first read `FD4_CLERK_STUDENT_ELIGIBILITY_FALLBACK_v1_0_10.md`. Preserve all existing session claims and add `primary_email` and `email_verified` as described there.

# Fordisc 4.0 v1.0.10 — Public Plans, Personal Accounts, and Institution Setup

## 1. Purpose

This guide applies to the corrected v1.0.10 subscription build identified by:

```text
wrapper_version: 1.0.10
frontend_scaffold: react_typescript_v1_10_student_eligibility_fallback
workflow_screens_loaded: 9
```

The build implements four access profiles:

| Plan | Clerk scope | FD4 access |
|---|---|---|
| Fordisc Free | Personal Account | Built-in Module Test Case analysis only; Results and Graph; no measurement entry |
| Fordisc Student | Personal Account | FDB and Postcranial/Stature; Measurement Entry, Results, Graph |
| Fordisc Pro | Personal Account | Full FD4 |
| Fordisc Institution | Organization | Full FD4 for named members of the subscribing Organization |

The design rule is:

```text
Free, Student, and Pro are personal accounts.
Organizations exist only for institutional licensing.
Institutional membership is by named invitation, not by matching email domain.
```

The broad “any signed-in user is a beta user” bypass has been removed from the backend code path. The application does not read `FD4_CLERK_ALLOW_SIGNED_IN_BETA`.

## 2. Commercial values used by the build

### Fordisc Student

```text
Plan slug: fd4_student_access
Plan ID: cplan_3HHNPGhhocjgC7bCczaDZhjQIMO
Price: $50.04/year
Billing period: annual
Trial: none
```

### Fordisc Pro

```text
Plan slug: fd4_app_access
Plan ID: cplan_3Grg61YAfyMjpkWqoFYtVvrdXCY
Price: $150/year
Billing period: annual
Trial: none
```

### Fordisc Institution

```text
Plan slug: fordisc_institutional
Plan ID: cplan_3HHKaIeE74us1MVGx9pm1mgxbXp
Base price: $600/year
Included seats: 15
Additional seats: $20/year each
Maximum seats: 20
```

### Student eligibility

```text
Accepted verified-domain suffixes: .edu, .mil, .gov
Additional exact domains: configurable
Blocked domains: configurable
Student attestation: required before checkout
```

### Support

```text
fordisc.support@gmail.com
```

Clerk plan IDs are environment-specific. Confirm that these IDs belong to the same Clerk instance whose keys are used by the Render service.

## 3. Remove the broad signed-in beta bypass

### 3.1 What was removed from the code

The old implementation had an environment-derived Boolean and a branch equivalent to:

```python
CLERK_ALLOW_SIGNED_IN_BETA = _env_truthy(
    "FD4_CLERK_ALLOW_SIGNED_IN_BETA",
    "0",
)

if not beta_ok and CLERK_ALLOW_SIGNED_IN_BETA:
    beta_ok = True
    beta_source = "signed-in-beta"
```

Both the constant and the elevation branch are absent from this build.

The following were also removed:

```text
- allow_signed_in_beta from /authz/me responses
- clerk_allow_signed_in_beta from /health
- FD4_CLERK_ALLOW_SIGNED_IN_BETA from render.yaml
- the frontend access-summary field
- UI diagnostics referring to the bypass
```

Setting this obsolete variable in Render now has no effect:

```text
FD4_CLERK_ALLOW_SIGNED_IN_BETA=1
```

Delete it from Render anyway so the environment accurately reflects the current security model.

### 3.2 What now grants full manual beta access

Manual beta/admin elevation is explicit only. Use one of these mechanisms:

#### Preferred: Clerk private metadata

```json
{
  "fd4_access": "beta_tester"
}
```

Accepted default values are deliberately narrow:

```text
beta_tester
beta-tester
beta
admin
```

Generic values such as `active`, `pro`, `fordisc-pro`, or an unrelated Clerk `role` field do not grant access.

#### Optional: configured beta user IDs

```text
FD4_CLERK_BETA_USER_IDS=user_abc,user_xyz
```

#### Optional: configured beta email addresses

```text
FD4_CLERK_BETA_EMAILS=person1@example.edu,person2@example.gov
```

Private metadata is preferred because it is visible and auditable on each Clerk user record.

### 3.3 Resulting access precedence

The backend resolves access in this order:

```text
1. Explicit beta/admin metadata or configured beta identity → Full/manual
2. Active Organization-scoped Institution entitlement → Full/organization
3. User-scoped Pro entitlement → Full/user
4. User-scoped Student entitlement plus verified eligible email → Student
5. Every other authenticated account → Free
```

A signed-in account with no entitlement is no longer elevated. It receives Fordisc Free.

## 4. Correct Clerk Organization settings

Open the Clerk Dashboard for the same environment used by the staging deployment.

Navigate to:

```text
Organizations → Settings
```

Configure the following.

### 4.1 Organization membership

```text
Membership: Optional
Personal Accounts: Enabled
```

This is essential. Free, Student, and Pro must begin and remain in Personal Account context unless they separately join an institution.

Do not use “Membership required.” That setting causes newly registered users to be prompted to create or join an Organization.

### 4.2 Automatic first Organization

```text
Create first organization automatically: OFF
```

This prevents Clerk from creating an Organization for every newly registered individual.

### 4.3 Verified Domains

Do not configure `.edu`, `.mil`, or `.gov` as Clerk Organization Verified Domains.

Set Organization domain enrollment to:

```text
Verified Domains: disabled/not configured
Automatic invitation by domain: OFF
Automatic suggestion by domain: OFF
```

The application uses `.edu`, `.mil`, and `.gov` only to determine Student-plan eligibility. Those suffixes must not control Organization membership.

### 4.4 Organization creation

The corrected application exposes Organization creation only after a signed-in user explicitly selects:

```text
Institutional Licensing
```

There is no global Organization switcher and no Organization-creation prompt in Free, Student, or Pro flows.

For the current embedded institutional purchase flow, Clerk must permit that purchaser to create one Organization. Set a conservative per-user Organization creation limit, such as:

```text
Organization creation limit: 1
```

Do not set Organization membership to required. Do not enable automatic first-Organization creation.

A later enterprise-sales workflow could instead create institutions manually in the Clerk Dashboard, but that is not required for this build.

### 4.5 Roles

Retain the default roles:

```text
Organization Admin
Organization Member
```

The purchaser/creator should be the Organization Admin. Only admins should be able to invite or remove named members.

### 4.6 Member enrollment

Use named Organization invitations only:

```text
Institution Admin enters a specific email address
Clerk sends that person an invitation
Invitee accepts
Invitee occupies a seat
```

Do not use domain-based automatic invitations, domain suggestions, or automatic enrollment.

## 5. Clerk plan configuration

### 5.1 Fordisc Free

Fordisc Free is the application fallback for any authenticated account without a qualifying paid/full/manual entitlement. It does not require a paid Clerk plan.

Do not attach full-access features to Clerk’s default Free plan.

### 5.2 Fordisc Student

Confirm under User Plans:

```text
Plan ID: cplan_3HHNPGhhocjgC7bCczaDZhjQIMO
Plan slug: fd4_student_access
Billing: annual
Price: $50.04
Trial: none
Scope: User/Personal Account
```

Attach the Student entitlement/feature only. Do not attach `fd4_full_access`.

### 5.3 Fordisc Pro

Confirm under User Plans:

```text
Plan ID: cplan_3Grg61YAfyMjpkWqoFYtVvrdXCY
Plan slug: fd4_app_access
Billing: annual
Price: $150
Trial: none
Scope: User/Personal Account
```

The backend recognizes the user-scoped plan slug `fd4_app_access` as full Pro access.

The explicit feature fallback is restricted to:

```text
fd4_full_access
```

This prevents a mistakenly reused `fd4_app_access` feature from elevating an unrelated account.

### 5.4 Fordisc Institution

Confirm under Organization Plans:

```text
Plan ID: cplan_3HHKaIeE74us1MVGx9pm1mgxbXp
Plan slug: fordisc_institutional
Billing: annual
Base price: $600
Included seats: 15
Additional seats: $20/year
Maximum seats: 20
Scope: Organization
```

Attach:

```text
fd4_full_access
```

The backend deliberately refuses to treat a user-scoped `fordisc_institutional` claim as institutional access. The claim must be Organization-scoped and the Organization must be active in the current session.

## 6. Public landing and registration flow

The signed-out landing page contains clickable options:

```text
Create Free Account
Choose Student
Choose Pro
Institutional Licensing
Sign in
```

An unregistered visitor selects a plan before registration. Clerk then registers/verifies the user and returns the user to the selected route:

```text
/subscribe/free
/subscribe/student
/subscribe/pro
/subscribe/institution
```

### 6.1 Free

```text
Select Create Free Account
Register and verify email
Return to /subscribe/free
Open read-only Module Test Case workspace
```

### 6.2 Student

```text
Select Choose Student
Register and verify the initial Clerk account email
Return to /subscribe/student
If no qualifying verified address is present, enter an institutional email
Receive and enter the Clerk email verification code
FD4 rechecks .edu/.mil/.gov or allowlisted-domain eligibility
User checks current-student attestation
Complete Student checkout
Open Student workspace
```

The Student page includes the institutional-email add/verify flow directly. Adding a qualifying email keeps the user in a Personal Account and does not create or join an Organization. Clerk **Email verification code** must be enabled. A valid `CLERK_SECRET_KEY` remains recommended for the preferred backend user-record lookup; the current build also supports the signed session-claim fallback described in `FD4_CLERK_STUDENT_ELIGIBILITY_FALLBACK_v1_0_10.md`.

For a Clerk development instance in test mode, an address such as `fd4student+clerk_test@example.edu` can be verified with code `424242`. Do not enable Clerk test mode in production.

### 6.3 Pro

```text
Select Choose Pro
Register and verify email
Return to /subscribe/pro
Complete Pro checkout
Open full personal FD4
```

### 6.4 Institution

```text
Select Institutional Licensing
Register or sign in
Return to /subscribe/institution
Create the institution Organization in this controlled path
Complete Organization checkout
Open Manage Institution
Admin invites named members
```

Free, Student, and Pro users are never shown Organization creation in their normal flows.

## 7. User-facing plan page cleanup

The signed-in “Choose Fordisc access” page intentionally contains only:

```text
Plan name
Price
Current-access label, when applicable
Action button
```

Removed before deployment:

```text
- Access Details diagnostic box
- technical entitlement/claim diagnostics
- expandable Plan details sections
- feature/key/plan-ID disclosures in plan cards
- global Organization switcher
```

The internal `/authz/me` endpoint still returns structured authorization data for application operation and support troubleshooting, but it is not displayed in the customer plan UI.

## 8. Render staging configuration

Use a separate Render staging service first.

### 8.1 Core access settings

```text
FD4_BETA_AUTH_REQUIRED=0
VITE_CLERK_ENABLED=1
FD4_CLERK_AUTH_REQUIRED=1
FD4_CLERK_ACCESS_REQUIRED=1
```

Do not add:

```text
FD4_CLERK_ALLOW_SIGNED_IN_BETA
```

The application does not read it.

### 8.2 Required Clerk values

Set only in Render:

```text
VITE_CLERK_PUBLISHABLE_KEY=<publishable key for this Clerk environment>
CLERK_JWT_KEY=<JWT verification public key>
CLERK_SECRET_KEY=<secret backend key>
CLERK_AUTHORIZED_PARTIES=https://<exact-staging-origin>
```

Do not create `VITE_CLERK_SECRET_KEY`. Variables beginning with `VITE_` are included in the frontend bundle.

Use exact origins with `https://`, no path, and no trailing slash.

### 8.3 Public sign-up gate

For staging:

```text
VITE_FD4_PUBLIC_SIGNUP_ENABLED=0
```

After the full account matrix passes, set production to:

```text
VITE_FD4_PUBLIC_SIGNUP_ENABLED=1
```

Because this is a Vite build-time variable, clear the Render build cache and rebuild after changing it.

### 8.4 Student variables

```text
VITE_CLERK_STUDENT_PLAN_ID=cplan_3HHNPGhhocjgC7bCczaDZhjQIMO
VITE_CLERK_STUDENT_PLAN_SLUG=fd4_student_access
FD4_CLERK_STUDENT_PLAN_SLUG=fd4_student_access
FD4_CLERK_STUDENT_FEATURE_KEY=fd4_student_access
VITE_FD4_STUDENT_PRICE=$50.04/year
FD4_STUDENT_EMAIL_DOMAIN_SUFFIXES=.edu,.mil,.gov
FD4_STUDENT_EMAIL_DOMAINS=
FD4_STUDENT_EMAIL_BLOCKLIST=
```

### 8.5 Pro variables

```text
VITE_CLERK_PRO_PLAN_ID=cplan_3Grg61YAfyMjpkWqoFYtVvrdXCY
VITE_CLERK_PRO_PLAN_SLUG=fd4_app_access
FD4_CLERK_PRO_PLAN_SLUG=fd4_app_access
FD4_CLERK_PRO_FEATURE_KEY=fd4_full_access
VITE_FD4_PRO_PRICE=$150/year
```

### 8.6 Institution variables

```text
VITE_CLERK_INSTITUTION_PLAN_ID=cplan_3HHKaIeE74us1MVGx9pm1mgxbXp
VITE_CLERK_INSTITUTION_PLAN_SLUG=fordisc_institutional
FD4_CLERK_INSTITUTION_PLAN_SLUG=fordisc_institutional
FD4_CLERK_INSTITUTION_FEATURE_KEY=fd4_full_access
FD4_CLERK_FULL_FEATURE_KEYS=fd4_full_access
VITE_FD4_INSTITUTION_PRICE=$600/year
VITE_FD4_INSTITUTION_INCLUDED_SEATS=15
VITE_FD4_INSTITUTION_EXTRA_SEAT_PRICE=$20/year
VITE_FD4_INSTITUTION_MAX_SEATS=20
```

### 8.7 Beta/manual variables

```text
FD4_CLERK_BETA_ACCESS_VALUES=beta_tester,beta-tester,beta,admin
FD4_CLERK_USER_CACHE_TTL_SECONDS=60
```

Optional:

```text
FD4_CLERK_BETA_USER_IDS=
FD4_CLERK_BETA_EMAILS=
```

### 8.8 Support

```text
VITE_FD4_SUPPORT_EMAIL=fordisc.support@gmail.com
PYTHONUNBUFFERED=1
```

## 9. Build and deploy staging

### 9.1 Local Docker

From the repository root:

```bash
docker compose --profile ui up --build
```

Local Docker intentionally runs without Clerk by default and therefore exposes full FD4 for parity testing.

### 9.2 Render

Use:

```text
Runtime: Docker
Dockerfile: ./Dockerfile.render
Health check: /render-health
Auto deploy: Off during validation
```

After committing the corrected package:

```text
Manual Deploy → Clear build cache & deploy
```

### 9.3 Health check

Expected `/health` values:

```text
wrapper_version: 1.0.10
frontend_scaffold: react_typescript_v1_10_student_eligibility_fallback
workflow_screens_loaded: 9
```

Expected authentication values:

```text
clerk_auth_required: true
clerk_access_required: true
clerk_user_lookup_available: true
```

There is intentionally no signed-in-beta-bypass field.

## 10. Required account matrix

### 10.1 Unregistered visitor

Verify:

```text
- public Fordisc landing page appears;
- four plan buttons are clickable when public sign-up is enabled;
- Sign in appears;
- plan choice survives registration;
- no Organization prompt appears for Free, Student, or Pro.
```

### 10.2 Free

Use a signed-in account with no paid plan and no manual beta metadata.

Verify:

```text
- access tier is Free;
- Measurement Entry is absent;
- no measurement fields are delivered;
- FDB, Howells, and Postcranial Module Test Cases run;
- only Results and Graph are available;
- New/Open/Save Case are absent;
- ordinary analysis requests receive 403;
- measurement metadata requests receive 403.
```

### 10.3 Eligible Student

Start with a Free personal account that does not yet have a qualifying verified email. Open **Plans → Fordisc Student**, add and verify a `.edu`, `.mil`, `.gov`, or allowlisted address, check the current-student attestation, and complete Student checkout.

Verify:

```text
- the add-email action triggers Clerk reverification when required;
- the verification code is sent and accepted;
- eligibility changes to verified/eligible without creating an Organization;
- Student checkout becomes enabled only after the attestation is checked;
- access tier is Student after checkout;
- FDB and Postcranial are available;
- Howells is unavailable;
- Measurement Entry, Results, Graph are the only workflow screens;
- New/Open/Save FD4 Case work;
- Analysis Setup appears inside Measurement Entry;
- report/export, Help, Extended Results, Import, and Notes/Run Log are unavailable;
- modified requests cannot enable Stepwise, transformations, outlier exclusions, or restricted endpoints.
```

### 10.4 Ineligible Student-plan account

Use a Student-plan account with only an ordinary verified email, such as Gmail.

Verify:

```text
- the Student claim is visible to the backend;
- eligibility fails;
- effective access remains Free;
- no measurement entry is available;
- an institutional-email explanation appears at Student checkout.
```

### 10.5 Pro

Verify full individual access to every current module, screen, case function, report, import, export, option, and graph download.

Verify that no Organization is created or requested.

### 10.6 Institution administrator

Verify:

```text
- Organization creation occurs only after choosing Institutional Licensing;
- institution checkout requires that Organization to be active;
- full access appears after Organization subscription;
- Manage Institution is visible to the admin;
- admin can invite named users;
- no domain-based auto-enrollment occurs;
- seat counts respond to members and pending invitations as configured.
```

### 10.7 Institution member

Verify:

```text
- member joins only after accepting a named invitation;
- full access appears while the subscribed Organization is active;
- the member cannot invite/remove members unless assigned admin role;
- Personal Account context returns the person to their personal Free/Student/Pro tier.
```

### 10.8 Explicit beta tester

Set private metadata:

```json
{
  "fd4_access": "beta_tester"
}
```

Verify full manual access.

Then create another signed-in account with no claim and no metadata. Verify that it remains Free even if the obsolete environment variable is accidentally present.

## 11. Locked regression validation

### 11.1 FA008-09

```text
Case: FA008-09
Module: FDB
Groups: all males
Stepwise: off
```

Expected:

```text
Top group: WM
D²: about 27.5
Posterior: about 0.897
Typ. F: about 0.329
Typ. χ²: about 0.282
Typ. R: about 0.390
x-validated accuracy: 66.9% (534/798)
```

### 11.2 Case-based workflow

Verify one case preserves:

```text
FDB cranial measurements and selections
Howells cranial measurements and selections
Postcranial measurements and selections
Case-level identity/data
Independent module analyses
schema_version: 3
module_states
```

### 11.3 Existing hotfixes

Verify:

```text
- outlier button disengages after use;
- stature rounding and restored options remain correct;
- reports and exports show only 1.0.10;
- English/Español remains persistent;
- measurement-entry Tab order skips measurement-use checkboxes.
```

## 12. Production rollout

Do not promote until the complete matrix passes.

1. Tag all current beta testers with explicit private metadata.
2. Confirm Clerk Organizations use optional membership.
3. Confirm automatic first-Organization creation is off.
4. Confirm Organization Verified Domains and domain auto-enrollment are off.
5. Confirm plan IDs match the production Clerk environment.
6. Deploy the corrected build with public sign-up still off.
7. Test Free, eligible Student, ineligible Student, Pro, Institution Admin, Institution Member, and beta tester.
8. Run locked parity and case-based tests.
9. Remove the obsolete bypass variable from the Render environment.
10. Enable public sign-up.
11. Clear Render build cache and redeploy.
12. Repeat public registration and checkout smoke tests.
13. Monitor Clerk subscriptions, organization invitations, seat counts, and `/authz/me` resolution during launch.

## 13. Rollback

The safest immediate rollback controls are:

```text
VITE_FD4_PUBLIC_SIGNUP_ENABLED=0
Clerk plan visibility: hidden/unpublished
Render rollback to the prior known-good image/commit
```

Do not reintroduce a broad signed-in bypass. Preserve beta access through explicit metadata instead.

## 14. Spanish status

The original 280 native-reviewed strings remain unchanged. Newly added public-plan, subscription, and institution-management strings remain a focused translation addendum for later native-speaker review.

## 15. Secrets

Never commit or paste:

```text
CLERK_SECRET_KEY
payment credentials
private keys
passwords
```

The Clerk plan IDs and plan slugs in this guide are identifiers, not secrets.
