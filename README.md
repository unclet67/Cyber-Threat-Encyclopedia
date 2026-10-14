# Cyber Threat Actor Encyclopedia

UNCLASSIFIED // open-source research aid for COPC and 616 OC instruction.

A searchable database of Chinese, Russian, Iranian and North Korean cyber threat actors. Primary names follow Microsoft's threat actor naming taxonomy, with aliases from other vendors. Each profile has ten analytic sections plus dated sources. Sections without sourced content are marked **Research Required**.

## Layout

| Path | Contents |
|---|---|
| `app/index.html` | The app. Runs as a claude.ai Artifact and uses its `db` and `user` capabilities for storage and editor-only administration. |
| `data/actors/` | One JSON file per actor (350), matching the `actors` collection in the live database. |
| `data/scenarios/` | Exercise PACIFIC SALT inject set. |
| `scripts/transform.py` | Imports `actors.json` (MISP Galaxy, MITRE ATT&CK, Microsoft, Mandiant merge) into profile records. |
| `scripts/reconcile.py` | Reconciles names against Microsoft's `MicrosoftMapping.json`, adds ATT&CK tactics, and merges researched profiles. |
| `research/` | Sourced research for Volt, Salt and Flax Typhoon. |

## Data provenance

- Base records: `actors.json`, generated 2026-07-14.
- Microsoft names: [MicrosoftMapping.json](https://github.com/microsoft/mstic/blob/master/PublicFeeds/ThreatActorNaming/MicrosoftMapping.json), retrieved 2026-10-14.
- ATT&CK tactics and the Salt Typhoon (G1045) mapping: [mitre/cti](https://github.com/mitre/cti), retrieved 2026-10-14.

Nothing that is absent from those sources has been added to imported records. Researched profiles cite a dated source for every claim. JIPOE/JCC2 sections are marked as analyst assessment.

## Running

- **claude.ai (live, editable):** `app/index.html` is the Artifact source. There it reads and writes the live database, and editors get the research administration interface.
- **GitHub Pages (read-only):** `index.html` at the repo root is the same page wrapped in the document skeleton claude.ai adds at publish time. Outside claude.ai it loads `data/bundle.json`, a snapshot of every actor and scenario. Rebuild both with `python3 scripts/build_pages.py` after syncing `data/`.
