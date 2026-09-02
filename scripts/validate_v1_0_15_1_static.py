from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

EXPECTED_VERSION = "1.0.15.1"
EXPECTED_SCAFFOLD = "react_typescript_v1_0_15_1_public_free_ui_polish"
EXPECTED_HELP = "fd4_help_living_draft_v1_0_15_1.md"
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

EXPECTED_HOWELLS_MAP_CODES = {
    "AINF", "AINM", "ANDF", "ANDM", "ANYM", "ARIF", "ARIM", "ATAF", "ATAM",
    "AUSF", "AUSM", "BERF", "BERM", "BURF", "BURM", "BUSF", "BUSM", "DOGF",
    "DOGM", "EASF", "EASM", "EGYF", "EGYM", "ESKF", "ESKM", "GUAF", "GUAM",
    "HAIF", "HAIM", "MOKF", "MOKM", "MORF", "MORM", "NORF", "NORM", "NJAF",
    "NJAM", "PERF", "PERM", "PHIM", "SANF", "SANM", "SJAF", "SJAM", "TASF",
    "TASM", "TEIF", "TEIM", "TOLF", "TOLM", "ZALF", "ZALM", "ZULF", "ZULM",
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
    api_ts = (ROOT / "frontend/src/api.ts").read_text(encoding="utf-8")
    i18n = (ROOT / "frontend/src/i18n.ts").read_text(encoding="utf-8")
    map_tsx = (ROOT / "frontend/src/ReferenceGroupWorldMap.tsx").read_text(encoding="utf-8")
    styles = (ROOT / "frontend/src/styles.css").read_text(encoding="utf-8")
    render_yaml = (ROOT / "render.yaml").read_text(encoding="utf-8")
    render_docker = (ROOT / "Dockerfile.render").read_text(encoding="utf-8")
    compose_yaml = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    patch_readme = (ROOT / "README_USE_THIS_PATCH.txt").read_text(encoding="utf-8")
    help_md = (ROOT / "docs" / EXPECTED_HELP).read_text(encoding="utf-8")
    terms = (ROOT / "docs/FD4_TERMS_AND_CONDITIONS_DRAFT_v1_0_15.md").read_text(encoding="utf-8")
    provisioning = (ROOT / "docs/FD4_TOUCHNET_MANUAL_PROVISIONING_v1_0_15.md").read_text(encoding="utf-8")
    package = json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8"))

    # Release identity.
    require(main_py, f'PUBLIC_VERSION = "{EXPECTED_VERSION}"', "public version")
    require(main_py, f'"frontend_scaffold": "{EXPECTED_SCAFFOLD}"', "frontend scaffold")
    require(main_py, EXPECTED_HELP, "active Help source")
    assert package["version"] == EXPECTED_VERSION
    require(readme, "v1.0.15.1 Predeployment Polish and No-Sign-In Fordisc Free", "README title")
    require(patch_readme, "Apply this mini-patch only to a clean, accepted v1.0.15 source tree.", "mini-patch base")

    # Public no-sign-in Fordisc Free entry and exact server boundary.
    require(clerk, "Try Fordisc Free", "signed-out Free action")
    require(clerk, "navigate('/try')", "Free route navigation")
    require(clerk, "isAnonymousFreeRoute", "anonymous route detection")
    require(clerk, "ANONYMOUS_FREE_AUTHORIZATION", "anonymous Free authorization provider")
    require(access, "source: 'anonymous-free'", "anonymous Free source")
    require(access, "screens: ['results', 'graph']", "Free screen boundary")
    require(access, "manual_data_entry: false", "Free measurement-entry boundary")
    require(access, "arbitrary_analysis: false", "Free arbitrary-analysis boundary")
    require(access, "case_files: false", "Free case-file boundary")
    require(access, "help: false", "Free Help boundary")
    require(api_ts, "headers['X-FD4-Anonymous-Free'] = '1'", "anonymous request marker")
    require(main_py, 'ANONYMOUS_FREE_API_PATHS = {"/metadata/modules", "/analyze/module-test-case"}', "exact public API paths")
    require(main_py, "request.url.path in ANONYMOUS_FREE_API_PATHS", "exact-path middleware gate")
    require(main_py, "Fordisc Free can run only the server-controlled Module Test Case.", "Free arbitrary analysis denial")
    require(main_py, "_begin_anonymous_free_run", "public-demo rate and concurrency boundary")
    require(main_py, "_ANONYMOUS_FREE_SEMAPHORE", "anonymous concurrency semaphore")
    require(main_py, "_MODULE_TEST_CASE_RESPONSE_CACHE", "Module Test Case cache")
    require(main_py, "FD4_ANONYMOUS_FREE_RATE_MAX_RUNS", "anonymous rate configuration")
    require(render_yaml, "FD4_PUBLIC_FREE_ENABLED", "Render public Free switch")
    require(render_yaml, "FD4_ANONYMOUS_FREE_MAX_CONCURRENT", "Render Free concurrency setting")
    require(render_docker, 'ARG VITE_FD4_PUBLIC_FREE_ENABLED="1"', "frontend public Free build argument")
    require(compose_yaml, 'VITE_FD4_PUBLIC_FREE_ENABLED: "1"', "Compose public Free setting")

    # Free workspace is a locked module-ID-only workflow.
    require(app_tsx, "function FreeModuleTestCaseScreen", "Free Module Test Case screen")
    require(app_tsx, "const response = await analyzeModuleTestCase(selectedModule)", "server-controlled test-case call")
    require(app_tsx, "Measurement entry, saved cases, imports, options, and reports", "visible Free boundary")
    require(app_tsx, "isFreeTier && !result && !apiError", "Free initial Results workspace")

    # Logo-as-home/reset control.
    require(app_tsx, "function resetCurrentWorkspace", "shared workspace reset")
    require(app_tsx, "function returnToHome", "tier-aware home action")
    require(app_tsx, "brand-lockup brand-home-button", "clickable brand control")
    require(app_tsx, "Clear the current analysis and return to the Fordisc home screen", "home accessibility label")
    require(styles, ".brand-home-button", "home-button styling")
    require(styles, ".brand-home-button:focus-visible", "home-button keyboard focus")

    # Howells-only, screen-contained map.
    require(map_tsx, "/howells_reference_group_map_fd3.webp", "Howells map asset")
    require(map_tsx, "Howells reference-group locations", "Howells-only map heading")
    require(map_tsx, "Map reproduced from the FORDISC 3 Help file.", "map provenance")
    forbid(map_tsx, "FDB markers", "FDB map marker label")
    forbid(map_tsx, "FDB source", "FDB source map copy")
    forbid(map_tsx, "FdbMarker", "FDB marker type")
    forbid(map_tsx, "fdb-location", "FDB location directory")
    map_codes: set[str] = set()
    for code_list in re.findall(r"codes: '([^']+)'", map_tsx):
        map_codes.update(item.strip() for item in code_list.split(",") if item.strip())
    assert map_codes == EXPECTED_HOWELLS_MAP_CODES, (
        f"Howells map-code mismatch. Missing={sorted(EXPECTED_HOWELLS_MAP_CODES - map_codes)} "
        f"Extra={sorted(map_codes - EXPECTED_HOWELLS_MAP_CODES)}"
    )
    assert map_tsx.count("name: '") == 28, "Expected the 28 documented Howells populations"
    require(styles, "max-width: min(100%, 980px);", "map width limit")
    require(styles, "max-height: min(62vh, 620px);", "map viewport-height limit")
    require(styles, "object-fit: contain;", "map containment")
    map_asset = ROOT / "frontend/public/howells_reference_group_map_fd3.webp"
    assert map_asset.exists() and map_asset.stat().st_size > 250_000
    assert map_asset.read_bytes()[:4] == b"RIFF", "Expected a WebP RIFF map asset"

    # Options-page proportions and overlap prevention.
    require(styles, "minmax(760px, 1.95fr)", "dominant Stature options column")
    require(styles, "minmax(230px, 0.58fr)", "compact Core/Exclude columns")
    require(styles, "minmax(190px, 1.25fr)", "wider stature-units track")
    require(styles, "@media (min-width: 761px) and (max-width: 1399px)", "intermediate responsive Options layout")
    require(styles, "@media (max-width: 960px)", "two-column stature controls")
    require(styles, "@media (max-width: 520px)", "single-column small-screen stature controls")
    require(app_tsx, "Display only; calculations are unchanged.", "shortened stature-unit helper")
    forbid(app_tsx, "Choose which diagnostic sections appear in Extended Results.", "removed Extended Results helper")

    # TouchNet, support, institution plan, stature units, and Student checkbox remain locked from v1.0.15.
    require(clerk, TOUCHNET_URL, "TouchNet default URL")
    assert clerk.count("<TouchNetPurchasePanel />") == 2, "TouchNet panel must remain on opening and Plans pages"
    require(clerk, "Account setup may take up to 24 hours.", "credential setup notice")
    require(clerk, SUPPORT_EMAIL, "temporary support email")
    require(clerk, "?? '10'", "10-user institution default")
    require(clerk, "?? 'price TBD'", "additional-user placeholder")
    require(styles, ".student-stature-grid .student-birthyear-checkbox input[type=\"checkbox\"]", "Student checkbox rule")
    require(styles, "width: 18px;", "18-pixel checkbox width")
    require(styles, "height: 18px;", "18-pixel checkbox height")
    require(app_tsx, "type StatureUnits = 'in' | 'cm';", "stature-unit type")
    require(app_tsx, "const INCH_TO_CM = 2.54;", "exact stature conversion")
    assert app_tsx.count("<StatureUnitToggle") == 2, "Stature units must remain on Options and Student setup"
    require(app_tsx, "statureFactor = statureUnits === 'cm' ? INCH_TO_CM : 1", "graph stature conversion")
    require(main_py, 'private_metadata.get("fd4_subscription")', "manual TouchNet subscription metadata")
    require(main_py, 'authorization_status = "expired"', "manual entitlement expiration")
    require(terms, "DRAFT FOR UNIVERSITY OF TENNESSEE REVIEW", "Terms draft warning")
    require(provisioning, '"tier": "institution"', "institution metadata example")

    # Wide tables remain contained without visible explanatory text.
    require(app_tsx, "const WIDE_TABLE_GROUP_THRESHOLD = 12;", "wide-table threshold")
    require(styles, ".wide-group-results .scroll-table {", "wide-table scroller")
    for text, label in ((app_tsx, "App"), (styles, "styles"), (i18n, "translations"), (help_md, "Help")):
        forbid(text, "Wide table view", f"{label} wide-table heading")
        forbid(text, "Tables stay within the page; scroll horizontally to view additional columns.", f"{label} wide-table explanation")

    # Help reflects the narrow release and retains an empty revision section.
    require(help_md, "Try Fordisc Free", "Help public Free entry")
    require(help_md, "No sign-in or account is required.", "Help no-account statement")
    require(help_md, "The current map intentionally represents only the Howells populations.", "Help Howells-only map")
    require(help_md, "FORDISC logo in the upper-left corner acts as a home control", "Help logo-home behavior")
    require(help_md, SUPPORT_EMAIL, "Help support address")
    assert re.search(r"\n## Revision notes\s*\Z", help_md), "Current Help revision notes must be blank"

    # Locked timeout/performance infrastructure remains present.
    require(main_py, '"FD4_R_BRIDGE_TIMEOUT_SECONDS"', "configurable timeout")
    require(main_py, "except subprocess.TimeoutExpired as exc", "structured timeout handling")
    require(main_py, "status_code=504", "HTTP 504 timeout")
    forbid(main_py, "timeout=180", "fixed 180-second timeout")
    require(render_yaml, 'FD4_R_BRIDGE_TIMEOUT_SECONDS\n        value: "900"', "Render timeout")

    # Locked engine, bridge, and reference data remain byte-for-byte unchanged.
    for relative, expected in LOCKED_HASHES.items():
        actual = sha256(ROOT / relative)
        assert actual == expected, f"Locked file changed: {relative}\nexpected {expected}\nactual   {actual}"

    backups = [
        path for path in ROOT.rglob("*")
        if path.is_file()
        and ".fd4_validation" not in path.parts
        and any(token in path.name for token in (".bak", ".orig", ".rej", "~"))
    ]
    assert not backups, f"Temporary backups remain: {backups}"

    print("v1.0.15.1 static public-Free, Howells-only map, Options layout, home-reset, v1.0.15 preservation, and locked-parity checks passed.")


if __name__ == "__main__":
    main()
