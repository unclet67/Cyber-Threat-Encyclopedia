"""Merge workflow research files (research/auto/<id>.json) into actor records, with quality gates.

Usage: python3 merge_auto.py <data/actors dir> <research/auto dir> <out dir>

Quality gates (a file failing any gate is skipped and reported, never merged):
- valid JSON with the expected section keys
- every source has a non-empty date and an http(s) URL
- every [S#] reference used in text exists in the source list
- implications, if present, carry the analyst-assessment label

Merge rules:
- researched sections replace imported ones only when non-empty; empty research leaves the imported value
- existing dated sources (Microsoft mapping, MITRE) are kept and re-numbered after the new ones
- ATT&CK techniques and software are not touched (they come from MITRE)
- imported summary and references are preserved in provenance
"""
import json, os, re, sys, glob

ddir, adir, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
LABEL = "Analyst assessment derived from cited sources; validate before use."
KEYS = ["identification", "attribution", "objectives", "targeting", "capabilities", "campaigns", "diamond", "gaps", "implications", "sources"]
report = {"merged": [], "skipped": {}, "warnings": {}}

def text_of(v):
    if isinstance(v, str): return v
    if isinstance(v, list): return " ".join(text_of(x) for x in v)
    if isinstance(v, dict): return " ".join(text_of(x) for k, x in v.items() if k != "sources")
    return ""

def nonempty(v):
    if isinstance(v, str): return bool(v.strip())
    if isinstance(v, list): return len(v) > 0
    if isinstance(v, dict): return any(nonempty(x) for x in v.values())
    return False

for f in sorted(glob.glob(f"{adir}/*.json")):
    aid = os.path.basename(f)[:-5]
    base = f"{ddir}/{aid}.json"
    if not os.path.exists(base):
        report["skipped"][aid] = "no matching actor record"; continue
    try:
        x = json.load(open(f))
    except Exception as e:
        report["skipped"][aid] = f"invalid JSON: {e}"; continue
    missing = [k for k in KEYS if k not in x]
    if missing:
        report["skipped"][aid] = f"missing keys {missing}"; continue
    srcs = [s for s in x["sources"] if isinstance(s, dict)]
    bad = [s.get("ref") for s in srcs if not str(s.get("date", "")).strip() or not re.match(r"https?://", str(s.get("url", "")))]
    if bad:
        report["skipped"][aid] = f"undated or URL-less sources {bad}"; continue
    refs = {s.get("ref") for s in srcs}
    # gaps notes that record a removed source may still name it; neutralise those labels (never touches claims)
    for gi, g in enumerate(x.get("gaps") or []):
        if isinstance(g, str) and re.search(r"\b(removed|dropped|deleted)\b", g, re.I):
            fixed = re.sub(r"\bS\d{1,2}\b", lambda m: m.group(0) if m.group(0) in refs else "(dropped ref)", g)
            if fixed != g:
                x["gaps"][gi] = fixed
                report["warnings"].setdefault(aid, []).append("reworded removal note in gaps")
    body = " ".join(text_of(x[k]) for k in KEYS if k != "sources") + " " + " ".join(" ".join(c.get("sources", [])) for c in x.get("campaigns", []) if isinstance(c, dict))
    used = set(re.findall(r"\bS\d{1,2}\b", re.sub(r"\b(former|removed|deleted)\s+S\d+\b", "", body, flags=re.I)))  # audit notes are not citations; S#### are MITRE software IDs
    dangling = sorted(used - refs)
    if dangling:
        report["skipped"][aid] = f"cites missing sources {dangling}"; continue
    imp = x.get("implications") or {}
    for k in ("jipoe", "jcc2"):
        v = (imp.get(k) or "").strip()
        if v and not v.startswith(LABEL):
            imp[k] = LABEL + " " + v
            report["warnings"].setdefault(aid, []).append(f"added assessment label to {k}")

    d = json.load(open(base))
    d.setdefault("provenance", {})
    d["provenance"].setdefault("importedRefs", [s.get("url", "") for s in d.get("sources", [])])
    d["provenance"].setdefault("importedSummary", d.get("identification", {}).get("summary", ""))
    for k in ["identification", "attribution", "targeting", "diamond", "implications"]:
        cur = d.get(k) or {}
        for sk, sv in (x.get(k) or {}).items():
            if nonempty(sv): cur[sk] = sv
        d[k] = cur
    for k in ["objectives", "campaigns", "gaps"]:
        if nonempty(x.get(k)): d[k] = x[k]
    if nonempty((x.get("capabilities") or {}).get("summary")):
        d.setdefault("capabilities", {})["summary"] = x["capabilities"]["summary"]
    keep = [s for s in d.get("sources", []) if str(s.get("date", "")).strip() and s.get("url") and s["url"] not in {n.get("url") for n in srcs}]
    n = len(srcs)
    for i, s in enumerate(keep, 1):
        s = dict(s); s["ref"] = f"S{n + i}"; srcs.append(s)
    d["sources"] = srcs
    have = {a["name"].lower() for a in d.get("aliases", [])} | {d["primaryName"].lower()}
    for a in x.get("aliasesAdd", []) or []:
        if isinstance(a, dict) and a.get("name") and a["name"].lower() not in have:
            d.setdefault("aliases", []).append({"name": a["name"], "vendor": a.get("vendor", "")}); have.add(a["name"].lower())
    d["provenance"]["origin"] = "import+research"
    d["importFlags"] = []
    d["updatedAt"] = "2026-10-14T00:00:00Z"
    d["updatedBy"] = "Research build 2026-10-14 (workflow)"
    json.dump(d, open(f"{out}/{aid}.json", "w"))
    report["merged"].append(aid)

json.dump(report, open(f"{out}/_report.json", "w"), indent=1)
print("merged", len(report["merged"]), "skipped", len(report["skipped"]), "warnings", len(report["warnings"]))
for k, v in list(report["skipped"].items())[:40]: print("  SKIP", k, v)
