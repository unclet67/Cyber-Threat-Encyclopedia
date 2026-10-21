"""Bring the encyclopedia in line with Microsoft's full actor list for CN/RU/IR/KP.

Usage: python3 ms_complete.py <data/actors dir> <ms.json> <ea.json (MITRE STIX)> <tech_lookup.json> <out dir>

1. Creates a record for every Microsoft-named CN/RU/IR/KP actor that has none. Content comes only from
   MicrosoftMapping.json and, where MITRE lists the Microsoft name (or Microsoft lists the MITRE group's name),
   the MITRE ATT&CK group. Everything else is left empty (Research Required).
2. Cleans every record's aliases: drops bare MITRE IDs (G####) and moves names that Microsoft assigns to a
   different actor into relatedMs.
3. Refreshes ATT&CK techniques and software for imported (not researched) records from their own MITRE group.
Writes only records that changed, and a plan.json listing creates and updates.
"""
import json, os, re, sys, glob, collections, time
NOW = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())  # updatedAt stamp; drives the Pages export date

ddir, msp, eap, techp, out = sys.argv[1:6]
ms = json.load(open(msp)); tech = json.load(open(techp))
objs = json.load(open(eap))["objects"]
ext = lambda o: next((r["external_id"] for r in o.get("external_references", []) if r.get("source_name") == "mitre-attack"), "")
byid = {o["id"]: o for o in objs}
groups = {ext(o): o for o in objs if o["type"] == "intrusion-set" and not o.get("revoked") and not o.get("x_mitre_deprecated")}
uses = collections.defaultdict(list)
for r in objs:
    if r["type"] == "relationship" and r["relationship_type"] == "uses" and not r.get("revoked") and not r.get("x_mitre_deprecated"):
        uses[r["source_ref"]].append(r["target_ref"])

def mitre(gid):
    g = groups[gid]; tt, sw = set(), set()
    for t in uses[g["id"]]:
        o = byid.get(t)
        if not o or o.get("revoked") or o.get("x_mitre_deprecated"): continue
        if o["type"] == "attack-pattern": tt.add((ext(o), o["name"]))
        elif o["type"] in ("malware", "tool"): sw.add((ext(o), o["name"], o["type"]))
    src = f"MITRE ATT&CK {gid} ({g['modified'][:10]})"
    return ([{"id": i, "name": n, "source": src, "tactics": tech.get(i, {}).get("tactics", [])} for i, n in sorted(tt)],
            [{"id": i, "name": n, "type": ty} for i, n, ty in sorted(sw)], g)

C = {"China": "CN", "Russia": "RU", "Iran": "IR", "North Korea": "KP"}
def category(origin):
    c = next((v for k, v in C.items() if k in origin), None)
    if c: return c
    if "Financially motivated" in origin: return "FIN"
    if "Private sector offensive actor" in origin: return "PSOA"
    if origin.strip() == "Group in development": return "DEV"
    return "OTH"
ENT = {e["Threat actor name"]: {"origin": e["Origin/Threat"], "other": [x.strip() for x in e["Other names"].split(",") if x.strip()]} for e in ms}
count = collections.Counter(n.lower() for k, v in ENT.items() for n in set([k] + v["other"]))
GENERIC = {n for n, c in count.items() if c > 1}
OWNER = {}
for k, v in ENT.items():
    for n in [k] + v["other"]:
        if n.lower() not in GENERIC: OWNER[n.lower()] = k
# MITRE groups that list a Microsoft name exactly: their aliases belong to that Microsoft actor too.
for gid, g in groups.items():
    names = {a.lower() for a in g.get("aliases", [])} | {g["name"].lower()}
    ms_hit = [k for k in ENT if k.lower() in names]
    if len(ms_hit) == 1:
        for n in names:
            if n not in GENERIC and n not in OWNER and not re.fullmatch(r"g\d{4}", n):
                OWNER[n] = ms_hit[0]
# APT29 vendor names absent from both Microsoft's and MITRE's lists but listed as APT29 in the
# cti_provider_actor_naming_catalog (BlueBravo, Cloaked Ursa) and in vendor reporting.
for n in ["bluebravo", "cloaked ursa", "darkhalo", "seaduke", "stellarparticle"]:
    OWNER.setdefault(n, "Midnight Blizzard")
MAPURL = "https://github.com/microsoft/mstic/blob/master/PublicFeeds/ThreatActorNaming/MicrosoftMapping.json"
MS_SRC = {"ref": "MS", "title": "Microsoft threat actor naming mapping (MicrosoftMapping.json)", "publisher": "Microsoft Threat Intelligence", "date": "2026-10-14 (retrieved)", "url": MAPURL}

VENDOR = [
    (r"^[A-Z][a-z]+ (Typhoon|Blizzard|Sandstorm|Sleet|Tempest|Flood)$", "Microsoft"), (r"^(Storm|DEV)-\d{4}$", "Microsoft (in-development designation)"),
    (r"^[A-Z]+IUM$|^(ZINC|LEAD|IODINE|BARIUM|HYDROGEN|THALLIUM|OSMIUM|CERIUM|SODIUM|HELIUM|MANGANESE|IRIDIUM|NOBELIUM|STRONTIUM|PHOSPHORUS|AMERICIUM|COPERNICIUM|PLUTONIUM|SCANDIUM|TANTALUM|ACTINIUM|CURIUM)$", "Microsoft (legacy element name)"),
    (r"^(APT\d+|UNC\d+|TEMP\.\w+)$", "Mandiant / Google TI"), (r"(?i)\b(Panda|Bear|Kitten|Chollima|Spider)$", "CrowdStrike"),
    (r"(?i)\b(Taurus|Ursa|Serpens|Pisces)$", "Palo Alto Unit 42"), (r"(?i)^(BRONZE|IRON|COBALT|NICKEL)\s", "Secureworks CTU"),
    (r"^(Earth|Water)\s[A-Z]", "Trend Micro"), (r"^TA\d{3,4}$", "Proofpoint"), (r"^TAG-\d+$", "Recorded Future"), (r"^[A-Z]+ITE$", "Dragos")]
def vendor(n):
    for rx, v in VENDOR:
        if re.search(rx, n): return v
    return "Other / unspecified"
slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80]

docs = {os.path.basename(f)[:-5]: json.load(open(f)) for f in glob.glob(f"{ddir}/*.json")}
orig = json.loads(json.dumps(docs))
primaries = {d["primaryName"] for d in docs.values()}

# Explicit MITRE matches (MITRE lists the Microsoft name, or Microsoft lists the MITRE group name).
MATCH = {"Brass Typhoon": "G0096", "Mulberry Typhoon": "G1023", "Heart Typhoon": "G0025", "Leopard Typhoon": "G0044",
         "Pink Sandstorm": "G1030", "Smoke Sandstorm": "G1059", "Citrine Sleet": "G1049", "Moonstone Sleet": "G1036",
         "Onyx Sleet": "G0138", "Sapphire Sleet": "G0082", "Midnight Blizzard": "G0016"}
MATCH_NOTE = {"Smoke Sandstorm": "MITRE match is via the shared alias UNC1549 (MITRE group NIMBUS MANTICORE, G1059); cluster scopes may differ. Verify before relying on the ATT&CK list.",
              "Heart Typhoon": "MITRE match is via APT17 (G0025), a name Microsoft lists for Heart Typhoon.",
              "Leopard Typhoon": "MITRE match is via Winnti Group (G0044), a name Microsoft lists for Leopard Typhoon."}

created = []
for name, e in ENT.items():
    c = category(e["origin"])
    if name in primaries: continue
    if any(name in v["other"] for k, v in ENT.items() if k != name): continue  # renamed designations (e.g. Storm-1516 -> Neva Flood)
    sid = slug(name); assert sid not in docs, sid
    al = [{"name": n, "vendor": vendor(n)} for n in e["other"]]
    attack, sw, summary, gid, notes = [], [], "", "", f"Microsoft name: {name} ({e['origin']}). Other names per Microsoft: {', '.join(e['other']) or 'none listed'}."
    sources = [dict(MS_SRC)]
    if name not in MATCH:
        hits = [gid for gid, g in groups.items() if name.lower() in {a.lower() for a in g.get("aliases", []) + [g["name"]]}]
        if len(hits) == 1: MATCH[name] = hits[0]
    if name in MATCH:
        gid = MATCH[name]; attack, sw, g = mitre(gid)
        summary = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", re.sub(r"\(Citation:[^)]*\)", "", g.get("description", ""))).strip()
        have = {a["name"].lower() for a in al} | {name.lower()}
        al += [{"name": a, "vendor": vendor(a)} for a in g.get("aliases", []) if a.lower() not in have and OWNER.get(a.lower(), name) == name]
        sources.append({"ref": "M", "title": f"{g['name']}, {gid} (description, techniques and software)", "publisher": "MITRE ATT&CK", "date": f"{g['modified'][:10]} (object modified)", "url": f"https://attack.mitre.org/groups/{gid}/"})
        if name in MATCH_NOTE: notes += " " + MATCH_NOTE[name]
    docs[sid] = {
        "id": sid, "primaryName": name, "msName": name, "msCandidates": [], "country": c, "origin": e["origin"], "aliases": al, "relatedMs": [],
        "mitreGroupId": gid,
        "identification": {"summary": summary, "firstObserved": "", "notes": notes},
        "attribution": {"sponsor": "", "confidence": "", "basis": ""}, "objectives": "",
        "targeting": {"sectors": [], "regions": [], "notes": ""},
        "capabilities": {"summary": "", "software": sw}, "attack": attack, "campaigns": [],
        "diamond": {"adversary": "", "capability": "", "infrastructure": "", "victim": ""}, "gaps": [],
        "implications": {"jipoe": "", "jcc2": ""}, "sources": sources, "importFlags": [],
        "provenance": {"origin": "microsoft-mapping", "file": "MicrosoftMapping.json", "generated": "2026-10-14", "upstream": ["Microsoft Threat Intelligence"] + (["MITRE ATT&CK"] if gid else [])},
        "updatedAt": NOW, "updatedBy": "Microsoft name completion",
    }
    created.append(sid); primaries.add(name)

for sid, d in docs.items():
    if sid in created: continue
    own = {n.lower() for n in ENT.get(d["primaryName"], {}).get("other", [])} | {d["primaryName"].lower()}
    kept, moved = [], collections.defaultdict(list)
    for a in d["aliases"]:
        k = a["name"].lower()
        if re.fullmatch(r"g\d{4}", k): continue
        tgt = OWNER.get(k)
        if tgt and tgt != d["primaryName"] and k not in own: moved[tgt].append(a["name"])
        else: kept.append(a)
    d["aliases"] = kept
    rel = {r["name"]: r for r in d.get("relatedMs", [])}
    for tgt, names in moved.items():
        r = rel.setdefault(tgt, {"name": tgt, "note": f"Separate Microsoft actor ({ENT[tgt]['origin']}): {', '.join(ENT[tgt]['other'][:6])}"})
        if "merge:" not in r["note"]:
            r["note"] = r["note"].rstrip(".") + f". Names moved from this record's source merge: {', '.join(sorted(set(names)))}."
        else:
            listed = {x.strip() for x in r["note"].split("merge:")[-1].rstrip(".").split(",")}
            add = sorted(set(names) - listed)
            if add:
                r["note"] = r["note"].rstrip(".") + f", {', '.join(add)}."
    d["relatedMs"] = list(rel.values())
    if d.get("provenance", {}).get("origin") == "import" and d.get("mitreGroupId") in groups:
        d["attack"], d["capabilities"]["software"], _ = mitre(d["mitreGroupId"])
    if d != orig[sid]:
        d["updatedAt"] = NOW

os.makedirs(out, exist_ok=True)
changed = [sid for sid in docs if sid in created or docs[sid] != orig[sid]]
for sid in changed:
    json.dump(docs[sid], open(f"{out}/{sid}.json", "w"))
json.dump({"created": created, "updated": [s for s in changed if s not in created]}, open(f"{out}/plan.json", "w"))
print("created", len(created), created)
print("updated", len(changed) - len(created))
print("moved-alias records", sum(1 for s in changed if s not in created and docs[s]["aliases"] != orig[s]["aliases"]))
print("attack refreshed", sum(1 for s in changed if s not in created and docs[s]["attack"] != orig[s]["attack"]))
