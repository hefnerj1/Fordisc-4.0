# Fordisc 4.0 v1.0.10 Subscription-Tier Handoff

## Build identity

```text
wrapper_version: 1.0.10
frontend_scaffold: react_typescript_v1_10_subscription_tiers
workflow_screens_loaded: 9
engine_version: fordisc4_r_engine_v0_14
public_version: 1.0.10
```

## Purpose

Add the commercial access architecture for Free, Student, Pro, and Institution while preserving the current case-based workflow, reviewed Spanish translation, short public version display, and locked analysis parity.

## Tier definitions

### Free

- all three module names;
- server-controlled module test case only;
- Results and Graph;
- no measurement entry or case management;
- no arbitrary analysis, exports, downloads, Extended Results, imports, options, Help, or Notes/Run Log.

### Student

- user-scoped paid plan;
- verified `.edu`, `.mil`, `.gov`, or allowlisted institutional email;
- FDB and Postcranial/Stature;
- Measurement Entry, Results, Graph;
- New/Open/Save FD4 cases;
- compact Analysis Setup embedded in Measurement Entry;
- backend-enforced safe defaults and limited response.

### Pro

- user-scoped paid plan;
- full FD4.

### Institution

- Organization-scoped paid plan;
- full FD4 for named Organization members while the subscribed Organization is active.

### Beta/manual

- Clerk private metadata `{"fd4_access":"beta_tester"}`;
- full FD4.

## Commercial values

```text
Student: fd4_student_access / cplan_3HHNPGhhocjgC7bCczaDZhjQIMO / $50.04 annual
Pro: fd4_app_access / cplan_3Grg61YAfyMjpkWqoFYtVvrdXCY / $150 annual
Institution: fordisc_institutional / cplan_3HHKaIeE74us1MVGx9pm1mgxbXp / $600 annual
Institution seats: 15 included; $20/year additional; maximum 20
Support: fordisc.support@gmail.com
```

## Backend implementation

- Preserves Clerk `u:` and `o:` entitlement scope.
- Resolves precedence: beta/manual → Institution → Pro → eligible Student → Free.
- Uses Clerk Backend API user lookup for private beta metadata and verified Student email.
- Returns tier/capability information from `/authz/me`.
- Filters metadata and workflow responses by capability.
- Rejects unauthorized modules and routes with 403.
- Sanitizes Student analysis requests to safe fixed values.
- Removes Extended/export-only payload from limited responses.
- Adds `/analyze/module-test-case`, which accepts only a module ID and loads the fixture server-side.

## Frontend implementation

- Adds an access context consumed by the main application.
- Adds Free, Student, Pro, and Institution plan presentation and checkout controls.
- Adds OrganizationSwitcher for institutional access.
- Adds a signed-out public plan summary without rendering checkout while signed out.
- Applies the saved English/Español choice before Clerk/access screens render.
- Filters modules, tabs, case controls, reports, imports, Help, and graph downloads by capability.
- Adds Student Analysis Setup inside Measurement Entry.
- Adds Free server-test-case workflow with no measurement form.
- Gives measurement inclusion checkboxes `tabIndex={-1}` so value-entry tabbing is continuous.

## Files changed from the reviewed-Spanish version-display base

```text
Dockerfile.render
render.yaml
app/main.py
frontend/package.json
frontend/src/App.tsx
frontend/src/ClerkAuthShell.tsx
frontend/src/access.tsx              [new]
frontend/src/api.ts
frontend/src/i18n.ts
frontend/src/main.tsx
frontend/src/styles.css
scripts/smoke_test.py
README.md
README_USE_THIS_PATCH.txt
docs/FD4_CLERK_SUBSCRIPTION_SETUP_v1_0_10.md              [new]
docs/fd4_v1_0_10_subscription_tiers_handoff.md           [new]
docs/fd4_v1_0_10_subscription_tiers_validation_report.txt [new]
```

## Explicit non-changes

No intentional changes were made to:

- R engine files;
- R bridge files;
- reference datasets;
- example analysis fixtures;
- DFA or stature mathematics;
- Stepwise calculations;
- posterior or typicality calculations;
- report/graph numerical content;
- schema-version-3 case structure;
- the original 280 native-reviewed translation strings;
- accepted v1.0.6 parity behavior.

## Deployment gate

This build must first go to a separate Render staging service.

Before deployment:

```text
1. Tag every existing beta tester in Clerk private metadata.
2. Set FD4_CLERK_ALLOW_SIGNED_IN_BETA=0.
3. Keep VITE_FD4_PUBLIC_SIGNUP_ENABLED=0.
4. Verify the plan IDs belong to the Clerk environment connected to staging.
```

## Local command

```bash
docker compose --profile ui up --build
```

## Required review checklist

### Build

- application launches;
- `/health` reports `1.0.10`;
- scaffold is `react_typescript_v1_10_subscription_tiers`;
- workflow screen count remains 9.

### Free

- no measurement entry;
- all three module test cases run;
- Results/Graph only;
- no case controls or downloads;
- arbitrary API analysis is blocked.

### Student

- verified qualifying email + Student plan resolves to Student;
- FDB/Postcranial only;
- Measurement Entry/Results/Graph only;
- New/Open/Save FD4 works;
- Howells and restricted APIs are blocked;
- enforced defaults cannot be bypassed through a modified request.

### Pro

- all existing full features remain available.

### Institution

- full access only with active subscribed Organization;
- Personal Account does not inherit organization access;
- admin/member and seat behavior match Clerk configuration.

### Beta

- manually tagged users remain full with signed-in bypass disabled.

### UX

- Tab moves from one measurement value field to the next;
- measurement-use checkboxes remain clickable;
- all other meaningful controls remain keyboard-focusable.

### Parity

- locked FA008-09 result remains unchanged;
- case-based save/reopen remains correct;
- outlier button remains fixed;
- all user-facing versions remain `1.0.10`.

## Branch handoff

**Accepted parity baseline:** v1.0.6, locked.  
**Current build:** v1.0.10 subscription-tier staging candidate.  
**Latest change:** Free, Student, Pro, and Institution access profiles plus measurement-checkbox tab-order refinement.  
**Locked behavior:** engine, reference data, mathematics, reports, graphs, Stepwise, stature calculations, schema-version-3 case data, reviewed Spanish base.  
**Deployment status:** package validated statically and at the FastAPI authorization layer; full local Docker/R and live Clerk checkout matrix still required.  
**Next intended action:** local Docker parity/case test, separate Render subscription staging deployment, full account matrix, then controlled production promotion.
