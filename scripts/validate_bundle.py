"""Validate data/bundle.json before it reaches GitHub Pages.

Usage: python3 scripts/validate_bundle.py [--max-age-days N]   (run from the repo root)

Errors fail the run (exit 1):
- bundle structure and the required fields and types on every actor and scenario
- duplicate or malformed actor ids, unknown country codes, malformed ATT&CK group ids
- [Sn] citations that point at no source in the same record, sources without an http(s) url
- "exported" missing, in the future, or not equal to the newest actor updatedAt
- bundle out of sync with data/actors/ and data/scenarios/ (rebuild with scripts/build_pages.py)

Warnings are reported but do not fail the run:
- bare sources missing a ref, title, publisher or date, and a ref used twice in one record
- an export older than --max-age-days (default 90)

Inside GitHub Actions each finding is also printed as a workflow annotation.
"""
import argparse, datetime, glob, json, os, re, sys

BUNDLE = "data/bundle.json"
COUNTRIES = {"CN", "RU", "IR", "KP", "FIN", "DEV", "OTH", "PSOA"}
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
    "implications": ("jipoe", "jcc2"),
}
SCENARIO_FIELDS = {"id": str, "title": str, "injects": list}
ID_RE = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
GROUP_RE = re.compile(r"G\d{4}")
TIMESTAMP_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z")
DATE_RE = re.compile(r"(19|20)\d{2}")
CITE_RE = re.compile(r"\[(S\d+)\]")

errors, warnings = [], []
in_actions = os.environ.get("GITHUB_ACTIONS") == "true"


def report(bucket, level, where, msg):
    bucket.append(f"{where}: {msg}")
    if in_actions:
        print(f"::{level} file={BUNDLE},title=Bundle check::{where}: {msg}")


def error(where, msg): report(errors, "error", where, msg)
def warn(where, msg): report(warnings, "warning", where, msg)


def check_actor(a, seen):
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

    refs = []
    for i, s in enumerate(a.get("sources") or []):
        sw = f"{where} source {s.get('ref', '#' + str(i + 1)) if isinstance(s, dict) else '#' + str(i + 1)}"
        if not isinstance(s, dict):
            error(sw, "is not an object")
            continue
        if not isinstance(s.get("url"), str) or not s["url"].startswith(("http://", "https://")):
            error(sw, "url is missing or not http(s)")
        if "ref" in s:
            refs.append(s["ref"])
        gaps = [k for k in ("ref", "title", "publisher") if not str(s.get(k, "")).strip()]
        if not DATE_RE.match(str(s.get("date", ""))):
            gaps.append("date")
        if gaps:
            warn(sw, f"bare reference, missing {', '.join(gaps)}")
    for ref in sorted({r for r in refs if refs.count(r) > 1}):
        warn(where, f"source ref {ref} is used by more than one source, so its citations are ambiguous")
    body = json.dumps({k: v for k, v in a.items() if k not in ("sources", "provenance")})
    for ref in sorted(set(CITE_RE.findall(body)) - set(refs)):
        error(where, f"cites [{ref}] but has no source with that ref")


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

    seen = set()
    for a in actors:
        if isinstance(a, dict):
            check_actor(a, seen)
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
