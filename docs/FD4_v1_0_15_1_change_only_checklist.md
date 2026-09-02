# FORDISC 4.0 v1.0.15.1 Change-Only Checklist

## Release purpose

v1.0.15.1 is a narrow predeployment patch built directly on the accepted v1.0.15 package. It adds a genuinely usable no-sign-in Fordisc Free experience and completes the interface refinements requested after the first v1.0.15 deployment review. All analytical calculations, reference data, TouchNet purchasing behavior, manual Clerk entitlements, metric stature display, Run Log PDF, large-group table containment, and unrelated v1.0.15 behavior remain locked.

## Release identity

- [x] Public version advanced to `1.0.15.1`.
- [x] Frontend package version advanced to `1.0.15.1`.
- [x] Health scaffold is `react_typescript_v1_0_15_1_public_free_ui_polish`.
- [x] Active Help source is `fd4_help_living_draft_v1_0_15_1.md`.
- [x] Reports display only `1.0.15.1`.
- [x] Workflow screen count remains 9.
- [x] R-bridge timeout remains 900 seconds.

## No-sign-in Fordisc Free

- [x] Signed-out landing page includes a prominent **Try Fordisc Free** action.
- [x] The public Free workspace opens at `/try` without waiting for or requiring Clerk sign-in.
- [x] Anonymous Free provides the three supported modules: FDB, Howells, and Postcranial.
- [x] Anonymous Free displays only Results and Graphs.
- [x] Anonymous Free runs only locked, server-owned Module Test Cases.
- [x] Browser requests send only a supported module identifier; measurements, groups, variables, and options remain server controlled.
- [x] Anonymous Free does not provide measurement entry, arbitrary analysis, case files, Analysis Options, Extended Results, reports, exports, Notes / Run Log, imports, in-app Help, or the Reference Group World Map.
- [x] The backend accepts the anonymous marker only for `/metadata/modules` and `/analyze/module-test-case`.
- [x] Adding the marker to other metadata, Help, or analysis routes does not grant access.
- [x] Completed Module Test Case responses may be cached in memory to avoid repeated R calculations.
- [x] Public-demo rate and concurrency boundaries are configurable by environment variable.
- [x] Friendly HTTP 429 responses are returned when the temporary public-demo rate or concurrency limit is reached.
- [x] Public Free can be disabled through environment configuration without a code change.

## Reference Group World Map

- [x] All FDB markers, marker legend, selection panel, and FDB location directory have been removed from the rendered map screen.
- [x] The screen now presents only the 28 Howells samples documented in the FORDISC 3 Help file.
- [x] The original Howells map image remains the source map.
- [x] Map width is constrained to the available panel width and a 980-pixel maximum.
- [x] Map height is constrained to the smaller of 62% of the viewport height or 620 pixels on desktop.
- [x] Aspect ratio is preserved with `object-fit: contain`.
- [x] The Howells group directory remains below the map.
- [x] Map wording states that locations are approximate and are not biological, social, or population boundaries.
- [x] Backend workflow metadata now describes a Howells-only informational map.
- [x] Frontend navigation explicitly removes any earlier map position and appends Help followed by Reference Group World Map.

## Analysis Options layout

- [x] Stature Options receives the dominant column on screens at least 1400 pixels wide.
- [x] Core Analysis and Exclude IDs receive narrower columns on wide desktop screens.
- [x] At intermediate desktop widths, Stature Options spans the full row while Core Analysis and Exclude IDs remain compact.
- [x] The Stature unit control has a dedicated minimum width.
- [x] Inches and Centimeters buttons use proportional internal widths and do not overlap Stature group.
- [x] The stature-unit explanation is shortened to `Display only; calculations are unchanged.`
- [x] The sentence `Choose which diagnostic sections appear in Extended Results.` is removed.
- [x] The prominent Check for measurement error control is preserved.

## FORDISC logo home/reset control

- [x] The upper-left FORDISC brand area is a semantic button.
- [x] It is keyboard accessible and has a visible focus state.
- [x] It has the accessible label `Clear the current analysis and return to the Fordisc home screen`.
- [x] Selecting it clears case values, selections, results, errors, notes, Run Log, imports, and current analysis state.
- [x] Full access returns to Start / Case Setup.
- [x] Student returns to Measurement Entry.
- [x] Fordisc Free returns to Results with a blank test-case workspace.

## Preserved v1.0.15 behavior

- [x] TouchNet is still the only visible purchase path.
- [x] Support address is `fordisc.support@gmail.com`.
- [x] Institution language remains 10 named users, with additional-user price TBD.
- [x] Manual TouchNet-to-Clerk Student, Pro, and Institution entitlements remain unchanged.
- [x] Invitation-only signup remains configured.
- [x] Student email eligibility remains unchanged.
- [x] Student postcranial checkbox remains proportional.
- [x] Inches/Centimeters remains a display-only stature preference using exactly `1 inch = 2.54 centimeters`.
- [x] Large-group table containment and horizontal scrolling remain active without a visible explanatory banner.
- [x] Run Log schema 4 and Results-formatted Run Log PDF remain unchanged.
- [x] Saved-case compatibility remains unchanged.

## Locked analytical behavior

- [x] No-Stepwise behavior is unchanged.
- [x] Forward Mean, Forward Minimum, Forward Wilks, and Forward Kappa are unchanged.
- [x] Stepwise candidate ordering, fixed complete-case cohort, thresholds, tie handling, Turbo behavior, and final query are unchanged.
- [x] Measurement Checks and GS/CC importance are unchanged.
- [x] Ranked typicality and reference-outlier diagnostics are unchanged.
- [x] Classification matrices, distances, posterior probabilities, and typicality probabilities are unchanged.
- [x] Canonical calculations and eigenvalues are unchanged.
- [x] Stature equations, estimates, rankings, and analytical values are unchanged.
- [x] Howells exact one-case-deletion optimization remains unchanged.
- [x] No reference outliers are automatically excluded.

## Static and in-process validation

- [x] Python compilation passed.
- [x] TypeScript/TSX isolated syntax transpilation passed for all frontend source files.
- [x] Semantic TypeScript checking passed using temporary dependency stubs in the artifact environment.
- [x] v1.0.15.1 static release validation passed.
- [x] Health, Help, workflow, and anonymous-Free endpoint validation passed in-process.
- [x] Anonymous access without the marker was rejected.
- [x] Anonymous access to arbitrary analysis and subscription-only endpoints was rejected.
- [x] All three server-owned Module Test Cases returned the Free response envelope under stubbed R execution.
- [x] Module Test Case caching was verified.
- [x] Public-demo rate and concurrency responses were verified.
- [x] Structured R-bridge timeout handling returned HTTP 504.
- [x] Manual TouchNet entitlement regression passed.
- [x] Stature display-unit regression passed.
- [x] Exact one-case-deletion numerical equivalence passed.

## Browser layout validation

- [x] Desktop harness rendered at 1440 × 1000 without document-level horizontal overflow.
- [x] Desktop harness rendered at 1366 × 900 without document-level horizontal overflow.
- [x] No FDB markers or FDB legend appeared.
- [x] Howells map remained contained and centered.
- [x] Wide-desktop Stature Options was more than 2.4 times the width of each compact neighboring panel in the validation harness.
- [x] Stature units and Stature group did not overlap.
- [x] Public Free action and logo home control rendered with their intended styling.

## Archive validation

- [x] Complete Docker-ready package contains 282 source files.
- [x] Mini-patch contains 25 files and targets a clean accepted v1.0.15 source tree.
- [x] Both ZIP archives passed CRC and integrity testing.
- [x] Every mini-patch file is byte-for-byte identical to its complete-package counterpart.
- [x] Applying the mini-patch to a clean accepted v1.0.15 tree reproduced the complete v1.0.15.1 package exactly.

## Locked-file hashes

- [x] `engine/fordisc4_r_engine_v0_14/R/lda_engine.R` remains `fe3a6ee0f23cdba4ebd1eb22a774e24f8d5c9e3557eaa1a0d111874b1a62b83f`.
- [x] `engine/fordisc4_r_engine_v0_14/R/utils.R` remains `015fedab4068cb9e6d8d971fa44403a1dbc3e6a9ede7fba4b61ad3a4ad0c5851`.
- [x] `r_bridge/run_engine.R` remains `ca7e170341487dc73c9e1de0071cb0f669501d6aaeb993ea185cbf079eccd383`.
- [x] Principal cranial, postcranial, stature, and range reference files retain the accepted hashes listed in the checksum manifest.

## Deployment-side acceptance

- [ ] Deploy with **Clear build cache & deploy**.
- [ ] Confirm `/health` reports v1.0.15.1 and the expected scaffold.
- [ ] Confirm **Try Fordisc Free** opens without sign-in.
- [ ] Run the FDB, Howells, and Postcranial public Module Test Cases.
- [ ] Confirm only Results and Graphs are available in anonymous Free.
- [ ] Confirm the Howells-only map is contained at the production browser size.
- [ ] Confirm the Options-page overlap is gone.
- [ ] Confirm the logo clears the workspace and returns to the tier-appropriate default.
- [ ] Run the locked FA008-09 regression and all-groups Howells LOOCV fixture.
- [ ] Confirm TouchNet purchase, Clerk sign-in, manual entitlements, reports, Run Log PDF, and saved cases remain correct.

## Rollback

The accepted v1.0.15 full package is the direct rollback target. v1.0.15.1 changes no case schema or analytical response contract. Rolling back removes no saved analytical data; it removes anonymous no-sign-in Free and restores the earlier map, Options proportions, and non-clickable brand behavior.
