# FORDISC 4.0 v1.0.15 Handoff

## Status

v1.0.15 is built directly on the user-accepted and locked v1.0.14.1 package. It is the invitation-only production-transition candidate.

Locked release line:

- v1.0.6 no-Stepwise analytical parity: locked.
- v1.0.13 all four Stepwise methods: locked.
- v1.0.13.1 diagnostic parity: locked.
- v1.0.13.2 Howells timeout/performance correction: locked after live FD3-corresponding all-group runs completed in approximately 12 seconds.
- v1.0.14 interface/workflow polish: locked.
- v1.0.14.1 Run Log PDF and large-group table containment: locked.
- v1.0.15 TouchNet transition, Reference Group World Map, metric stature display, and production-facing copy: current deployment candidate.

Do not alter the R engine, reference datasets, accepted Stepwise implementation, diagnostics, stature equations, or v1.0.13.2 performance code while deploying or refining production configuration.

## Expected live identity

```text
wrapper_version: 1.0.15
frontend_scaffold: react_typescript_v1_0_15_touchnet_reference_map_metric_units
workflow_screens_loaded: 9
engine_version: fordisc4_r_engine_v0_14
r_bridge_timeout_seconds: 900
```

Active Help source:

```text
fd4_help_living_draft_v1_0_15.md
```

## User-approved v1.0.15 scope

### TouchNet storefront

The opening page and signed-in Plans page display informational plan cards. Plan-specific signup/checkout buttons were removed from those two pages. Each page now contains one **Purchase Access Through UTK** button pointing to:

```text
https://secure.touchnet.com/C21610_ustores/web/store_main.jsp?STOREID=15&SINGLESTORE=true
```

The purchase panel states that the FORDISC username and password will be supplied by email and that account setup may take up to 24 hours.

Packaged deployment defaults remain:

```text
VITE_FD4_PUBLIC_SIGNUP_ENABLED=0
VITE_CLERK_BILLING_ENABLED=0
```

This keeps the initial launch invitation-only and prevents Clerk checkout from competing with TouchNet.

### Plans and support

Current displayed prices remain:

```text
Fordisc Free         $0/year
Fordisc Student      $45/year
Fordisc Pro          $150/year
Fordisc Institution  $600/year
```

Fordisc Institution now includes **10 named users**. Additional named users may be added; public price is currently **price TBD**. Plan cards remain equal height.

Temporary subscription/eligibility support:

```text
fordisc.support@gmail.com
```

Keep `VITE_FD4_SUPPORT_EMAIL` set to this address in every deployment.

### Manual TouchNet entitlements

Clerk remains the identity/organization/authorization system. v1.0.15 adds a controlled private-metadata entitlement path so a verified TouchNet purchase can be fulfilled manually during the invitation-only transition.

User private metadata accepts:

```text
student
pro
```

Organization private metadata accepts:

```text
institution
```

Each paid record requires:

```text
tier
status: active
source: touchnet
valid_until: future ISO-8601 UTC date/time
```

`valid_from` is optional. Institution records may include `seat_limit`, initially 10. Student access still requires the existing verified institutional-email eligibility check. Expired or inactive records automatically cease granting paid access. The order reference is never returned to the browser.

Use:

```text
docs/FD4_TOUCHNET_MANUAL_PROVISIONING_v1_0_15.md
```

for exact metadata examples and the fulfillment procedure.

### Student checkbox

The oversized **Include records with missing birth year** control in Fordisc Student Postcranial is corrected to 18 × 18 pixels. Its default and analytical behavior are unchanged.

### Reference Group World Map

The duplicate expanded `Reference Group Selection` tab is retired. Reference groups are still selected through the compact panel above Measurement Entry.

Full-access navigation now ends with:

```text
Help
Reference Group World Map
```

The new map tab:

- reproduces the Howells location map from the FORDISC 3 Help file;
- overlays seven approximate FDB source-area markers;
- includes all 13 FDB group codes;
- includes all 65 current selectable Howells/UTK group codes;
- states clearly that locations are approximate and informational;
- does not change analytical group selection.

Map refinements may be made later as an isolated informational/UI change without reopening analytical behavior.

### Stature display units

Postcranial stature now has a display-only **Inches / Centimeters** toggle.

- Full users select it on Options.
- Fordisc Student selects it in Postcranial stature settings on Measurement Entry.
- Default is Inches.
- Conversion is exactly `1 inch = 2.54 centimeters`.
- The toggle changes Results, Extended Results, stature graphs, current reports, and newly recorded Run Log presentation.
- Saved cases preserve the preference.
- Each Run Log entry preserves the units used for that completed run.
- Older cases and entries default to inches.
- The analytical request, equations, ranking, classification, and R engine are unaffected.

### Large-group tables

Automatic horizontal containment for more than 12 groups remains. The separate visible explanatory banner and its translation keys were removed. Default small-analysis presentation is unchanged.

## Terms status

The package includes editable Word and source-Markdown copies:

```text
docs/FD4_TERMS_AND_CONDITIONS_DRAFT_v1_0_15.docx
docs/FD4_TERMS_AND_CONDITIONS_DRAFT_v1_0_15.md
```

It is explicitly marked:

```text
DRAFT FOR UNIVERSITY OF TENNESSEE REVIEW
NOT APPROVED, NOT EFFECTIVE, AND NOT FOR PUBLIC POSTING
```

Do not add it as an effective public agreement until UTK approves the contracting entity, privacy language, refunds/cancellations, governing law, liability/immunity language, acceptance recording, institutional terms, and official contacts.

## Locked analytical files

The following were compared byte-for-byte with accepted v1.0.14.1:

```text
engine/fordisc4_r_engine_v0_14/R/lda_engine.R
engine/fordisc4_r_engine_v0_14/R/utils.R
r_bridge/run_engine.R
engine/fordisc4_r_engine_v0_14/data/FD3CRAN.csv
engine/fordisc4_r_engine_v0_14/data/FD3POST.csv
engine/fordisc4_r_engine_v0_14/data/FD3VARRANGES.csv
engine/fordisc4_r_engine_v0_14/data/fdb_cranial.csv
engine/fordisc4_r_engine_v0_14/data/fdb_postcranial.csv
engine/fordisc4_r_engine_v0_14/data/fdb_stature.csv
```

Locked `lda_engine.R` SHA-256:

```text
fe3a6ee0f23cdba4ebd1eb22a774e24f8d5c9e3557eaa1a0d111874b1a62b83f
```

## Validation completed in the artifact environment

Passed:

- Python compilation.
- v1.0.15 static release checks.
- in-process `/health`, workflow, and Help endpoint checks.
- manual TouchNet Student/Pro/Institution, expiration, wrong-scope, and Student-eligibility checks.
- exact stature display conversion and analytical-isolation checks.
- structured timeout behavior.
- exact one-case-deletion numerical equivalence.
- frontend syntax transpilation for nine active source files.
- semantic TypeScript checking with dependency stubs.
- browser layout checks for equal plan-card heights, one TouchNet action, 18 × 18 Student checkbox, map rendering, unit selector, and 65-group containment without a visible banner or page overflow.
- byte-for-byte comparison of locked analytical/reference files.

Not available in the artifact environment:

- Rscript.
- Docker.
- a fresh production Vite build, because the package-registry dependency installation timed out.

The clean Docker/Render frontend build and live R regressions remain deployment-side acceptance steps.

## Focused deployment procedure

1. Use the complete package as a clean repository replacement, or apply the mini-patch to a clean accepted v1.0.14.1 repository.
2. Confirm the intended Render environment variables and Clerk Development keys.
3. In Render choose **Manual Deploy -> Clear build cache & deploy**.
4. Read the live `/health` response and verify the expected identity above.
5. Verify the opening and Plans pages before running analyses.
6. Run the focused functional checks below.
7. Keep the initial deployment invitation-only.
8. Create/configure the Clerk Production instance and `fordisc.com` DNS separately when Ron supplies domain access.
9. Do not accept paid public subscriptions under the draft Terms until UTK approval is complete.

## Focused live acceptance

1. Opening page: four equal plan cards, one TouchNet button, 24-hour credential notice, support email.
2. Plans page: same structure and current-access label, no plan-specific checkout buttons.
3. Institution copy: 10 named users and additional-user price TBD.
4. Student Postcranial: missing-birth-year checkbox is proportional.
5. Full access: Reference Group World Map appears after Help; image and directories load.
6. Measurement Entry: compact Reference Groups panel still changes the selected analytical groups.
7. Postcranial stature: run once in Inches, switch to Centimeters without rerunning, and verify Results/Extended/Graphs/Report.
8. Confirm `70.0 in` displays as `177.8 cm` and returns to `70.0 in`.
9. Save/reopen a case and verify unit preference.
10. Record runs in both units and verify Run Log/Run Log PDF retain each run’s units.
11. All-group Howells: tables remain inside the page, scroll horizontally, and show no explanatory banner.
12. Locked FA008-09 no-Stepwise test.
13. Locked Stepwise regression test.
14. v1.0.13.1 diagnostic targets.
15. All-group Howells LOOCV / Stepwise None / no transformation performance and FD3 correspondence.
16. Clerk Development: manually provision Student, Pro, Institution, expiration, and revocation examples before production fulfillment.

## Production items still pending outside this build

- Access to and DNS configuration for `fordisc.com`.
- Clerk Production instance and production invitation flow.
- UTK decision on TouchNet operational roles and final product configuration.
- Final support owner/address.
- UTK approval of Terms, privacy, refund/cancellation, renewal, and institutional policies.
- Final additional-user price and any revised institutional maximum.
- Automated TouchNet-to-Clerk fulfillment, if later desired.

## Rollback

The direct rollback target is accepted v1.0.14.1. The analytical contract and case schema did not change. Schema-4 cases remain readable; v1.0.14.1 simply ignores the new display-unit preference and restores its prior storefront/map/navigation presentation.
