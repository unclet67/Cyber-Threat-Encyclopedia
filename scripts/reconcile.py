"""Reconcile imported records with Microsoft's official mapping, add ATT&CK tactics, merge researched profiles.

Inputs: build/out/docs.json (as written to the db, all version 1), src2/ms.json, src2/tech_lookup.json,
src2/mitre_G1045.json, build/{salt,flax}_extra.json. Output: build/out2/ (docs, deletes, batches, report).
"""
import json, os, re, sys, time
NOW = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())  # updatedAt stamp; drives the Pages export date
S = sys.argv[1]
B = f"{S}/build"
docs = json.load(open(f"{B}/out/docs.json"))
ms = json.load(open(f"{S}/src2/ms.json"))
tech = json.load(open(f"{S}/src2/tech_lookup.json"))
MAPURL = "https://github.com/microsoft/mstic/blob/master/PublicFeeds/ThreatActorNaming/MicrosoftMapping.json"
MS_SRC = {"title": "Microsoft threat actor naming mapping (MicrosoftMapping.json)", "publisher": "Microsoft Threat Intelligence", "date": "2026-10-14 (retrieved)", "url": MAPURL}

MSN = {e["Threat actor name"]: {"origin": e["Origin/Threat"], "other": [x.strip() for x in e["Other names"].split(",") if x.strip()]} for e in ms}
MSN_L = {k.lower(): k for k in MSN}

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80]

# Resolutions decided from MicrosoftMapping.json (see report): record id -> Microsoft primary
RESOLVE = {
    "apt12": "Hexagon Typhoon", "apt18": "Satin Typhoon", "apt28": "Forest Blizzard",
    "curium": "Crimson Sandstorm", "kimsuky": "Emerald Sleet", "lazarus-group": "Diamond Sleet",
    "threat-group-3390": "Linen Typhoon", "pink-sandstorm": "Twill Typhoon",
    "indrik-spider": "Manatee Tempest", "wizard-spider": "Periwinkle Tempest", "storm-1516": "Neva Flood",
    "storm-0940": "Storm-0940",
    "carbanak": "Sangria Tempest", "cinnamon-tempest": "Cinnamon Tempest", "dragonbridge": "Taizi Flood",
    "hexane": "Storm-0133", "invisimole": "Storm-0593", "romcom": "Storm-0978", "ruza-flood": "Ruza Flood",
    "sefid-flood": "Sefid Flood", "storm-1175": "Storm-1175", "storm-1679": "Oka Flood", "storm-1982": "Storm-1982",
    "storm-2035": "Storm-2035", "storm-2077": "Storm-2077", "storm-2372": "Storm-2372", "storm-2470": "Storm-2470",
    "storm-2603": "Storm-2603", "ta505": "Spandex Tempest", "ta2101": "Storm-0216", "toddycat": "Storm-0247",
    "vanilla-tempest": "Vanilla Tempest", "volga-flood": "Volga Flood", "yulong-flood": "Yulong Flood",
}
NOTES = {
    "apt28": "Microsoft maps APT28 to Forest Blizzard. Midnight Blizzard is APT29 / NOBELIUM; the source merge listed it in error.",
    "apt12": "Microsoft maps APT12 to Hexagon Typhoon. Mulberry Typhoon is APT5 / MANGANESE.",
    "apt18": "Microsoft maps APT18 to Satin Typhoon. Salmon Typhoon is APT4 / SODIUM.",
    "curium": "Microsoft maps CURIUM to Crimson Sandstorm. Cuboid and Smoke Sandstorm share the CrowdStrike label IMPERIAL KITTEN but are tracked separately by Microsoft.",
    "kimsuky": "Microsoft maps Kimsuky to Emerald Sleet. Opal Sleet (Konni / APT43) and Ruby Sleet (CERIUM) are tracked separately.",
    "lazarus-group": "Microsoft maps 'Lazarus' to Diamond Sleet. Lazarus Group is used as an umbrella term; Microsoft tracks Citrine, Jade, Moonstone, Onyx (Andariel) and Sapphire (BlueNoroff) Sleet as separate actors.",
    "threat-group-3390": "Microsoft lists TG-3390 under Linen Typhoon. Circle Typhoon also carries APT27 / EMISSARY PANDA labels but is tracked separately.",
    "pink-sandstorm": "Primary name corrected: Microsoft maps Mustang Panda to Twill Typhoon (China). Pink Sandstorm is the Iranian actor Agrius; the source merge listed it in error.",
    "indrik-spider": "Microsoft lists Indrik Spider under Manatee Tempest (Russia origin) and also under Mustard Tempest (financially motivated). Manatee Tempest chosen as the Russia-origin match.",
    "wizard-spider": "Microsoft lists Wizard Spider under Periwinkle Tempest (Russia) and Storm-0230. Periwinkle Tempest chosen as the named Russia-origin match.",
    "storm-1516": "Microsoft now tracks Storm-1516 as Neva Flood.",
    "storm-0940": "Microsoft tracks Storm-0940 separately from CovertNetwork-1658, the password-spray infrastructure it uses.",
    "axiom": "Umbrella cluster. Microsoft has no single mapping for Axiom: Brass Typhoon (APT41), Heart Typhoon (APT17) and Leopard Typhoon (Winnti) are separate Microsoft actors that overlap with it. Kept under its source name by design.",
}

def tactic_of(tid):
    t = tech.get(tid)
    return (t or {}).get("tactics", [])

report, deletes, out = [], [], []
taken = {d["id"] for d in docs}
for d in docs:
    old = d["id"]
    d = json.loads(json.dumps(d))
    d.setdefault("relatedMs", [])
    # drop the noisy informational flag
    d["importFlags"] = [f for f in d.get("importFlags", []) if not f.startswith("No Microsoft weather-family")]
    newp = RESOLVE.get(old)
    if newp and newp != d["primaryName"]:
        prev = d["primaryName"]
        d["primaryName"] = newp
        if prev.lower() not in {a["name"].lower() for a in d["aliases"]}:
            d["aliases"].insert(0, {"name": prev, "vendor": "Source record name"})
    if newp:
        d["msName"] = newp
        d["importFlags"] = []
    # move Microsoft names that Microsoft assigns to a different actor out of aliases
    keep = []
    for a in d["aliases"]:
        k = MSN_L.get(a["name"].lower())
        if k and k != d["primaryName"] and k not in (MSN.get(d["primaryName"], {}).get("other", [])):
            d["relatedMs"].append({"name": k, "note": f"Separate Microsoft actor ({MSN[k]['origin']}): {', '.join(MSN[k]['other'][:6])}"})
        else:
            keep.append(a)
    d["aliases"] = [a for a in keep if a["name"] != d["primaryName"]]
    if old in NOTES:
        n = d["identification"].get("notes", "")
        d["identification"]["notes"] = (n + " " if n else "") + "Microsoft mapping: " + NOTES[old]
        d["importFlags"] = []
    if newp or old in NOTES:
        if not any(s.get("url") == MAPURL for s in d["sources"]):
            d["sources"].append(dict(MS_SRC))
        report.append((old, d["primaryName"], len(d["relatedMs"])))
    d["msCandidates"] = []
    for t in d.get("attack", []):
        t["tactics"] = tactic_of(t["id"])
    nid = slug(d["primaryName"]) if newp and newp != "Storm-0940" else old
    if nid != old:
        assert nid not in taken, (old, nid)
        taken.add(nid); deletes.append(old)
    d["id"] = nid
    d["updatedAt"] = NOW
    out.append(d)

byid = {d["id"]: d for d in out}

def merge(did, extra_path, mitre_path=None):
    d, x = byid[did], json.load(open(extra_path))
    d["provenance"]["importedRefs"] = [s["url"] for s in d["sources"]]
    d["provenance"]["importedSummary"] = d["identification"]["summary"]
    d["provenance"]["origin"] = "import+research"
    have = {a["name"].lower() for a in d["aliases"]}
    d["aliases"] += [a for a in x.get("aliasesAdd", []) if a["name"].lower() not in have]
    for k in ["identification", "attribution", "objectives", "targeting", "campaigns", "diamond", "gaps", "implications", "sources"]:
        d[k] = x[k]
    d["capabilities"]["summary"] = x["capabilities"]["summary"]
    if x.get("software"):
        d["capabilities"]["software"] = x["software"]
    if mitre_path:
        m = json.load(open(mitre_path))
        d["attack"] = [{"id": i, "name": n, "source": "MITRE ATT&CK G1045 (2026-09-23)", "tactics": tactic_of(i)} for i, n, _ in m["tech"]]
        d["capabilities"]["software"] = [{"id": i, "name": n, "type": t} for i, n, t in m["sw"]]
    elif x.get("attack"):
        d["attack"] = [dict(t, tactics=tactic_of(t["id"])) for t in x["attack"]]
    d["importFlags"] = []
    d["updatedBy"] = "Research build 2026-10-14"

merge("salt-typhoon", f"{B}/salt_extra.json", f"{S}/src2/mitre_G1045.json")
merge("flax-typhoon", f"{B}/flax_extra.json")

o2 = f"{B}/out2"; os.makedirs(f"{o2}/docs", exist_ok=True)
for f in os.listdir(f"{o2}/docs"): os.remove(f"{o2}/docs/{f}")
for d in out:
    json.dump(d, open(f"{o2}/docs/{d['id']}.json", "w"))
json.dump({"deletes": deletes, "report": report, "ids": [d["id"] for d in out], "renamed": {o: byid_n for o, byid_n in []}}, open(f"{o2}/plan.json", "w"))
print("records", len(out), "renamed/deleted", len(deletes), deletes)
print("resolved", len(report))
print("still flagged", [d["id"] for d in out if d["importFlags"]])
print("with relatedMs", [(d["id"], [r["name"] for r in d["relatedMs"]]) for d in out if d["relatedMs"]])
print("salt", len(byid["salt-typhoon"]["attack"]), "flax", len(byid["flax-typhoon"]["attack"]))
print("max bytes", max(len(json.dumps(d)) for d in out))
