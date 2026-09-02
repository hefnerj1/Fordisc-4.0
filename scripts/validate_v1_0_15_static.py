from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
EXPECTED_VERSION = "1.0.15"
EXPECTED_SCAFFOLD = "react_typescript_v1_0_15_touchnet_reference_map_metric_units"
EXPECTED_HELP = "fd4_help_living_draft_v1_0_15.md"
TOUCHNET_URL = "https://secure.touchnet.com/C21610_ustores/web/store_main.jsp?STOREID=15&SINGLESTORE=true"
SUPPORT_EMAIL = "fordisc.support@gmail.com"
LOCKED_HASHES = {
    "engine/fordisc4_r_engine_v0_14/R/lda_engine.R": "fe3a6ee0f23cdba4ebd1eb22a774e24f8d5c9e3557eaa1a0d111874b1a62b83f",
    "engine/fordisc4_r_engine_v0_14/R/utils.R": "015fedab4068cb9e6d8d971fa44403a1dbc3e6a9ede7fba4b61ad3a4ad0c5851",
    "r_bridge/run_engine.R": "ca7e170341487dc73c9e1de0071cb0f669501d6aaeb993ea185cbf079eccd383",
    "engine/fordisc4_r_engine_v0_14/data/FD3CRAN.csv": "514a589c548f2d10999e1e3184ac747266f35d1e946f7f0da56ccdce97d6023e",
    "engine/fordisc4_r_engine_v0_14/data/FD3POST.csv": "3cfa3605d6cd3aa453f5abb5c4babe34c6995095a8fb856ebb2a264868abfebf",
    "engine/fordisc4_r_engine_v0_14/data/FD3VARRANGES.csv": "fe2627fe837ed4a5a07ed3fe1207fe49cfd18cfca806205e1f772bcf8b0f3336",
    "engine/fordisc4_r_engine_v0_14/data/fdb_cranial.csv": "4ca2051ccfc808840f65a1b599656fa19af49f952a2f4fb63d5af571e0211e12",
    "engine/fordisc4_r_engine_v0_14/data/fdb_postcranial.csv": "22cf3a27aa7b7487c49f5cc6ecf529ad93dc68957b8b0aea6b57cf1a13f00fbc",
    "engine/fordisc4_r_engine_v0_14/data/fdb_stature.csv": "b860a414368e3bdcfb357bc64668704cef7e247150c951349e79375101436dd3",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(text: str, fragment: str, label: str) -> None:
    if fragment not in text:
        raise AssertionError(f"Missing {label}: {fragment}")


def forbid(text: str, fragment: str, label: str) -> None:
    if fragment in text:
        raise AssertionError(f"Unexpected {label}: {fragment}")


def function_slice(text: str, start: str, end: str) -> str:
    start_index = text.index(start)
    end_index = text.index(end, start_index)
    return text[start_index:end_index]


def main() -> None:
    main_py = (ROOT / "app/main.py").read_text(encoding="utf-8")
    app_tsx = (ROOT / "frontend/src/App.tsx").read_text(encoding="utf-8")
    clerk = (ROOT / "frontend/src/ClerkAuthShell.tsx").read_text(encoding="utf-8")
    access = (ROOT / "frontend/src/access.tsx").read_text(encoding="utf-8")
    i18n = (ROOT / "frontend/src/i18n.ts").read_text(encoding="utf-8")
    map_tsx = (ROOT / "frontend/src/ReferenceGroupWorldMap.tsx").read_text(encoding="utf-8")
    styles = (ROOT / "frontend/src/styles.css").read_text(encoding="utf-8")
    render_yaml = (ROOT / "render.yaml").read_text(encoding="utf-8")
    render_docker = (ROOT / "Dockerfile.render").read_text(encoding="utf-8")
    compose_yaml = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    help_md = (ROOT / "docs" / EXPECTED_HELP).read_text(encoding="utf-8")
    terms = (ROOT / "docs/FD4_TERMS_AND_CONDITIONS_DRAFT_v1_0_15.md").read_text(encoding="utf-8")
    provisioning = (ROOT / "docs/FD4_TOUCHNET_MANUAL_PROVISIONING_v1_0_15.md").read_text(encoding="utf-8")
    package = json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8"))

    # Release identity.
    require(main_py, f'PUBLIC_VERSION = "{EXPECTED_VERSION}"', "public version")
    require(main_py, f'"frontend_scaffold": "{EXPECTED_SCAFFOLD}"', "frontend scaffold")
    require(main_py, EXPECTED_HELP, "active Help source")
    assert package["version"] == EXPECTED_VERSION
    require(readme, "v1.0.15 TouchNet Production Transition, Reference Map, and Metric Stature Display", "README title")

    # TouchNet is the only plan-card purchase path on opening and Plans pages.
    require(clerk, f"?? '{TOUCHNET_URL}'", "TouchNet default URL")
    require(clerk, "function TouchNetPurchasePanel", "shared TouchNet purchase panel")
    assert clerk.count("<TouchNetPurchasePanel />") == 2, "TouchNet purchase panel must appear on opening and Plans pages"
    assert clerk.count("Purchase Access Through UTK") == 1, "Shared TouchNet button label should be defined once"
    require(clerk, "Account setup may take up to 24 hours.", "credential setup notice")
    forbid(clerk, "PublicPlanSignupButton", "public per-plan signup component")
    forbid(clerk, "actionLabel=", "signed-in per-plan action labels")
    public_card = function_slice(clerk, "function PublicPlanCard", "function TouchNetPurchasePanel")
    forbid(public_card, "button", "public plan-card button")
    plan_card = function_slice(clerk, "function PlanChoiceCard", "function SubscriptionPage")
    forbid(plan_card, "button", "signed-in plan-card button")
    require(render_yaml, 'VITE_CLERK_BILLING_ENABLED\n        value: "0"', "Render Clerk Billing disabled")
    require(render_yaml, TOUCHNET_URL, "Render TouchNet URL")
    require(render_docker, f'ARG VITE_FD4_TOUCHNET_STORE_URL="{TOUCHNET_URL}"', "Render Docker TouchNet argument")
    require(compose_yaml, f'VITE_FD4_TOUCHNET_STORE_URL: "{TOUCHNET_URL}"', "Compose TouchNet URL")

    # Support and institutional-plan messaging.
    require(clerk, f"?? '{SUPPORT_EMAIL}'", "temporary support default")
    for text, label in ((render_yaml, "Render"), (render_docker, "Render Docker"), (compose_yaml, "Compose")):
        require(text, SUPPORT_EMAIL, f"{label} support email")
    require(clerk, "?? '10'", "10-user institution default")
    require(clerk, "?? 'price TBD'", "additional-user price placeholder")
    assert clerk.count("Includes ${INSTITUTION_INCLUDED_SEATS} named users") == 2
    require(styles, ".public-plan-summary > .public-plan-card,", "equal-height plan-card rule")
    require(styles, "height: 100%;", "equal-height plan cards")

    # Proportional Student stature checkbox.
    require(styles, ".student-stature-grid input:not([type=\"checkbox\"]),", "checkbox excluded from broad Student input rule")
    require(styles, ".student-stature-grid .student-birthyear-checkbox input[type=\"checkbox\"]", "specific Student checkbox rule")
    require(styles, "width: 18px;", "18-pixel Student checkbox width")
    require(styles, "height: 18px;", "18-pixel Student checkbox height")

    # Stature units are a display-only Inches/Centimeters preference.
    require(app_tsx, "type StatureUnits = 'in' | 'cm';", "stature-unit type")
    require(app_tsx, "const INCH_TO_CM = 2.54;", "exact inch-to-centimeter conversion")
    require(app_tsx, "units: 'in' as StatureUnits", "default inches setting")
    require(app_tsx, "function StatureUnitToggle", "stature-unit toggle component")
    assert app_tsx.count("<StatureUnitToggle") == 2, "Stature units must be selectable in Options and Student stature setup"
    require(app_tsx, "units: statureUnits", "saved-case stature-unit preference")
    require(app_tsx, "savedStatureOptions.units === 'cm' ? 'cm' : 'in'", "saved-case stature-unit restoration")
    require(app_tsx, "statureUnits: context.statureUnits", "Run Log stature-unit snapshot")
    require(app_tsx, "statureUnits: rawDisplay.statureUnits === 'cm'", "legacy-safe Run Log unit restoration")
    require(app_tsx, "Stature display units", "report setting label")
    require(app_tsx, "statureUnitAbbreviation", "stature unit labels")
    require(app_tsx, "convertStatureDisplayNumber", "stature display conversion helper")
    require(app_tsx, "numeric * INCH_TO_CM", "centimeter display conversion")
    require(app_tsx, "statureFactor = statureUnits === 'cm' ? INCH_TO_CM : 1", "stature graph conversion")
    require(i18n, '"tiers.stature_units"', "stature-unit translation")
    require(i18n, '"tiers.inches"', "inches translation")
    require(i18n, '"tiers.centimeters"', "centimeters translation")
    require(styles, ".stature-unit-toggle", "stature-unit toggle styling")
    require(styles, ".stature-unit-toggle button.active", "active stature-unit styling")

    # Reference Group Selection is replaced with an informational map after Help.
    for text, label in ((main_py, "backend"), (app_tsx, "App"), (access, "access")):
        forbid(text, "reference_group_selection", f"active {label} Reference Group Selection screen")
    require(main_py, '"reference_group_world_map"', "backend map screen")
    require(main_py, '"title": "Reference Group World Map"', "backend map title")
    require(app_tsx, "'help',\n  'reference_group_world_map'", "map after Help in fallback order")
    require(app_tsx, "'help', 'reference_group_world_map'", "map appended after Help")
    require(app_tsx, "<ReferenceGroupWorldMap language={interfaceLanguage} />", "map renderer")
    require(access, "reference_group_map: true", "full map capability")
    require(access, "reference_group_tab: false", "expanded group tab disabled")
    require(i18n, '"nav.reference_group_world_map"', "map translation key")
    forbid(i18n, '"nav.reference_group_selection"', "retired group-selection translation key")
    require(map_tsx, "/howells_reference_group_map_fd3.webp", "Howells map asset")
    require(map_tsx, "Locations are approximate and provided only as a reference.", "map interpretive caution")
    require(map_tsx, "The Howells map is reproduced from the FORDISC 3 Help file.", "map provenance note")
    map_asset = ROOT / "frontend/public/howells_reference_group_map_fd3.webp"
    assert map_asset.exists() and map_asset.stat().st_size > 250_000
    assert map_asset.read_bytes()[:4] == b"RIFF", "Expected a WebP RIFF map asset"

    # Complete current group-code coverage in the map directory.
    from app import main as app_main

    howells_actual = {
        row["id"] for row in app_main.ANALYSIS_OPTIONS["cranial_howells_dfa"]["groups"]["available_groups"]
        if row.get("selectable")
    }
    fdb_actual = {
        row["id"] for row in app_main.ANALYSIS_OPTIONS["cranial_fdb_dfa"]["groups"]["available_groups"]
        if row.get("selectable")
    }
    map_codes = set(re.findall(r"\b(?:[A-Z]{2,4}\d{0,2})\b", map_tsx))
    assert howells_actual <= map_codes, f"Missing Howells map codes: {sorted(howells_actual - map_codes)}"
    assert fdb_actual <= map_codes, f"Missing FDB map codes: {sorted(fdb_actual - map_codes)}"
    assert len(howells_actual) == 65
    assert len(fdb_actual) == 13

    # Manual TouchNet entitlements are private, scoped, dated, and sanitized.
    require(main_py, 'private_metadata.get("fd4_subscription")', "private subscription metadata")
    require(main_py, 'expected_tiers = {"student", "pro"} if scope == "user" else {"institution"}', "scope restrictions")
    require(main_py, 'authorization_status = "missing_expiration"', "required expiration")
    require(main_py, 'authorization_status = "expired"', "automatic expiration")
    require(main_py, 'reference_present = bool', "sanitized reference presence")
    forbid(main_py, 'result["reference"]', "order-reference response value")
    require(main_py, "organization_manual.get(\"active\")", "organization entitlement evaluation")
    require(main_py, "manual_student_claimed and student_eligibility.get(\"eligible\")", "Student eligibility enforcement")
    require(access, "manual_subscription?:", "frontend manual subscription summary")
    require(clerk, "Access through <strong>{formatSubscriptionDate", "visible entitlement expiration")

    # Terms and fulfillment documents are included but unapproved.
    require(terms, "DRAFT FOR UNIVERSITY OF TENNESSEE REVIEW", "Terms draft warning")
    require(terms, "NOT APPROVED, NOT EFFECTIVE", "Terms nonpublic warning")
    require(terms, "web-based subscription application", "modern web scope")
    require(terms, "10 named users", "institution terms")
    require(terms, "TouchNet", "payment provider")
    require(terms, "Clerk", "identity provider")
    require(terms, "up to **24 hours**", "activation timing")
    require(provisioning, '"tier": "student"', "Student metadata example")
    require(provisioning, '"tier": "pro"', "Pro metadata example")
    require(provisioning, '"tier": "institution"', "Institution metadata example")
    require(provisioning, '"seat_limit": 10', "institution seat limit")
    require(provisioning, "Every paid entitlement must have an explicit UTC `valid_until` date.", "expiration instruction")

    # Help reflects this release and keeps revision notes empty.
    require(help_md, "Purchase Access Through UTK", "Help TouchNet purchase path")
    require(help_md, "account setup may take up to 24 hours", "Help activation timing")
    require(help_md, "10 named users", "Help institution seats")
    require(help_md, "former expanded Reference Group Selection tab has been retired", "Help retired screen")
    require(help_md, "Reference Group World Map", "Help map")
    require(help_md, SUPPORT_EMAIL, "Help support address")
    require(help_md, "The **Stature units** setting defaults to **Inches**", "Help stature-unit control and default")
    require(help_md, "1 inch = 2.54 centimeters", "Help exact display conversion")
    assert re.search(r"\n## Revision notes\s*\Z", help_md), "Current Help revision notes must be blank"

    # Accepted v1.0.14.1 Run Log, wide-table, and measurement-error UI remain present.
    require(app_tsx, "function RunLogPrintDocument", "Run Log PDF")
    require(app_tsx, "const WIDE_TABLE_GROUP_THRESHOLD = 12;", "wide-table threshold")
    require(styles, ".measurement-error-control {", "prominent measurement-error control")
    require(styles, ".wide-group-results .scroll-table {", "wide-table scroller")
    for text, label in ((app_tsx, "App"), (styles, "styles"), (i18n, "translations"), (help_md, "current Help")):
        forbid(text, "wide-table-mode-note", f"{label} large-table notice")
        forbid(text, "Wide table view", f"{label} large-table callout wording")
        forbid(text, "Tables stay within the page; scroll horizontally to view additional columns.", f"{label} large-table callout sentence")
    forbid(i18n, '"results.wide_table_title"', "large-table notice translation key")
    forbid(i18n, '"results.wide_table_description"', "large-table notice description key")

    # Locked timeout/performance infrastructure remains present.
    require(main_py, '"FD4_R_BRIDGE_TIMEOUT_SECONDS"', "configurable timeout")
    require(main_py, "except subprocess.TimeoutExpired as exc", "structured timeout handling")
    require(main_py, "status_code=504", "HTTP 504 timeout")
    forbid(main_py, "timeout=180", "fixed 180-second timeout")
    require(render_yaml, 'FD4_R_BRIDGE_TIMEOUT_SECONDS\n        value: "900"', "Render timeout")

    # Locked engine, R bridge, and reference data remain byte-for-byte unchanged.
    for relative, expected in LOCKED_HASHES.items():
        actual = sha256(ROOT / relative)
        assert actual == expected, f"Locked file changed: {relative}\nexpected {expected}\nactual   {actual}"

    backups = [
        path for path in ROOT.rglob("*")
        if path.is_file() and any(token in path.name for token in (".bak", ".orig", ".rej", "~"))
    ]
    assert not backups, f"Temporary backups remain: {backups}"

    print("v1.0.15 static TouchNet, map, metric-stature, no-callout, entitlement, and locked-parity checks passed.")


if __name__ == "__main__":
    main()
