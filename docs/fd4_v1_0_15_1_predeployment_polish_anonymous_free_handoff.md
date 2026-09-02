# FORDISC 4.0 v1.0.15.1 Handoff

## Release status

v1.0.15.1 is a narrow predeployment patch built directly on the accepted v1.0.15 source package. It is intended to be the final build before the first technical deployment to `fordisc.com`, subject to live Docker/Render/R acceptance.

The release adds a functional no-sign-in Fordisc Free path, simplifies the Reference Group World Map to Howells only, corrects the Analysis Options proportions, removes one Extended Results helper sentence, and makes the upper-left FORDISC brand a workspace reset/home control.

Everything else in v1.0.15 remains locked.

## Expected live identity

```text
wrapper_version: 1.0.15.1
frontend_scaffold: react_typescript_v1_0_15_1_public_free_ui_polish
workflow_screens_loaded: 9
engine_version: fordisc4_r_engine_v0_14
r_bridge_timeout_seconds: 900
```

Reports and exports display only:

```text
1.0.15.1
```

## Direct base and rollback

- Direct base: accepted v1.0.15 full package.
- Mini-patch target: a clean accepted v1.0.15 source tree.
- Direct rollback: accepted v1.0.15 full package.
- Case schema remains version 4.
- Analytical response structures remain unchanged.

## No-sign-in Fordisc Free

The signed-out landing page includes **Try Fordisc Free**. It opens `/try` without requiring Clerk sign-in or account creation.

Anonymous Free exposes:

```text
Modules:
- FDB
- Howells
- Postcranial

Screens:
- Results
- Graphs

Permitted operation:
- Locked server-controlled Module Test Case
```

Anonymous Free does not expose:

```text
- Measurement Entry
- User-supplied measurements or arbitrary analysis
- Case creation, opening, saving, or notes
- Analysis Options
- Extended Results
- Reports or exports
- Notes / Run Log
- Import Data
- In-app Help
- Reference Group World Map
- Reference-outlier controls
```

The browser sends only a module identifier. The server loads the case values, variables, groups, and settings from packaged fixtures and then reduces the response to the Free tier.

### Exact public API boundary

The anonymous marker is recognized only for:

```text
GET  /metadata/modules
POST /analyze/module-test-case
```

The same marker does not authorize other metadata, Help, or analysis endpoints. Without the marker, the two routes remain protected when Clerk authentication is required.

### Public-demo controls

Packaged defaults:

```text
FD4_PUBLIC_FREE_ENABLED=1
VITE_FD4_PUBLIC_FREE_ENABLED=1
FD4_MODULE_TEST_CASE_CACHE_ENABLED=1
FD4_ANONYMOUS_FREE_RATE_WINDOW_SECONDS=3600
FD4_ANONYMOUS_FREE_RATE_MAX_RUNS=120
FD4_ANONYMOUS_FREE_MAX_CONCURRENT=4
```

The cache is in memory and is reset by a deployment/restart. Rate state is also in memory. These controls are an initial soft-launch boundary, not a distributed rate-limiting system.

## Reference Group World Map

The current screen shows only the Howells populations documented in the FORDISC 3 Help file.

Removed from the rendered screen:

- approximate FDB markers;
- FDB legend;
- FDB selection/detail panel;
- FDB location directory.

The map is centered and constrained to:

```text
maximum width: 980 px or available width
maximum desktop height: min(62vh, 620 px)
```

The 28-sample Howells directory remains below the map. Wording states that locations are approximate and are not population boundaries.

The frontend navigation now explicitly removes any earlier Help/map positions from workflow metadata and appends:

```text
Help
Reference Group World Map
```

## Analysis Options layout

At 1400 pixels and wider:

```text
Core Analysis:    compact column
Stature Options:  dominant center column
Exclude IDs:      compact column
```

At 761–1399 pixels, Core Analysis and Exclude IDs occupy the compact two-column row while Stature Options spans the full row.

Stature units has a 190-pixel minimum width, and the Inches/Centimeters control uses proportioned buttons so it no longer overlaps Stature group.

The sentence below the Extended Results display heading has been removed:

```text
Choose which diagnostic sections appear in Extended Results.
```

## Logo home/reset behavior

The upper-left FORDISC brand is now a keyboard-accessible button. It clears the current workspace, including measurements, selected groups/variables, case ID, results, errors, notes, Run Log, import state, and current analysis settings.

Default destinations:

```text
Full access:     Start / Case Setup
Student:         Measurement Entry
Fordisc Free:    Results, ready to choose and run a Module Test Case
```

The control does not sign the user out or change their subscription.

## Locked behavior

Do not reopen without a concrete blocker:

- accepted no-Stepwise calculations;
- Forward Mean, Forward Minimum, Forward Wilks, and Forward Kappa;
- Stepwise ordering, fixed cohorts, thresholds, ties, Turbo behavior, and final queries;
- Measurement Checks and GS/CC importance;
- ranked typicality and reference-outlier diagnostics;
- classification matrices, distances, posterior probabilities, and all typicality probabilities;
- canonical calculations and eigenvalues;
- stature equations, estimates, and ranking;
- all reference datasets;
- exact Howells one-case-deletion optimization;
- 900-second fallback timeout and structured HTTP 504 response;
- TouchNet purchase routing and 24-hour credential notice;
- support address `fordisc.support@gmail.com`;
- 10-user Institution language;
- manual TouchNet-to-Clerk entitlements;
- invitation-only signup;
- Student eligibility and capability restrictions;
- display-only metric stature conversion;
- wide-table containment without a visible notice;
- Results-formatted Run Log PDF and schema-4 saved cases.

## Validation completed in the artifact environment

Passed:

- Python compilation.
- Frontend TypeScript/TSX syntax transpilation.
- Semantic TypeScript check using dependency stubs.
- v1.0.15.1 static release validator.
- Health/Help/workflow identity checks.
- Anonymous-Free exact-route authorization tests.
- Anonymous Free response reduction for all three modules under stubbed analytical execution.
- Public-demo cache, disable switch, rate limit, and concurrency limit tests.
- Structured R timeout test.
- Manual TouchNet entitlement regression.
- Stature display-unit regression.
- Exact one-case-deletion numerical equivalence.
- Browser layout harness at 1440 × 1000 and 1366 × 900.
- Locked file hashes.
- Archive integrity, mini-patch/full parity, and clean-base patch reproduction.

Rscript, Docker, and a fresh npm dependency installation were unavailable in the artifact environment. The final production Docker/Vite/R validation remains deployment-side.

## Deployment procedure

For Render:

```text
Manual Deploy → Clear build cache & deploy
```

Then verify `/health` before testing the application.

## Focused acceptance after deployment

1. Open the signed-out landing page and select **Try Fordisc Free**.
2. Confirm the `/try` workspace opens with no account or sign-in.
3. Run the FDB, Howells, and Postcranial Module Test Cases.
4. Confirm anonymous Free shows only Results and Graphs.
5. Confirm Measurement Entry, Options, Extended Results, Help, map, cases, notes, and reports are unavailable anonymously.
6. Sign in with full access and inspect Reference Group World Map after Help.
7. Confirm the map is Howells-only and fits the screen.
8. Inspect Analysis Options at the production desktop width and confirm no stature overlap.
9. Enter or load analysis data, select the FORDISC logo, and confirm the workspace resets.
10. Run the locked FA008-09 no-Stepwise and Stepwise regressions.
11. Run the 65-group Howells LOOCV fixture.
12. Confirm TouchNet, manual entitlements, metric stature, saved cases, reports, and Run Log PDF remain correct.

## Next phase

Once v1.0.15.1 passes live acceptance, begin the first technical deployment to `fordisc.com` using a Clerk Production instance while preserving the current Development instance and Render service as staging.
