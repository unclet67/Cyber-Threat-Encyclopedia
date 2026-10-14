"""Merge a researched profile (research/<name>_extra.json) into an actor record.

Usage: python3 merge_research.py <actor.json> <extra.json> <mitre_GXXXX.json> <tech_lookup.json> <ms.json> <out.json>

- Replaces the analytic sections with the researched content.
- Replaces ATT&CK techniques and software with the current MITRE group mapping (tactics attached).
- Drops pseudo-aliases (bare MITRE group IDs) and moves names that Microsoft assigns to a
  different actor out of the alias list into relatedMs.
- Keeps the imported summary and references in provenance for audit.
"""
import json, re, sys

actor, extra, mitre, tech, msmap, out = sys.argv[1:7]
d = json.load(open(actor))
x = json.load(open(extra))
m = json.load(open(mitre))
t = json.load(open(tech))
ms = json.load(open(msmap))

entries = {e["Threat actor name"]: [n.strip() for n in e["Other names"].split(",") if n.strip()] for e in ms}
GENERIC = {"labyrinth chollima", "emissary panda", "apt27", "imperial kitten", "velvet chollima"}
own = {n.lower() for n in entries.get(d["primaryName"], [])} | {d["primaryName"].lower()}
owner = {}
for name, others in entries.items():
    if name == d["primaryName"]:
        continue
    for n in [name] + others:
        k = n.lower()
        if k not in GENERIC and k not in own:
            owner.setdefault(k, name)

# Manual moves where the merge used umbrella labels MITRE also tracks separately.
MANUAL = {
    "diamond-sleet": {
        "apt38": "Sapphire Sleet", "apt 38": "Sapphire Sleet", "beagleboyz": "Sapphire Sleet", "bluenoroff": "Sapphire Sleet",
        "subgroup: bluenoroff": "Sapphire Sleet", "stardust chollima": "Sapphire Sleet", "cryptocore": "Sapphire Sleet",
        "andariel": "Onyx Sleet", "subgroup: andariel": "Onyx Sleet", "apt45": "Onyx Sleet", "silent chollima": "Onyx Sleet",
        "stonefly": "Onyx Sleet", "plutonium": "Onyx Sleet", "dark seoul": "Onyx Sleet", "darkseoul": "Onyx Sleet", "operation darkseoul": "Onyx Sleet",
        "tradertraitor": "Jade Sleet", "unc4899": "Jade Sleet", "storm-0954": "Jade Sleet",
        "applejeus": "Citrine Sleet", "operation applejeus": "Citrine Sleet", "unc4736": "Citrine Sleet", "storm-0139": "Citrine Sleet", "storm-1222": "Citrine Sleet", "dev-1222": "Citrine Sleet", "dev-0139": "Citrine Sleet",
        "storm-1789": "Moonstone Sleet",
    },
}
manual = MANUAL.get(d["id"], {})

kept, moved = [], {}
for a in d["aliases"]:
    k = a["name"].lower()
    if re.fullmatch(r"g\d{4}", k):
        continue
    target = manual.get(k) or owner.get(k)
    if target:
        moved.setdefault(target, []).append(a["name"])
    else:
        kept.append(a)
d["aliases"] = kept
rel = {r["name"]: r for r in d.get("relatedMs", [])}
for target, names in moved.items():
    r = rel.setdefault(target, {"name": target, "note": f"Separate Microsoft actor: {', '.join(entries.get(target, [])[:6])}"})
    r["note"] = r["note"].rstrip(".") + f". Names moved from this record's source merge: {', '.join(sorted(set(names)))}."
d["relatedMs"] = list(rel.values())

d.setdefault("provenance", {})
d["provenance"]["importedRefs"] = [s.get("url", "") for s in d.get("sources", [])]
d["provenance"]["importedSummary"] = d["identification"].get("summary", "")
d["provenance"]["origin"] = "import+research"
for k in ["identification", "attribution", "objectives", "targeting", "campaigns", "diamond", "gaps", "implications", "sources"]:
    d[k] = x[k]
d["capabilities"] = {
    "summary": x["capabilities"]["summary"],
    "software": [{"id": i, "name": n, "type": ty} for i, n, ty in m["sw"]],
}
src = f"MITRE ATT&CK {x['mitre']} ({m['modified'][:10]})"
d["attack"] = [{"id": i, "name": n, "source": src, "tactics": t.get(i, {}).get("tactics", [])} for i, n in m["tech"]]
d["mitreGroupId"] = x["mitre"]
d["importFlags"] = []
d["updatedAt"] = "2026-10-14T00:00:00Z"
d["updatedBy"] = "Research build 2026-10-14"
json.dump(d, open(out, "w"), indent=1)
print(d["id"], "aliases", len(d["aliases"]), "moved", {k: len(v) for k, v in moved.items()}, "attack", len(d["attack"]), "sw", len(d["capabilities"]["software"]))
