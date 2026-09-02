# FORDISC 4.0 Help File - Living Draft v1.0.15.1

This is the current practitioner-facing help for FORDISC 4.0. It updates the scientific and workflow guidance from FORDISC 3 for the web-based, case-based FD4 application. FORDISC 3 measurement terminology and statistical concepts are retained where they remain applicable; instructions that depended on installing a Windows program, local Advantage tables, or the FD3 update server have been replaced with the current FD4 workflow.

## 1. What FORDISC does

FORDISC is an interactive analytical program for comparing an unknown case with selected reference samples using cranial and postcranial measurements. Current modules are:

- **FDB** - forensic cranial discriminant-function analysis using the Forensic Data Bank-style cranial groups.
- **Howells** - cranial analysis using Howells groups and the supported UTK comparison groups.
- **Postcranial** - postcranial discriminant-function analysis and stature estimation from one shared postcranial case record.

FORDISC reports statistical similarity to the selected reference groups. A classification is not, by itself, an identification. Interpretation depends on measurement quality, selected measurements, selected groups, sample sizes, missing data, reference outliers, classification accuracy, posterior probabilities, typicality probabilities, and the biological and forensic context of the case.

## 2. Accounts and access levels

Paid and invited access uses individual Clerk accounts for sign-in. Institutional memberships use named members in a Clerk Organization. The initial production release is invitation-only.

- **Fordisc Free** may be opened from the signed-out landing page by selecting **Try Fordisc Free**. No sign-in or account is required. It can run locked, server-controlled module test cases and view Results and Graphs. It does not provide measurement entry, arbitrary analysis, case storage, imports, Analysis Options, Extended Results, Help, reports, or the Reference Group World Map.
- **Fordisc Student** provides FDB and Postcranial Measurement Entry, Results, and Graphs for eligible verified students.
- **Fordisc Pro** provides full individual access.
- **Fordisc Institution** provides full access to 10 named users in an active institutional Organization. Additional named users may be added; pricing is to be determined.
- Approved beta testers and administrators may receive full access through explicit account metadata.

The signed-out opening page also provides a separate **Try Fordisc Free** button for the no-account demonstration. The opening and Plans pages show one **Purchase Access Through UTK** button. It opens the University of Tennessee TouchNet store. After a completed order is verified, the FORDISC username and password are supplied by email; account setup may take up to 24 hours. During the invitation-only launch, an administrator provisions the corresponding Student, Pro, or Institution entitlement in Clerk.

Do not share an individual account or sign-in credentials. The draft web Terms and Conditions remain subject to University of Tennessee review and approval.

## 3. Start screen, contributors, and language

The opening screen recognizes the creators of FORDISC, Richard L. Jantz and Stephen D. Ousley, and the generations of students, researchers, data collectors, developers, testers, translators, and practitioners who have contributed to the program.

Choose **About FORDISC / Contributors** to open the contributor-history panel. Choose **Begin FORDISC** to enter the application. Within the application, the FORDISC logo in the upper-left corner acts as a home control: selecting it clears the current workspace and returns to the tier-appropriate default screen.

The language selector changes the supported user-interface labels between English and Spanish. Measurement abbreviations, group abbreviations, statistical abbreviations, numeric results, case IDs, and user-entered case information are not translated.

## 4. Case-based workflow

One FD4 case can contain cranial and postcranial information. FDB, Howells, and Postcranial retain independent measurement-use and group-selection states within the same case.

The recommended sequence is:

1. Start a new case or open a saved case.
2. Enter measurements.
3. Select the measurements to use.
4. Select appropriate reference groups.
5. Review Analysis Options.
6. Run the analysis.
7. Review Results, Extended Results, and Graphs.
8. Record interpretation in Notes / Run Log.
9. Export the current analysis report or the complete Run Log PDF needed for documentation.

### Case ID

The Case ID appears in the interface and exported reports. A concise identifier is recommended. Do not place unnecessary personally identifying information in the Case ID.

### New case

**New case** clears the active working case and opens the FDB module. Unsaved measurements, selections, notes, and results are lost.

### Save current case

**Save current case** downloads a schema-version-4 `.fd4case` file. The saved file includes the Case ID, Case Notes, entered cranial and postcranial measurements, independent module states, stature display-unit preference, and the chronological Run Log. Each new Run Log entry preserves the full Results-page information and the inches/centimeters setting shown for that completed analysis. Export a finalized report separately when an immutable reporting record is required.

### Open saved case

**Open saved case** restores a `.fd4case` file and opens the FDB module. Cranial and postcranial data remain available, and each module's saved variable and group selections are retained.

### Open FD3 Case

**Open FD3 Case** is for a legacy individual case, not a custom reference dataset. Supported first-pass inputs include compatible FD3-shaped ADT, DBF, CSV, and TXT files. FD4 previews the restored Case ID, measurements, groups, comments when readable, and suggested module before applying the case.

Some legacy Advantage memo companions cannot be recovered automatically. Numeric memo pointers, binary-looking data, or unreadable memo artifacts are not placed into Case Notes.

### Open Module Test Case

The module test cases demonstrate the workflow and support release validation. They are not interpretive standards for unknown remains.

## 5. Measurement Entry

Measurement Entry uses abbreviation-first cards. The field label identifies the measurement code; the supporting label and acceptable range help with entry and review.

FDB, Howells, and Postcranial show a compact **Reference Groups** panel above Measurement Entry. All group selection is completed in that panel; the former expanded Reference Group Selection tab has been retired.

Measurements shared by FDB and Howells use one cranial case record. Entering a shared cranial value in one module makes it available in the other. Postcranial values are stored in the same overall case but are analyzed independently.

### Use all with Classify Case on

When **Classify Case** is checked, **Use all** selects all entered, eligible, non-calculated measurements. Blank measurements remain unselected so they do not produce case-input errors.

### Use all with Classify Case off

When **Classify Case** is unchecked, FD4 performs a group-only analysis. In this mode, **Use all** selects all available eligible non-calculated measurements, even when the case fields are blank. No unknown case is classified and no case marker is shown on the graph.

### Use none and Clear data

**Use none** clears measurement-use selections without erasing entered values. **Clear data** erases the module's entered values; use it carefully.

### Calculated cranial values

FD4 displays supported calculated cranial angles and related auxiliary values as read-only fields. In the standard FDB workflow, calculated and auxiliary variables are not automatically included in the default candidate pool.

## 6. Measurement range checking

When **Check for measurement error** is on, entered values are checked against the current FORDISC measurement ranges. The control is displayed prominently at the top of the **Core analysis** panel on the Options page and includes an explicit **On/Off** status. An out-of-range value may indicate a typographical error, a measurement problem, unusual preservation, pathology, deformation, trauma, or genuine biological variation.

An out-of-range warning does not prove that the value is wrong. Verify the landmark, technique, units, and data entry. If the value is valid but inappropriate for population-affinity analysis because it is affected by pathology, trauma, treatment, or taphonomy, exclude that measurement from the analysis and document the reason.

When measurement checking is intentionally bypassed, that setting is recorded in reports.

## 7. Measurement Checks symbols, colors, and importance columns

The Measurement Checks table follows the FD3 diagnostic rules. Each current-case value is compared separately with **every selected group's own mean and standard deviation**. FD4 does not average the group means or standard deviations to create the check symbol. A sign is added only when the case crosses the same boundary for all selected groups; the original FD3 0.1-unit tolerance is retained.

- **+ or -** - the case value is higher or lower than all selected group means.
- **++ or --** - approximately one to two group standard deviations from all selected group means.
- **+++ or ---** - approximately two to three group standard deviations from all selected group means.
- **++++ or ----** - at least three group standard deviations from all selected group means.

FD3's strong-deviation color convention is retained:

- Values at least two standard deviations **high** are shown in bold blue.
- Values at least two standard deviations **low** are shown in bold red.

The plus/minus symbols remain visible so color is not the only cue. A colored value is an instruction to review the measurement, not an automatic declaration that it is erroneous.

The importance columns also use FD3 formulas:

- **GS Imp % / Relative Group Importance** describes how strongly a measurement contributes to separation among the selected reference groups. For a two-group analysis it is based on the absolute product of the group-mean difference and discriminant-function weight. For a multigroup analysis it is based on squared canonical structure coefficients weighted by the corresponding displayed canonical eigenvalues. Values are normalized to total 100%.
- **CC Imp % / Relative Case Importance** describes how strongly a measurement contributes to the current case's pattern of separation from the selected groups. FD3 combines the measurement's group-separation importance with the difference between the case's maximum and mean absolute distances from the selected group means, then normalizes the values to total 100%.

Importance percentages are descriptive diagnostics. They do not independently establish that a measurement is biologically decisive, valid, or erroneous.

## 8. Reference coverage and sample-size advisories

A measurement may be valid but sparsely recorded in one or more selected reference groups. Before standard FDB or Howells analysis, FD4 removes selected variables that do not have more than eight complete reference rows in every selected group. Removed variables are listed in Results and reports.

MOW, UFBR, FOB, and other less-complete variables may reduce usable sample sizes depending on the selected groups. Expand the coverage details to see the effect of individual variables.

FD4 may display a non-blocking sample-size advisory when the number of measurements is high relative to the smallest complete reference group. Review the cross-validated classification accuracy, determinant and covariance diagnostics, reference outliers, and case typicalities. Consider fewer measurements or a documented Stepwise analysis when appropriate.

The advisory does not automatically change the analysis.

## 9. Reference groups and world map

Reference groups define the comparison question. Begin with scientifically appropriate candidate groups; do not include or remove groups solely to force a preferred classification. Group selection is performed in the compact **Reference Groups** panel above Measurement Entry.

Common shortcuts include:

- **All Females**
- **All Males**
- **All Available Groups**
- **Clear groups**

### Reference Group World Map

The **Reference Group World Map** tab appears after Help for full-access users. It reproduces the Howells location map from the FORDISC 3 Help file and lists the current FD4 Howells sample codes and documented source areas. The map is sized to remain contained within the ordinary application screen.

The current map intentionally represents only the Howells populations. FDB groups are not plotted because several FDB samples encompass broad or overlapping source regions rather than a single defensible map location. Map locations are geographic orientation only. They do not represent biological, social, or population boundaries and are not a substitute for a scientifically appropriate comparison question.

### FDB groups

FDB includes the currently supported forensic cranial groups. The group abbreviations in tables and reports use standard uppercase codes such as AF, AM, BF, BM, CHM, GTM, HF, HM, JF, JM, VM, WF, and WM.

### Howells groups

The Howells module includes the supported Howells samples plus the supported UTK comparison groups. Several measurements are not available in all Howells samples and may be removed before analysis.

### Postcranial groups

Postcranial DFA uses the supported postcranial reference groups. Stature reference selection is separate from postcranial DFA group selection.

## 10. Analysis Options

### Classify Case

When checked, FD4 classifies the current case using the entered selected measurements. When unchecked, FD4 compares the selected reference groups without classifying an unknown. Blank selected case measurements are allowed in group-only mode.

### Classification Rate Estimation

- **LOO (Jackknife; 1, N-1)** removes each reference individual in turn, recalculates the discriminant function, and classifies that omitted individual. It is the default and the preferred FD4 estimate of classification performance.
- **Resubstitution (N, N)** classifies each reference individual with a function that included that individual. It is generally optimistic and is mainly useful for comparison, diagnostics, and FD3-style Turbo selection.

### Classify only if Typ. F exceeds the threshold

DFA will classify any numeric case into one of the selected groups, even if the case is unlike every group. The classification safeguard withholds the displayed predicted group when all Typ. F values are at or below the configured threshold. Review the complete relationship table rather than relying on a high posterior probability when all typicalities are low.

### Transformations

- **None** uses the original measurements.
- **Log** uses natural-log transformed measurements, scaled for readable output.
- **Shape** uses Darroch-Mosimann-style shape variables derived from each individual's geometric mean.

Transformations apply to DFA. Stature estimation always uses the original entered measurements.

### Exclude IDs

Enter one reference ID per line to exclude specific reference individuals. Exclusions are reported in output. Excluding an outlier is an analytical decision; verify the record and rerun the analysis after exclusions.

### Outlier threshold

The displayed F-typicality threshold controls which reference individuals are flagged as outliers. FD4 detects and reports these records but does not automatically remove them. After Stepwise selection, reference-outlier diagnostics are calculated from the **variables actually retained and used in the final DFA**, matching the final reference sample and dimensionality rather than the larger original candidate-variable pool.

Outlier detection follows the selected classification-rate setting: leave-one-out diagnostics omit the reference individual being evaluated, while resubstitution diagnostics use the full fitted reference sample. Excluding a flagged individual remains a documented analytical decision; FD4 does not automate iterative removal.

## 11. Stepwise Variable Selection

Stepwise selection evaluates candidate subsets of the selected eligible measurements. It is useful when many measurements are available, when complete reference coverage is limited, or when a documented comparison of variable-selection methods is required. Stepwise output is not automatically superior to a carefully selected standard analysis.

At least four measurements must be selected before Stepwise can run.

### FD3-compatible selection cohort

FD4 v1.0.13 follows the FD3 selection-sample rule:

1. Candidate variables are ordered alphabetically, as in FD3.
2. The Stepwise selection cohort consists of reference individuals complete for **all original eligible candidate measurements**.
3. Every candidate subset is evaluated on that same fixed cohort. Competing candidates therefore do not gain or lose records simply because they contain different variables.
4. After the variables are selected, FD4 performs the final query using only the retained variables. Final group sample sizes may therefore be larger than the sample sizes used during variable selection.

This distinction is especially important for Forward Mean % and Forward Minimum %, where changing the candidate cohort can change the retained variables.

### Min, Max, and Step

- **Min** is the minimum number of variables in the initial combinations.
- **Max** is the maximum number retained.
- **Step** is the minimum improvement required before another variable is accepted.

A candidate must be strictly better than the incumbent and must meet the Step threshold. A tie does not replace the first-best candidate. A Step of zero forces the procedure toward Max using FD3-compatible behavior.

FD3 method defaults are:

- Forward Mean %: **0.005**
- Forward Minimum %: **0.005**
- Forward Wilks' Lambda: **0.002**
- Forward Cohen's Kappa: **0.001**

### Turbo

For percentage and Kappa methods, Turbo uses resubstitution during variable selection and then runs the final requested classification-rate estimate, normally LOO, with the retained variables. Turbo is faster but the selection criterion is based on the optimistic resubstitution results.

### Forward Mean %

Selects variables by mean group classification accuracy. Unweighted Mean gives each group equal influence; Weighted Mean gives larger groups more influence.

### Forward Minimum %

Selects variables to improve the lowest group classification percentage. It helps prevent a high overall rate from hiding very poor performance in one group.

### Forward Wilks' Lambda

Selects variables by reducing Wilks' Lambda, a multivariate within-group to total-variation criterion. Lower is better.

### Forward Cohen's Kappa

Selects variables by the configured FD3-style group Kappa criterion, which evaluates classification performance relative to prevalence/chance expectations.

### Recording Stepwise results

Reports and bench notes record the method, Min, Max, Step, Turbo setting, weighting, original candidate count, retained variables, and final classification result. Review both classification performance and case typicality.

## 12. Warnings, errors, and color legend

FD4 uses color as a secondary cue; important conditions also have text labels or symbols.

- **Pale yellow warning cards** - review is advised, but the analysis may still be valid.
- **Red error cards** - the requested operation could not proceed.
- **Pale yellow reference-outlier rows** - the reference individual has an explicit outlier flag; the text flag is authoritative.
- **Bold typicality values** - probability is at least 0.01 but below 0.05.
- **Bold red typicality values** - probability is below 0.01.
- **Blue/red Measurement Checks values** - strong high/low deviations as explained above.
- **Graph colors** - identify reference groups only. They do not indicate rank, confidence, or statistical significance.
- **Black case marker or X** - identifies the current case when a case is classified.

## 13. Results

Results are the primary practitioner-facing summary.

When an analysis contains more than 12 reference groups, Results tables remain inside the white page border and gain their own horizontal scrolling area. The first column remains visible while additional group columns are reviewed. This containment occurs automatically without adding a separate notice to the Results page, and the ordinary layout remains unchanged for smaller analyses.

### Warnings and Checks

Review all warnings before interpreting the classification. The panel records sparse measurements, measurements removed before DFA, range warnings, case-representation warnings, classification safeguards, and detected reference outliers. Pale-yellow highlighting is reserved for an actual reference-outlier warning or flagged reference-outlier row. An ordinary Analysis Options entry such as **Outlier threshold** is a setting and is not itself an outlier warning.

### Classification Summary

The summary identifies the predicted group when not withheld, posterior probability, displayed typicalities, ranked position, and classification accuracy.

### Classification Matrix

The matrix shows how the reference groups classify among themselves using counts or percentages. The total line reports the chosen rate-estimation method. More groups and more difficult comparisons normally reduce classification accuracy.

### Multigroup Classification

The relationship table lists each group, D-squared distance, posterior probability, Typ. F, Typ. chi-square, and Typ. R with rank when enabled.

### Posterior probability

Posterior probabilities are relative probabilities under the assumption that the unknown belongs to one of the selected groups. They sum to one and can change substantially when the comparison set changes. A high posterior probability does not rescue a classification when the case is atypical of every group.

### Typ. F

Typ. F uses the Hawkins/F distribution form implemented in FD3 and accounts for D-squared, group sample size, number of variables, total sample size, and number of groups.

### Typ. chi-square

Typ. chi-square is based on D-squared and the chi-square distribution. It does not include the finite group-sample adjustment used by Typ. F and is commonly lower.

### Typ. R

Typ. R ranks the case D-squared against leave-one-out own-group D-squared values. FD3's legacy insertion rule uses a strict-greater comparison and one baseline array position. In FD4 this is reproduced as one plus the number of reference distances less than or equal to the case distance, capped at the group sample size. The denominator is the group sample size plus one.

This convention preserves the FD3 endpoints. A case farther from a group than every reference individual is reported as **1/(n+1)** rather than zero; for example, a group with 194 reference individuals displays approximately **0.005 (194/195)**.

## 14. Extended Results

Extended Results provide supporting statistical tables, including available combinations of:

For analyses with more than 12 reference groups, Extended Results uses the same automatic table containment as Results. Large classification, group-summary, and Mahalanobis tables scroll within their panels instead of expanding beyond the page border, while every column and the default small-analysis presentation are preserved. The containment occurs automatically without changing the ordinary small-analysis view.

- Group means and standard deviations
- Pooled within-group variance-covariance matrix
- Group variance-covariance matrices
- Pooled correlation matrix
- VCVM determinant and trace summaries
- Kullback homogeneity test
- Eigenvalues and proportions of variation
- Canonical structure coefficients
- Mahalanobis distance and significance matrices
- Reference individual classifications
- Reference outlier flags
- Nearest discriminant neighbors
- Jackknifed VCVM output (calculated with an exact one-case deletion update)
- Stepwise selection log and selection-sample information
- All stature equations

The displayed multigroup eigenvalues use the FD3 equal-prior group-centroid normalization. The underlying MASS canonical F-statistics remain available to internal validation routines. The displayed percentages of total canonical variation are unchanged.

## 15. Graphs

Graphs are generated from the completed analysis and do not rerun the model.

### Two-group histogram

Two-group analysis displays a histogram of reference discriminant scores. The horizontal axis is **DF Score**. The vertical line at zero is the sectioning point. The current case is shown with an X when Classify Case is on. Group-only analyses show the histogram without the case marker. Bin width can be adjusted.

### Multigroup canonical plot

Analyses with three or more groups display canonical variate axes labeled CV1, CV2, CV3, and so on. Axis labels include the percentage of total canonical variation. Numerical ticks, grid lines, group centroids, reference points, ellipses, and the case marker support interpretation.

Canonical-axis sign is arbitrary: multiplying every score on an axis by -1 describes the same statistical solution. **FD3 axis orientation** changes display direction only. It does not change distances, classifications, probabilities, typicalities, classification accuracy, or stored canonical scores.

### Ternary plot

When exactly three groups are displayed and posterior probabilities are available, the ternary plot shows the relative posterior probabilities to the three groups. A point near a corner has a high posterior probability for that group.

### Dendrogram

The dendrogram summarizes group relationships from pairwise Mahalanobis distances. It is a descriptive view of the selected groups and variables.

### 3D canonical plot

When at least three canonical axes are available, the 3D plot shows reference scores, centroids, and the case in CV1-CV2-CV3 space. Rotation changes only the view.

### Stature graphs

The selected-equation graph shows reference points, the fitted regression line, prediction interval, and case. The supplemental interval plot compares available stature estimates and intervals. Both graphs use the stature display units selected in Analysis Options or, for Fordisc Student, in the Postcranial stature settings.

### Expand and export

Use **Expand plot** for a larger view. Graph snapshots in reports and supported downloads use the same CV/DF labels and calibrated axes.

## 16. Postcranial DFA and stature

Postcranial Measurement Entry uses the approved compact horizontal anatomical layout. The same measurements are available to two distinct analyses.

### Postcranial DFA

Postcranial DFA follows the same variable, group, classification-rate, Stepwise, outlier, probability, and reporting principles as cranial DFA.

### Stature estimation

Stature equations use the original entered measurements. Select the stature reference source, group mode, prediction interval, birth-year limits, missing-birth-year setting, maximum terms, sort order, and display units.

The **Stature units** setting defaults to **Inches** for continuity with FORDISC 3. Select **Centimeters** to convert stature estimates, prediction intervals, equation coefficients, graphs, and report tables for display. The conversion uses 1 inch = 2.54 centimeters and does not change the reference data, equation selection, classification, point-estimate calculation, ranking, or other analytical results. The summed bone-measurement value remains in its original measurement units. Fordisc Student users can make the same choice in the Postcranial Stature settings on Measurement Entry.

The prediction interval is more important than the point estimate. It expresses the expected range for an individual estimate rather than only uncertainty around a sample mean.

Current stature source options correspond to the supported FD3-style forensic, Trotter/military measured, and historical cadaver/measured reference sources. Sample sizes vary by measurement combination and filters.

## 17. Notes, Run Log, and bench notes

Case Notes are saved in the `.fd4case` file. The Run Log follows the FORDISC 3 running-log model: every completed analysis is appended chronologically as **RUN 1, RUN 2,** and so on, and the complete Results page for that run is repeated in the log. This includes the Results summary, warnings and checks, Measurement Checks, classification matrix, multigroup classification table, and stature summary when applicable. A stature run retains the display units used when that run was recorded.

The **Export Run Log as PDF** control opens a print-ready document that repeats the same Results-page presentation for every recorded run, with each entry identified as **RUN 1, RUN 2,** and so forth. Choose **Save as PDF** in the browser print dialog. Analyses with more than 12 reference groups use a wider Run Log page setting and more compact table typography. Runs with more than 24 groups use an extra-wide digital PDF page so all group columns remain readable rather than wrapping or being omitted. Case Notes and the Run Log do not replace the analyst's interpretation or agency documentation requirements.

## 18. Reports and exports

### Analysis report and PDF

The analysis report includes the case and version summary, analysis settings, warnings, measurement checks, classification matrix, group relationship table, stature results in the currently selected display units, and available graph snapshots. Browser PDF output uses one FD4 page-number system; disable the browser print dialog's own Headers and footers if it would add a second unrelated page-number series.

### Run Log PDF

The Report page contains one reporting panel with three controls: **Analysis report HTML**, **Print / Save as PDF**, and **Export Run Log as PDF**. The former Export panel and its separate table/CSV buttons are not shown in this release. The Run Log PDF preserves the chronological Results-page record rather than converting it into a spreadsheet-style table.


## 19. Import Data and custom reference datasets

Import Data currently supports preview and analysis of compatible CSV, TXT, DBF/dBase, and first-pass unencrypted Advantage ADT tables.

FD4 detects likely ID and grouping fields, matches recognized FORDISC measurement abbreviations, reports groups and missingness, and can apply a compatible first row as the current case.

The current FD4 custom-reference workflow is narrower than the fully generic FD3 CustomDB screen. FD3 could analyze arbitrary numeric fields with arbitrary text grouping fields. Restoring that full generic-variable capability remains planned work; do not assume that every non-FORDISC numeric column imported in the current build is available for analysis.

## 20. Legacy FD3 concepts retained in FD4

The following FD3 principles remain central:

- Explicit selection of appropriate reference groups
- Measurement-use controls rather than deleting case values
- Measurement range checking
- Automatic removal of variables not adequately represented in every selected group
- LOO cross-validation as the default accuracy estimate
- Posterior and multiple typicality probabilities
- Reference outlier detection and documented exclusions
- Forward Mean, Forward Minimum, Wilks, and Kappa Stepwise methods
- Separate interpretation of classification accuracy, relative probability, and absolute fit
- Two-group histograms and multigroup canonical displays
- Reports that record settings needed to review and repeat the analysis

## 21. Measurement abbreviation reference

The definitions below follow the terminology used in the FD3 Help and standard FORDISC measurement references. They are a working text reference; illustrations from the legacy manual will be integrated into the future consolidated illustrated manual.

### Core FDB cranial measurements

- **GOL** - Maximum cranial length, glabella to opisthocranion.
- **XCB** - Maximum cranial breadth between the most lateral cranial points.
- **ZYB** - Bizygomatic breadth between right and left zygion.
- **BBH** - Basion-bregma height.
- **BNL** - Basion-nasion length.
- **BPL** - Basion-prosthion length.
- **MAB** - Maximum external palate or maxillo-alveolar breadth.
- **MAL** - Maximum external palate or maxillo-alveolar length.
- **AUB** - Biauricular breadth between right and left radiculare.
- **UFHT** - Upper facial height.
- **WFB** - Minimum frontal breadth between frontotemporale.
- **UFBR** - Upper facial breadth between frontomalare temporale.
- **ASB** - Biasterionic breadth between right and left asterion.
- **ZMB** - Zygomaxillary breadth between right and left zygomaxillare.
- **NLH** - Nasal height.
- **NLB** - Nasal breadth.
- **OBB** - Orbital breadth.
- **OBH** - Orbital height.
- **EKB** - Biorbital breadth.
- **DKB** - Interorbital breadth.
- **FRC** - Frontal chord.
- **PAC** - Parietal chord.
- **OCC** - Occipital chord.
- **FOL** - Foramen magnum length.
- **FOB** - Foramen magnum breadth.
- **MDH** - Mastoid height.
- **MOW** - Midorbital width between right and left zygoorbitale.

### Mandibular measurements

- **GNI** - Chin height from infradentale to gnathion.
- **HMF** - Mandibular body height at the mental foramen.
- **TMF** - Mandibular body thickness at the mental foramen.
- **GOG** - Bigonial breadth.
- **CDL** - Bicondylar breadth.
- **WRB** - Minimum ramus breadth.
- **MLN** - Mandibular length.
- **XRH** - Maximum ramus height.
- **MAN** - Mandibular angle.

### Common Howells measurements

The Howells module includes the core measurements above and the supported Howells chords, subtenses, fractions, radii, and facial measurements. Examples include NOL, XFB, WCB, JUB, NDS, WNB, SIS, SSS, FMB, NAS, DKS, IML, XML, MLS, WMH, SOS, GLS, STB, FRS, FRF, PAS, PAF, OCS, OCF, and the standard cranial radii. Use the displayed measurement label and established Howells definition; do not infer a measurement from its abbreviation alone.

### Common postcranial measurements

- **CLAXLN** - Clavicle maximum length.
- **CLAAPD** - Clavicle anteroposterior diameter at midshaft.
- **CLAVRD** - Clavicle superior-inferior or vertical diameter at midshaft.
- **SCAPHT** - Scapula height.
- **SCAPBR** - Scapula breadth.
- **HUMXLN** - Humerus maximum length.
- **HUMEBR** - Humerus epicondylar breadth.
- **HUMHDD** - Maximum vertical diameter of the humeral head.
- **HUMMXD** - Maximum humerus diameter at midshaft.
- **HUMMWD** - Minimum humerus diameter at midshaft.
- **RADXLN** - Radius maximum length.
- **RADAPD** - Radius anteroposterior diameter at midshaft.
- **RADTVD** - Radius transverse diameter at midshaft.
- **ULNXLN** - Ulna maximum length.
- **ULNPHL** - Ulna physiological length.
- **ULNDVD** - Ulna dorsovolar diameter.
- **ULNTVD** - Ulna transverse diameter.
- **ULNCIR** - Ulna minimum circumference.
- **SACAHT** - Sacrum anterior height.
- **SACABR** - Sacrum anterior breadth.
- **SACS1B** - Transverse breadth of the first sacral segment.
- **INNOHT** - Innominate maximum height.
- **ILIABR** - Iliac breadth.
- **PUBCLN** - Pubis length.
- **ISCHLN** - Ischium length.
- **FEMXLN** - Femur maximum length.
- **FEMBLN** - Femur bicondylar length.
- **FEMEBR** - Femur epicondylar breadth.
- **FEMHDD** - Maximum femoral head diameter.
- **TIBXLN** - Tibia condylo-malleolar length.
- **TIBPEB** - Proximal tibial epiphyseal breadth.
- **TIBDEB** - Distal tibial epiphyseal breadth.
- **FIBXLN** - Fibula maximum length.
- **CALCXL** - Calcaneus maximum length.
- **CALCBR** - Calcaneus middle breadth.

## 22. Statistical glossary

### D-squared

Squared Mahalanobis distance from the case to a reference-group centroid using the pooled within-group covariance matrix. Smaller values indicate greater multivariate similarity under the selected model.

### Variance-covariance matrix

A matrix containing measurement variances and covariances. LDA uses the pooled within-group matrix to scale and combine measurement differences.

### Canonical variate

A linear combination used to display multigroup separation in fewer dimensions. The sign/direction of a canonical axis is arbitrary.

### Wilks' Lambda

A multivariate ratio of within-group to total variation. Lower values indicate stronger separation for the evaluated variable set.

### Sensitivity

The proportion of actual members of a group correctly classified into that group.

### Specificity

The proportion of members of all other groups correctly classified outside the target group.

### Balanced accuracy

The mean of sensitivity and specificity.

### Cohen's Kappa

A classification-performance measure adjusted for expected agreement related to prevalence/chance.

### No Information Rate

The accuracy obtained by assigning every reference individual to the largest group.

## 23. Interpretation cautions

- Do not test a case only against groups chosen to support a preferred conclusion.
- Do not trust a classification when the case is atypical of every selected group.
- Verify strong measurement deviations and out-of-range values.
- Consider the effect of small reference samples, missing measurements, and reference outliers.
- Do not interpret posterior probability as an absolute probability that a social identity is correct.
- Use modern FDB groups for appropriate modern forensic comparisons; consider Howells and historical groups for different temporal or geographic questions.
- Avoid using adult standards uncritically for immature individuals.
- Document every exclusion, transformation, Stepwise setting, and rerun that affects the result.

## 24. Troubleshooting

### Fordisc Free asks for a sign-in

Return to the signed-out opening page and choose **Try Fordisc Free**. The browser should open the `/try` workspace without an account. Fordisc Free can access only the locked Module Test Cases, Results, and Graphs. A temporary busy or rate-limit message may appear if the public demonstration is processing several requests; wait briefly and try again.

### Analysis will not run

Confirm that at least two groups are selected, enough measurements are selected, required case values are present when Classify Case is on, measurement checking has been addressed, and enough complete reference records remain.

### A selected measurement was removed

The measurement lacked more than eight complete reference rows in at least one selected group. Review the coverage details and report. Select a different measurement set or comparison set if appropriate.

### A large Howells analysis takes longer

A Howells comparison using many reference groups with **LOOCV** can take longer than a smaller comparison because each reference individual must be evaluated under leave-one-out calculations. Keep the analysis window open while **Processing analysis** is displayed. FD4 v1.0.13.2 uses an exact pooled within-group one-case deletion update for ranked typicality, reference-outlier diagnostics, and jackknifed VCVM output, eliminating the prior repeated rebuilding of the full reference dataset.

The server retains a finite calculation safety limit. The packaged default is 900 seconds and may be adjusted by the deployment administrator. If that limit is reached, FD4 returns a clear calculation-limit message and no partial result is saved; it no longer exposes the former raw 500 error caused by the fixed 180-second bridge timeout.

### Stepwise differs from a standard analysis

Stepwise selects a different variable set and may increase final sample sizes. Compare the retained variables, selection method, fixed selection cohort, final group counts, classification matrix, and case typicalities.

### Spanish labels do not return to English

Refresh the application only if the current build fails to restore English after selecting English. v1.0.13 explicitly controls workflow labels and prevents a stale Spanish DOM translation from replacing newly rendered English.

### A server error appears during deployment

A deployment can interrupt an analysis already in progress. Wait for the health endpoint to report the expected live version, refresh the application, and rerun. Persistent errors should be reported with case setup, module, variables, groups, options, timestamp, and the sanitized error message.

## 25. Current limitations and planned work

The following items remain outside this help version or are still under development:

- Full generic FD3 CustomDB parity for arbitrary numeric variables
- International module pending final scientific dataset decisions
- Automated iterative reference-outlier removal
- Final consolidated illustrated measurement manual
- Final approval of the web Terms and Conditions, renewal, refund, and device/session policies
- Automated TouchNet-to-Clerk subscription provisioning
- Additional stature workflow and reporting review

## 26. Citation and support

Until a final FD4 citation is approved, reports should identify the software version, engine version, module, reference-data version, variables, groups, and options used. The historical FORDISC 3 citation remains relevant to the lineage of the methods:

Jantz, R. L., and Ousley, S. D. FORDISC 3: Computerized Forensic Discriminant Functions. Version 3.1. The University of Tennessee, Knoxville.

For subscription and eligibility questions during the initial production transition, contact **fordisc.support@gmail.com**. Do not send case measurements or personally identifying case information unless specifically requested through an approved secure channel.

## Revision notes
