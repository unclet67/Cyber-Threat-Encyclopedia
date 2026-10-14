"""Build the GitHub Pages version of the encyclopedia.

Usage: python3 scripts/build_pages.py   (run from the repo root)

- index.html: app/index.html wrapped in the same document skeleton claude.ai adds when it publishes
  the Artifact (doctype, charset, viewport, base reset), so GitHub Pages renders it identically.
- data/bundle.json: every actor record plus scenarios, which the page loads in read-only mode when
  the claude.ai database is not available.
"""
import glob, json

RESET = (":root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
         "body{margin:0;font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif}"
         "img{max-width:100%}[hidden]{display:none!important}")
app = open("app/index.html", encoding="utf-8").read()
page = ("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">"
        f"<style>{RESET}</style></head><body>\n{app}\n</body></html>\n")
open("index.html", "w", encoding="utf-8").write(page)

actors = [json.load(open(f, encoding="utf-8")) for f in sorted(glob.glob("data/actors/*.json"))]
scen = [json.load(open(f, encoding="utf-8")) for f in sorted(glob.glob("data/scenarios/*.json"))]
for f, s in zip(sorted(glob.glob("data/scenarios/*.json")), scen):
    s.setdefault("id", f.split("/")[-1][:-5])
exported = max((a.get("updatedAt", "") for a in actors), default="")[:10]
json.dump({"exported": exported, "actors": actors, "scenarios": scen}, open("data/bundle.json", "w", encoding="utf-8"), separators=(",", ":"))
print(f"index.html written; bundle: {len(actors)} actors, {len(scen)} scenarios, exported {exported}")
