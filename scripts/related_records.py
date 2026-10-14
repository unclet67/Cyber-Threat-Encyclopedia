"""Add sourced two-way 'overlapping record' links instead of merging records whose vendor cluster boundaries differ.

Usage: python3 related_records.py <data/actors dir> <out dir>   (writes changed records to out dir, updates out/plan.json)
"""
import json, os, sys
ddir, out = sys.argv[1:3]
LINKS = [
    ("flax-typhoon", "redjuliett", "Lumen Black Lotus Labs lists RedJuliett (Recorded Future) as overlapping Flax Typhoon in its Sept 2024 Raptor Train reporting. Microsoft's mapping does not list RedJuliett under Flax Typhoon. Kept as separate records."),
    ("mint-sandstorm", "apt42", "Google/Mandiant APT42 overlaps part of Mint Sandstorm activity; coverage of the 2024 IRGC indictment uses 'Mint Sandstorm or APT42' interchangeably. Microsoft's mapping does not list APT42 under Mint Sandstorm. Kept as separate records."),
    ("smoke-sandstorm", "ta455", "MITRE's NIMBUS MANTICORE (G1059) lists Proofpoint's TA455 alongside UNC1549, which Microsoft maps to Smoke Sandstorm. Kept as separate records pending vendor-level confirmation."),
]
plan = json.load(open(f"{out}/plan.json"))
def load(i):
    p = f"{out}/{i}.json"
    return json.load(open(p if os.path.exists(p) else f"{ddir}/{i}.json"))
for a, b, note in LINKS:
    for x, y in ((a, b), (b, a)):
        d = load(x)
        rr = d.setdefault("relatedRecords", [])
        if not any(r["id"] == y for r in rr):
            rr.append({"id": y, "note": note})
            json.dump(d, open(f"{out}/{x}.json", "w"))
            if x not in plan["created"] and x not in plan["updated"]:
                plan["updated"].append(x)
json.dump(plan, open(f"{out}/plan.json", "w"))
print("updated", plan["updated"])
