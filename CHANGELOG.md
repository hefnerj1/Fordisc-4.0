# Public Release Notes

This changelog summarizes public, user-facing changes. Internal development history, source changes, validation fixtures, and deployment details remain in the private FORDISC application repository.

## 4.0.13 — Current public release

- Standardized practitioner-facing terminology: exactly two retained groups use discriminant function analysis (DFA), while three or more use canonical variate analysis (CVA).
- Limited DF Weights to two-group analyses and aligned their displayed scale and orientation with FORDISC 3; classification results and decision statistics are unchanged.
- Added Standard, Soft Midnight, and Color-Vision Accessible viewing modes, with redundant marker, line, and hatch cues where appropriate.
- Restored Ousley purple as a focused Soft Midnight brand accent while retaining the accepted dark viewing surfaces.
- Restored measurement mouseovers containing each abbreviation, full measurement name, valid range, and units while preserving assistive-technology descriptions.
- Replaced ambiguous reference-data warnings with an informational **Reference data availability** advisory that states that no measurements or groups are changed automatically.
- Completed FORDISC-branded invitation, activation, verification, and password-recovery email validation with tested `.edu`, `.mil`, and `.com` accounts.

## 4.0.12 — International Crania production integration

- Added International Crania as an independent cranial analysis module for Fordisc Pro and Fordisc Institution.
- Added backward-compatible International module state to saved cases and International Crania as a fifth latest-successful-result lane in the Case Report.
- Added practitioner-facing International group names while retaining reference codes internally.
- Improved graph color differentiation with an extended Apricot-based palette shared across live, downloaded, Run Log, and Case Report graphics.
- Refined dendrogram labels, ternary-plot centering, and stature-report spacing.

## 4.0.11 — Case Report, accessibility, and production hardening

- Added a unified Case Report containing the latest successful FDB, Howells, Postcranial DFA, and Stature results, with graph snapshots where available.
- Improved accessibility, keyboard interaction, focus behavior, contrast, semantics, and report controls.
- Strengthened production security headers and reduced public diagnostic exposure.
- Consolidated Case Report export into one browser-based PDF workflow.

## 4.0.10 — Interface and Help refinements

- Refined Postcranial and Stature controls and preserved independent workflow state.
- Updated Help content and practitioner-facing terminology.

## 4.0.9 — Account and session controls

- Added one-active-session enforcement while continuing to permit multiple tabs within the same authenticated session.
- Added Institution account-management and named-user controls.

## 4.0.2 — Subscription provisioning and contributor acknowledgments

- Improved subscription recognition and provisioning diagnostics.
- Updated the approved contributor roster.

## 4.0.1 — Map and report presentation

- Refined the Howells Reference Group Map and practitioner-facing version presentation.

## FORDISC 4.0 — Initial web release

- Rebuilt FORDISC as a web application.
- Added modern Results, Extended Results, Graphs, reports, and Run Log workflows.
- Added anonymous Demo Cases through Fordisc Demo.
- Added Student, Pro, and Institution packages.
