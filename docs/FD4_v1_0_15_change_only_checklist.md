# FORDISC 4.0 v1.0.15 Change-Only Checklist

## Release scope

v1.0.15 is the first production-transition build based directly on the user-accepted and locked v1.0.14.1 package. It prepares an invitation-only launch while preserving the analytical engine, reference data, accepted diagnostic behavior, performance optimization, report/Run Log behavior, and all unrelated interface behavior.

This build changes only:

1. TouchNet storefront routing and purchase messaging.
2. Temporary subscription/eligibility support contact.
3. Fordisc Institution named-user wording.
4. Student postcranial checkbox sizing.
5. Manual TouchNet-to-Clerk entitlement support for the invitation-only transition.
6. Retirement of the expanded Reference Group Selection tab and addition of an informational Reference Group World Map after Help.
7. Display-only Inches/Centimeters stature units.
8. Removal of the visible large-table explanatory banner while retaining automatic table containment.
9. Current Help, release identity, Terms draft, provisioning guide, and release validation material required by those changes.

## Release identity

- [x] Public version advanced to `1.0.15`.
- [x] Frontend package version advanced to `1.0.15`.
- [x] Health scaffold advanced to `react_typescript_v1_0_15_touchnet_reference_map_metric_units`.
- [x] Active Help source advanced to `fd4_help_living_draft_v1_0_15.md`.
- [x] Workflow screen metadata remains 9 screens.
- [x] Engine version remains `fordisc4_r_engine_v0_14`.
- [x] R-bridge safety ceiling remains 900 seconds.
- [x] Case schema remains version 4.

## TouchNet purchase transition

- [x] Opening-page plan cards are informational and contain no plan-specific purchase buttons.
- [x] Signed-in Plans-page cards are informational and contain no plan-specific purchase buttons.
- [x] Opening page contains one **Purchase Access Through UTK** button.
- [x] Plans page contains one **Purchase Access Through UTK** button.
- [x] Both buttons open the configured UTK TouchNet storefront in a separate browser tab.
- [x] Default storefront URL is:
  `https://secure.touchnet.com/C21610_ustores/web/store_main.jsp?STOREID=15&SINGLESTORE=true`
- [x] Clerk Billing is disabled in the packaged Render and Compose configuration.
- [x] Public registration remains disabled/invitation-only.
- [x] Both purchase panels state that the FORDISC username and password are supplied by email.
- [x] Both purchase panels state that account setup may take up to 24 hours.

## Plans and support messaging

- [x] Subscription and eligibility support address is `fordisc.support@gmail.com`.
- [x] The support address is configurable through `VITE_FD4_SUPPORT_EMAIL`.
- [x] Fordisc Pro retains the accepted concise description.
- [x] Fordisc Institution states that 10 named users are included.
- [x] Fordisc Institution states that additional named users may be added and that price is TBD.
- [x] Institution wording appears on the opening page and Plans page.
- [x] Plan cards remain equal height on both pages.

## Student postcranial checkbox

- [x] The broad Student stature input rule explicitly excludes checkbox inputs.
- [x] **Include records with missing birth year** uses an 18 × 18 pixel checkbox.
- [x] The checkbox remains aligned with its label and retains the accepted checked default.
- [x] No stature calculation or payload default changed.

## Manual TouchNet-to-Clerk entitlements

- [x] Manual paid entitlements are read only from Clerk private metadata.
- [x] Individual scope accepts `student` or `pro` only.
- [x] Organization scope accepts `institution` only.
- [x] Manual paid access requires `status: active`.
- [x] Manual paid access requires an explicit future `valid_until` date.
- [x] Future `valid_from` dates do not grant early access.
- [x] Expired, revoked, refunded, suspended, malformed, or wrong-scope records do not grant paid access.
- [x] Student manual access still requires a verified qualifying institutional email.
- [x] Institution access is evaluated on the active Clerk Organization.
- [x] Institution `seat_limit` is included in the sanitized authorization summary.
- [x] TouchNet order-reference content is never returned to the browser; only `reference_present` is exposed.
- [x] Existing Clerk Billing claims remain available as an inactive compatibility path.
- [x] Existing explicit beta/admin overrides remain available for authorized use.
- [x] Plans page displays the active manual entitlement expiration date when available.
- [x] Manual fulfillment instructions are included in `FD4_TOUCHNET_MANUAL_PROVISIONING_v1_0_15.md`.

## Reference Group World Map

- [x] Expanded `Reference Group Selection` is removed from active backend, frontend, and capability metadata.
- [x] Group selection remains in the compact Reference Groups panel above Measurement Entry.
- [x] Result error/navigation actions return users to Measurement Entry for group changes.
- [x] Full-access navigation adds **Reference Group World Map** after Help.
- [x] Student and Free screen sets remain unchanged and do not expose the map tab.
- [x] The map uses the Howells population map reproduced from the FORDISC 3 Help file.
- [x] Seven approximate FDB source-area markers are overlaid.
- [x] The FDB directory covers all 13 current FDB group codes.
- [x] The Howells/UTK directory covers all 65 selectable current Howells-module group codes.
- [x] Marker and directory controls are keyboard-accessible.
- [x] The map includes a clear approximation/professional-interpretation caution.
- [x] The map is informational and has no effect on selected groups or analytical requests.

## Stature units

- [x] Options adds a **Stature units** toggle with **Inches** and **Centimeters**.
- [x] Inches remains the default for continuity with FORDISC 3.
- [x] Fordisc Student receives the same toggle in Postcranial stature settings because Student does not have the Options tab.
- [x] Conversion is display-only and uses exactly `1 inch = 2.54 centimeters`.
- [x] The R request, equation selection, ranking, analytical result, and staleness signature are unchanged by the display selection.
- [x] Best estimate, prediction limits, and prediction-interval width use the selected display units.
- [x] Top and extended stature tables label converted columns with `in` or `cm`.
- [x] Stature equation slope and intercept are converted consistently for centimeter display.
- [x] Bone-measurement `Value`, sample size, and R-square remain in their original/non-unit values.
- [x] Stature graphs relabel and convert their displayed axes, intervals, lines, points, and case values.
- [x] Current analysis HTML/PDF reports record and use the selected display units.
- [x] Run Log entries preserve the display units used when each run was recorded.
- [x] Run Log PDF uses the stored unit preference for each run.
- [x] Saved schema-4 cases preserve the stature display-unit preference.
- [x] Older case files and older Run Log entries default safely to inches.

## Large-group table presentation

- [x] The accepted more-than-12-group threshold remains unchanged.
- [x] Results and Extended Results continue to use contained horizontal scrolling.
- [x] Wide tables remain inside the white screen-card/page border.
- [x] The first table column remains sticky during horizontal review.
- [x] Default presentation for 12 or fewer groups remains unchanged.
- [x] The separate visible large-table explanatory banner and its translation keys are removed.
- [x] Run Log and report page-width behavior from v1.0.14.1 remains unchanged.

## Terms and Help

- [x] Modern web/subscription Terms draft included in editable DOCX and source-Markdown formats.
- [x] Both Terms formats are prominently marked **not approved, not effective, and not for public posting**.
- [x] Terms address accounts, plans, named institutional users, TouchNet, activation, expiration, scientific responsibility, user data, security, intellectual property, disclaimers, suspension, and institutional/legal placeholders.
- [x] Current Help documents the TouchNet purchase path and 24-hour activation window.
- [x] Current Help documents 10 included Institution users and temporary support contact.
- [x] Current Help documents the retired expanded group-selection tab and new map.
- [x] Current Help documents stature display units and the exact conversion.
- [x] Current Help describes automatic large-table containment without displaying a separate notice.
- [x] Current Help revision notes remain blank.

## Locked behavior preserved

- [x] No-Stepwise analytical behavior remains unchanged.
- [x] Forward Mean, Forward Minimum, Forward Wilks, and Forward Kappa remain unchanged.
- [x] Stepwise candidate order, fixed cohort, thresholds, ties, Turbo behavior, and final query remain unchanged.
- [x] Measurement Checks, GS/CC importance, ranked typicality, and reference-outlier behavior remain unchanged.
- [x] No reference outliers are automatically excluded.
- [x] Classification matrices, Mahalanobis distances, posterior probabilities, typicality probabilities, and canonical calculations remain unchanged.
- [x] Stature equations and analytical results remain unchanged; only display units were added.
- [x] v1.0.13.2 Howells performance optimization remains unchanged.
- [x] Structured HTTP 504 timeout behavior and 900-second fallback remain unchanged.
- [x] v1.0.14.1 Results/Extended table containment and Run Log PDF remain unchanged except for removal of the visible explanatory banner and addition of display-unit labeling.
- [x] R analytical engine, R bridge, and reference datasets are byte-for-byte unchanged from accepted v1.0.14.1.

## Artifact-environment validation

- [x] Python `compileall` passed for `app` and `scripts`.
- [x] `scripts/validate_v1_0_15_static.py` passed.
- [x] `scripts/validate_v1_0_15_metadata.py` passed.
- [x] `scripts/validate_manual_touchnet_entitlements.py` passed.
- [x] `scripts/validate_stature_display_units.py` passed.
- [x] Structured timeout validation passed.
- [x] Exact one-case-deletion numerical equivalence validation passed.
- [x] Frontend TypeScript/TSX syntax transpilation passed for all nine active source files.
- [x] Frontend semantic TypeScript checking with dependency stubs passed.
- [x] Browser layout validation confirmed four equal-height plan cards and one TouchNet button.
- [x] Browser layout validation confirmed the Student checkbox renders 18 × 18 pixels.
- [x] Browser layout validation confirmed the map image loads and all seven FDB markers render.
- [x] Browser layout validation confirmed the stature-unit selector and centimeter-labeled table presentation.
- [x] Synthetic 65-group browser validation confirmed contained horizontal scrolling without a visible explanatory banner or page-level overflow.
- [x] Locked analytical/reference files were compared byte-for-byte with accepted v1.0.14.1.
- [x] No temporary browser previews, caches, `node_modules`, or frontend build directories are included in release archives.

## Deployment and live acceptance

- [ ] Commit the complete package contents or apply the mini-patch to a clean accepted v1.0.14.1 repository.
- [ ] In Render, choose **Manual Deploy -> Clear build cache & deploy**.
- [ ] Confirm `/health` reports:
  - `wrapper_version: 1.0.15`
  - `frontend_scaffold: react_typescript_v1_0_15_touchnet_reference_map_metric_units`
  - `workflow_screens_loaded: 9`
  - `engine_version: fordisc4_r_engine_v0_14`
  - `r_bridge_timeout_seconds: 900`
- [ ] Confirm opening and Plans pages each show one TouchNet button and no plan-specific purchase buttons.
- [ ] Confirm the TouchNet button opens the UTK store.
- [ ] Confirm the 24-hour credential notice, 10-user Institution wording, and temporary support email.
- [ ] Confirm the Student postcranial missing-birth-year checkbox is proportional.
- [ ] Confirm Reference Group World Map appears after Help and the map/image directories load.
- [ ] Confirm the compact Reference Groups panel still controls analytical selection.
- [ ] Run a postcranial stature analysis; switch between Inches and Centimeters on Results, Extended Results, Graphs, and Report.
- [ ] Confirm 70.0 inches displays as 177.8 centimeters and returns to 70.0 inches without rerunning.
- [ ] Save/reopen the case and confirm the display-unit preference persists.
- [ ] Record at least two stature runs with different display units and confirm the Run Log/Run Log PDF preserves each run’s units.
- [ ] Run an all-groups Howells analysis and confirm tables remain contained with horizontal scrolling and no explanatory banner.
- [ ] Run the locked FA008-09 no-Stepwise and Stepwise regressions.
- [ ] Confirm the v1.0.13.1 diagnostic targets remain exact.
- [ ] Confirm the all-group Howells LOOCV fixture still corresponds to FD3 and completes normally.
- [ ] Test manual Student, Pro, Institution, expiration, and revocation metadata in the Clerk Development environment before Production provisioning.

## Rollback note

The accepted v1.0.14.1 package is the direct rollback target. v1.0.15 does not change the analytical response contract or case schema. Schema-4 case files remain compatible; older files default to inches if the new display preference is absent. A rollback removes TouchNet/manual-entitlement production-transition behavior, the map tab, and metric display while restoring the v1.0.14.1 storefront and visible large-table banner.
