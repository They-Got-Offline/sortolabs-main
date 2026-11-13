#!/usr/bin/env python3
"""Build index.html from src/template.html and a BSData/wh40k-11e checkout.

Usage: python tools/build.py <bsdata_dir> [out=index.html]
"""
import datetime
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import convert  # noqa: E402


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "index.html")
    data = convert.build(src)
    try:
        sha = subprocess.check_output(["git", "-C", src, "rev-parse", "HEAD"], text=True).strip()
        when = subprocess.check_output(["git", "-C", src, "log", "-1", "--format=%cs"], text=True).strip()
    except Exception:
        sha, when = "unknown", datetime.date.today().isoformat()
    data["meta"] = {"bsdata": sha, "bsdata_date": when}
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    title = f"Data: BSData/wh40k-11e {sha[:7]} ({when}) · Companion tools imported 2026-11-12"
    with open(os.path.join(ROOT, "src", "template.html"), encoding="utf-8") as fh:
        html = fh.read()
    html = html.replace("__BSDATA_JSON__", blob, 1).replace("__BSDATA_TITLE__", title, 1).replace("__BSDATA_SHA__", sha, 1)
    with open(os.path.join(os.path.dirname(out), "data.json"), "w", encoding="utf-8") as fh:
        fh.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    with open(os.path.join(ROOT, "data-version.txt"), "w") as fh:
        fh.write(sha + "\n")
    print(f"wrote {out}: {len(data['factions'])} factions, {len(data['units'])} units, BSData {sha[:7]} {when}")


if __name__ == "__main__":
    main()
