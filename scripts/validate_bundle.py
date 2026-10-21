"""Validate data/bundle.json before it reaches GitHub Pages.

Usage: python3 scripts/validate_bundle.py [--max-age-days N]   (run from the repo root)

Errors fail the run (exit 1):
- bundle structure and the required fields and types on every actor and scenario
- inner item schemas for aliases, software, attack techniques, campaigns, gaps, relatedMs, relatedRecords
- duplicate or malformed actor ids, unknown country codes, malformed ATT&CK group/technique ids
- duplicate source refs, invalid source dates, sources without an http(s) url
- [Sn] / [R-...] / [MS] / [M] citations or campaign sources that point at no source in the same record
- researched profiles (import+research) with uncited factual sections, missing assessment disclaimers, or incomplete sources
- "exported" missing, in the future, or not equal to the newest actor updatedAt
- bundle out of sync with data/actors/ and data/scenarios/, or index.html out of sync with app/index.html (rebuild with scripts/build_pages.py)

Warnings are reported but do not fail the run:
- bare imported sources missing a ref, title, publisher or date
- an export older than --max-age-days (default 90)

Inside GitHub Actions each finding is also printed as a workflow annotation.
"""
import argparse, datetime, glob, json, os, re, sys

BUNDLE = "data/bundle.json"
COUNTRIES = {"CN", "RU", "IR", "KP", "FIN", "DEV", "OTH", "PSOA"}
TACTICS = {
    "reconnaissance", "resource-development", "initial-access", "execution",
    "persistence", "privilege-escalation", "defense-evasion", "credential-access",
    "discovery", "lateral-movement", "collection", "command-and-control",
    "exfiltration", "impact", "stealth", "defense-impairment",
}
ACTOR_FIELDS = {
    "id": str, "primaryName": str, "msName": str, "msCandidates": list, "country": str,
    "aliases": list, "mitreGroupId": str, "identification": dict, "attribution": dict,
    "objectives": str, "targeting": dict, "capabilities": dict, "attack": list,
    "campaigns": list, "diamond": dict, "gaps": list, "implications": dict, "sources": list,
    "importFlags": list, "provenance": dict, "updatedAt": str, "updatedBy": str, "relatedMs": list,
}
SECTION_KEYS = {
    "identification": ("summary", "firstObserved", "notes"),
    "attribution": ("sponsor", "confidence", "basis"),
    "targeting": ("sectors", "regions", "notes"),
    "capabilities": ("summary", "software"),
    "diamond": ("adversary", "capability", "infrastructure", "victim"),
    "implications": ("jipoe", "jcc2"),
}
SCENARIO_FIELDS = {"id": str, "title": str, "injects": list}
ID_RE = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
GROUP_RE = re.compile(r"G\d{4}")
TECH_RE = re.compile(r"T\d{4}(\.\d{3})?")
TIMESTAMP_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z")
DATE_PREFIX_RE = re.compile(r"^((19|20)\d{2})(?:-(\d{2})(?:-(\d{2}))?)?(?:\s*\([^)]+\))?$")
CITE_RE = re.compile(r"\[(S\d+|R-[0-9a-f]{8}-\d+|MS|M)\]")

errors, warnings = [], []
in_actions = os.environ.get("GITHUB_ACTIONS") == "true"


def report(bucket, level, where, msg):
    bucket.append(f"{where}: {msg}")
    if in_actions:
        print(f"::{level} file={BUNDLE},title=Bundle check::{where}: {msg}")


def error(where, msg): report(errors, "error", where, msg)
def warn(where, msg): report(warnings, "warning", where, msg)


def valid_source_date(val):
    if not isinstance(val, str):
        return False
    m = DATE_PREFIX_RE.fullmatch(val.strip())
    if not m:
        return False
    year, month, day = int(m.group(1)), m.group(3), m.group(4)
    if month is not None:
        mo = int(month)
        if not (1 <= mo <= 12):
            return False
        if day is not None:
            try:
                datetime.date(year, mo, int(day))
            except ValueError:
                return False
    return True


def check_actor(a, seen, all_ids):
    where = f"actor {a.get('id', '?')!s}"
    for field, kind in ACTOR_FIELDS.items():
        if field not in a:
            error(where, f"missing field '{field}'")
        elif not isinstance(a[field], kind):
            error(where, f"'{field}' should be {kind.__name__}, got {type(a[field]).__name__}")
    for section, keys in SECTION_KEYS.items():
        if isinstance(a.get(section), dict):
            for key in keys:
                if key not in a[section]:
                    error(where, f"'{section}' missing '{key}'")
    aid = a.get("id")
    if isinstance(aid, str):
        if not ID_RE.fullmatch(aid):
            error(where, "id is not a lowercase slug")
        if aid in seen:
            error(where, "duplicate id")
        seen.add(aid)
    if isinstance(a.get("primaryName"), str) and not a["primaryName"].strip():
        error(where, "primaryName is empty")
    if isinstance(a.get("country"), str) and a["country"] not in COUNTRIES:
        error(where, f"unknown country '{a['country']}'")
    if a.get("mitreGroupId") and not GROUP_RE.fullmatch(str(a["mitreGroupId"])):
        error(where, f"mitreGroupId '{a['mitreGroupId']}' is not G####")
    if isinstance(a.get("updatedAt"), str) and not TIMESTAMP_RE.fullmatch(a["updatedAt"]):
        error(where, f"updatedAt '{a['updatedAt']}' is not an ISO UTC timestamp")

    # Inner item validations
    for i, al in enumerate(a.get("aliases") or []):
        if not isinstance(al, dict) or not str(al.get("name", "")).strip() or not isinstance(al.get("vendor"), str):
            error(where, f"alias #{i + 1} is missing a non-empty name or vendor string")
    sw_list = (a.get("capabilities") or {}).get("software") if isinstance(a.get("capabilities"), dict) else None
    if isinstance(sw_list, list):
        for i, sw in enumerate(sw_list):
            if not isinstance(sw, dict) or not isinstance(sw.get("id"), str) or (sw["id"].strip() and not re.fullmatch(r"S\d{4}", sw["id"].strip())) or not str(sw.get("name", "")).strip() or not str(sw.get("type", "")).strip():
                error(where, f"software #{i + 1} has invalid id, name, or type")
    for i, t in enumerate(a.get("attack") or []):
        if not isinstance(t, dict) or not TECH_RE.fullmatch(str(t.get("id", ""))) or not str(t.get("name", "")).strip() or not str(t.get("source", "")).strip():
            error(where, f"attack technique #{i + 1} has invalid id, name, or source")
        elif not isinstance(t.get("tactics"), list) or any(tc not in TACTICS for tc in t["tactics"]):
            error(where, f"attack technique {t.get('id')} has invalid tactics {t.get('tactics')}")
    for i, g in enumerate(a.get("gaps") or []):
        if not isinstance(g, str) or not g.strip():
            error(where, f"gap #{i + 1} is empty or not a string")
    for i, rm in enumerate(a.get("relatedMs") or []):
        if not isinstance(rm, dict) or not str(rm.get("name", "")).strip() or not str(rm.get("note", "")).strip():
            error(where, f"relatedMs #{i + 1} is missing name or note")
    if "relatedRecords" in a:
        if not isinstance(a["relatedRecords"], list):
            error(where, "'relatedRecords' should be list")
        else:
            for i, rr in enumerate(a["relatedRecords"]):
                if not isinstance(rr, dict) or not str(rr.get("id", "")).strip() or not str(rr.get("note", "")).strip():
                    error(where, f"relatedRecords #{i + 1} is missing id or note")
                elif rr["id"] not in all_ids:
                    error(where, f"relatedRecords references unknown actor '{rr['id']}'")

    is_researched = (a.get("provenance") or {}).get("origin") == "import+research"
    refs = []
    for i, s in enumerate(a.get("sources") or []):
        sw = f"{where} source {s.get('ref', '#' + str(i + 1)) if isinstance(s, dict) else '#' + str(i + 1)}"
        if not isinstance(s, dict):
            error(sw, "is not an object")
            continue
        if not isinstance(s.get("url"), str) or not s["url"].startswith(("http://", "https://")):
            error(sw, "url is missing or not http(s)")
        ref_val = str(s.get("ref", "")).strip()
        if ref_val:
            refs.append(ref_val)
        raw_date = str(s.get("date", "")).strip()
        if raw_date and not valid_source_date(raw_date):
            error(sw, f"invalid source date '{raw_date}'")
        gaps = [k for k in ("ref", "title", "publisher") if not str(s.get(k, "")).strip()]
        if not raw_date or not valid_source_date(raw_date):
            gaps.append("date")
        if gaps:
            if is_researched:
                error(sw, f"researched profile has incomplete source, missing {', '.join(gaps)}")
            else:
                warn(sw, f"bare reference, missing {', '.join(gaps)}")
    for ref in sorted({r for r in refs if refs.count(r) > 1}):
        error(where, f"source ref {ref} is used by more than one source, so its citations are ambiguous")

    ref_set = set(refs)
    for i, c in enumerate(a.get("campaigns") or []):
        cw = f"{where} campaign #{i + 1}"
        if not isinstance(c, dict):
            error(cw, "is not an object")
            continue
        if not str(c.get("name", "")).strip() or not str(c.get("summary", "")).strip():
            error(cw, "is missing name or summary")
        c_srcs = c.get("sources")
        if not isinstance(c_srcs, list):
            error(cw, "'sources' must be a list")
        else:
            for sr in c_srcs:
                if not isinstance(sr, str) or sr not in ref_set:
                    error(cw, f"cites source '{sr}' which is not in sources")

    body = json.dumps({k: v for k, v in a.items() if k not in ("sources", "provenance")})
    for ref in sorted(set(CITE_RE.findall(body)) - ref_set):
        error(where, f"cites [{ref}] but has no source with that ref")

    if is_researched:
        if not refs:
            error(where, "researched profile has no dated sources")
        for sec in ("identification", "attribution", "objectives", "targeting", "capabilities", "campaigns"):
            val = a.get(sec)
            has_claims = False
            if isinstance(val, str):
                has_claims = bool(val.strip())
            elif isinstance(val, list):
                has_claims = len(val) > 0
            elif isinstance(val, dict):
                if sec == "capabilities":
                    has_claims = bool(str(val.get("summary", "")).strip())
                elif sec == "targeting":
                    has_claims = bool(val.get("sectors") or val.get("regions"))
                else:
                    has_claims = any(bool(str(v).strip()) for v in val.values())
            if has_claims:
                sec_cites = set(CITE_RE.findall(json.dumps(val)))
                if sec == "campaigns" and isinstance(val, list):
                    sec_cites |= {sr for c in val if isinstance(c, dict) for sr in (c.get("sources") or []) if sr in ref_set}
                if not (sec_cites & ref_set):
                    error(where, f"researched section '{sec}' has claims but no valid source citations")
        imp = a.get("implications") if isinstance(a.get("implications"), dict) else {}
        for k in ("jipoe", "jcc2"):
            v = str(imp.get(k, "")).strip()
            if v and "analyst assessment" not in v.lower():
                error(where, f"researched implications.{k} is missing the analyst-assessment label")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--max-age-days", type=int, default=90)
    args = parser.parse_args()

    try:
        bundle = json.load(open(BUNDLE, encoding="utf-8"))
    except (OSError, ValueError) as e:
        error("bundle", f"cannot be read as JSON ({e})")
        return finish()
    if not isinstance(bundle, dict):
        error("bundle", "top level is not an object")
        return finish()
    actors, scenarios = bundle.get("actors"), bundle.get("scenarios")
    if not isinstance(actors, list) or not actors:
        error("bundle", "'actors' is missing or empty")
        actors = []
    if not isinstance(scenarios, list):
        error("bundle", "'scenarios' is missing or not a list")
        scenarios = []

    all_ids = {a.get("id") for a in actors if isinstance(a, dict) and isinstance(a.get("id"), str)}
    seen = set()
    for a in actors:
        if isinstance(a, dict):
            check_actor(a, seen, all_ids)
        else:
            error("bundle", "an actor entry is not an object")
    for s in scenarios:
        where = f"scenario {s.get('id', '?') if isinstance(s, dict) else '?'}"
        for field, kind in SCENARIO_FIELDS.items():
            if not isinstance(s, dict) or not isinstance(s.get(field), kind):
                error(where, f"missing or invalid '{field}'")

    # Export date: must be the newest updatedAt (what build_pages.py writes), never in the future.
    exported = bundle.get("exported")
    today = datetime.datetime.now(datetime.timezone.utc).date()
    try:
        exported_date = datetime.date.fromisoformat(exported)
    except (TypeError, ValueError):
        error("bundle", f"'exported' is '{exported}', expected YYYY-MM-DD")
        exported_date = None
    if exported_date:
        newest = max((a.get("updatedAt", "") for a in actors if isinstance(a, dict)), default="")[:10]
        if exported != newest:
            error("bundle", f"'exported' is {exported} but the newest actor updatedAt is {newest}; run scripts/build_pages.py")
        if exported_date > today + datetime.timedelta(days=1):
            error("bundle", f"'exported' {exported} is in the future")
        age = (today - exported_date).days
        if age > args.max_age_days:
            warn("bundle", f"export is {age} days old (limit {args.max_age_days}); profiles may need a refresh")

    # The bundle must match the per-record source files it is built from.
    files = {f: json.load(open(f, encoding="utf-8")) for f in sorted(glob.glob("data/actors/*.json"))}
    by_id = {a.get("id"): a for a in actors if isinstance(a, dict)}
    file_ids = {os.path.basename(f)[:-5] for f in files}
    for missing in sorted(file_ids - set(by_id)):
        error("bundle", f"data/actors/{missing}.json is not in the bundle; run scripts/build_pages.py")
    for extra in sorted(set(by_id) - file_ids):
        error("bundle", f"actor {extra} has no data/actors/{extra}.json")
    for f, record in files.items():
        aid = os.path.basename(f)[:-5]
        if record.get("id") != aid:
            error(f, f"id '{record.get('id')}' does not match the file name")
        elif aid in by_id and by_id[aid] != record:
            error(f"actor {aid}", "bundle copy differs from data/actors; run scripts/build_pages.py")
    scen_files = sorted(glob.glob("data/scenarios/*.json"))
    if len(scen_files) != len(scenarios):
        error("bundle", f"{len(scenarios)} scenarios in the bundle but {len(scen_files)} in data/scenarios; run scripts/build_pages.py")

    # Root index.html must stay in sync with app/index.html.
    if os.path.exists("app/index.html") and os.path.exists("index.html"):
        app_html = open("app/index.html", encoding="utf-8").read()
        root_html = open("index.html", encoding="utf-8").read()
        if f"<body>\n{app_html}\n</body>" not in root_html:
            error("index.html", "root index.html is out of sync with app/index.html; run scripts/build_pages.py")

    print(f"Checked {len(actors)} actors and {len(scenarios)} scenarios, exported {exported}.")
    return finish()


def finish():
    for w in warnings:
        print(f"WARNING {w}")
    for e in errors:
        print(f"ERROR {e}")
    print(f"{len(errors)} error(s), {len(warnings)} warning(s).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
