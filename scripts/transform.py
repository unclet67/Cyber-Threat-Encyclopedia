"""Transform actors.json (uploaded encyclopedia database) into encyclopedia profile docs.

Rules: never invent content. Fields the source does not carry stay empty, and the
page renders empty sections as "Research Required".
"""
import json, re, sys, os
from collections import Counter, defaultdict

src, out_dir = sys.argv[1], sys.argv[2]
db = json.load(open(src))
COUNTRIES = {"CN": "China", "RU": "Russia", "IR": "Iran", "KP": "North Korea"}
MS_WEATHER = re.compile(r"^[A-Z][a-z]+ (Typhoon|Blizzard|Sandstorm|Sleet)$")
MS_STORM = re.compile(r"^(Storm|DEV)-\d{4}$", re.I)

# Vendor inferred from each vendor's published naming syntax (see naming catalog).
VENDOR_RULES = [
    (MS_WEATHER, "Microsoft"),
    (MS_STORM, "Microsoft (in-development designation)"),
    (re.compile(r"^(APT\d+|UNC\d+|TEMP\.\w+|FIN\d+)$", re.I), "Mandiant / Google TI"),
    (re.compile(r"\b(Panda|Bear|Kitten|Chollima|Spider)$", re.I), "CrowdStrike"),
    (re.compile(r"\b(Taurus|Ursa|Serpens|Pisces)$", re.I), "Palo Alto Unit 42"),
    (re.compile(r"^(BRONZE|IRON|COBALT|NICKEL)\s", re.I), "Secureworks CTU"),
    (re.compile(r"^(Earth|Water)\s[A-Z]", ), "Trend Micro"),
    (re.compile(r"^TA\d{3,4}$"), "Proofpoint"),
    (re.compile(r"^TAG-\d+$"), "Recorded Future"),
    (re.compile(r"^[A-Z]+ITE$"), "Dragos"),
    (re.compile(r"^G\d{4}$"), "MITRE ATT&CK"),
]

def vendor(n):
    for rx, v in VENDOR_RULES:
        if rx.search(n):
            return v
    return "Other / unspecified"

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80]

items = [i for i in db["items"] if i["countryCode"] in COUNTRIES]
docs, ids = [], Counter()
for it in items:
    names = [it["name"]] + it["aliases"]
    seen, aliases = set(), []
    for n in names:
        k = n.strip().lower()
        if k and k not in seen:
            seen.add(k); aliases.append(n.strip())
    ms = sorted({n for n in aliases if MS_WEATHER.match(n)})
    flags = []
    if len(ms) == 1:
        primary = ms[0]
    else:
        primary = it["name"]
        if len(ms) > 1:
            flags.append("Microsoft name conflict: source record merges " + ", ".join(ms) +
                         ". Verify which Microsoft actor this cluster maps to.")
        else:
            flags.append("No Microsoft weather-family name in source record.")
    alias_objs = [{"name": n, "vendor": vendor(n)} for n in aliases if n != primary]
    sid = slug(primary)
    ids[sid] += 1
    if ids[sid] > 1:
        sid = f"{sid}-{ids[sid]}"
    techniques = [{"id": t["id"], "name": t["name"], "source": "MITRE ATT&CK (via import)"} for t in it["techniques"]]
    docs.append({
        "id": sid,
        "primaryName": primary,
        "msName": primary if MS_WEATHER.match(primary) else "",
        "msCandidates": ms,
        "country": it["countryCode"],
        "aliases": alias_objs,
        "mitreGroupId": it["gid"],
        "identification": {"summary": it["description"].strip(), "firstObserved": "", "notes": ""},
        "attribution": {"sponsor": "", "confidence": "", "basis": ""},
        "objectives": "",
        "targeting": {"sectors": [], "regions": [], "notes": ""},
        "capabilities": {"summary": "", "software": it["software"]},
        "attack": techniques,
        "campaigns": [],
        "diamond": {"adversary": "", "capability": "", "infrastructure": "", "victim": ""},
        "gaps": [],
        "implications": {"jipoe": "", "jcc2": ""},
        "sources": [{"title": "", "publisher": "", "date": "", "url": u} for u in it["refs"]],
        "importFlags": flags,
        "provenance": {
            "origin": "import",
            "file": "actors.json",
            "generated": db["generated"],
            "upstream": it["sources"],
        },
        "updatedAt": db["generated"],
        "updatedBy": "",
    })

dupes = [k for k, v in Counter(d["msName"] for d in docs if d["msName"]).items() if v > 1]
for d in docs:
    if d["msName"] in dupes:
        d["importFlags"].append(f"Microsoft name '{d['msName']}' is also the primary name of another imported record. Deconflict.")

os.makedirs(out_dir, exist_ok=True)
json.dump(docs, open(os.path.join(out_dir, "docs.json"), "w"))
c = Counter(d["country"] for d in docs)
print(len(docs), dict(c), "ms-primary:", sum(1 for d in docs if d["msName"]),
      "conflicts:", sum(1 for d in docs if d["msCandidates"] and len(d["msCandidates"]) > 1), "dupes:", dupes)
print("max doc bytes", max(len(json.dumps(d)) for d in docs), "total", sum(len(json.dumps(d)) for d in docs))
