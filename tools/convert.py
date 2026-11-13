#!/usr/bin/env python3
"""Convert BSData/wh40k-11e BattleScribe JSON catalogues into the app's data island.

Usage: python tools/convert.py <bsdata_dir> <out.json>

Output shape (consumed by index.html as <script id="d">):
  factions: {catalogue name: [unit ids]}
  units:    {id: {id,n,role,kw,fk,pts,tiers,st,w,ab,ru,lg,pr,cfg?}}
  fx:       {catalogue name: {rules:[{n,d}], det:[{n,dp,r,e}], en:[{n,p,d}]}}
"""
import glob
import json
import os
import sys

PTS = "51b2-306e-1021-d207"
DP = "82ae-1066-5107-6ae0"
WEAPON_TYPES = {"Ranged Weapons", "Melee Weapons"}
SKIP_GROUPS = {"Crusade", "Weapon Modifications", "Enhancements", "Warlord"}


class Repo:
    def __init__(self, folder):
        self.cats = {}
        for f in sorted(glob.glob(os.path.join(folder, "*.json"))):
            with open(f, encoding="utf-8") as fh:
                d = json.load(fh)
            root = list(d.values())[0]
            root["_file"] = os.path.basename(f)
            self.cats[root["id"]] = root
        self.gst = next(c for c in self.cats.values() if c.get("type") == "gameSystem")
        self.by_name = {c["name"]: c for c in self.cats.values()}
        # per-catalogue id index (shared + nested ids)
        self.idx = {}
        for cid, c in self.cats.items():
            ix = {}
            self._index(c, ix)
            self.idx[cid] = ix
        self._scope = {}

    def _index(self, o, ix):
        if isinstance(o, dict):
            i = o.get("id")
            if isinstance(i, str) and i not in ix:
                ix[i] = o
            for k, v in o.items():
                if k != "_file":
                    self._index(v, ix)
        elif isinstance(o, list):
            for v in o:
                self._index(v, ix)

    def scope(self, cat):
        """Catalogue ids visible from cat: itself, linked catalogues (recursive), gameSystem."""
        if cat["id"] in self._scope:
            return self._scope[cat["id"]]
        seen, order, stack = set(), [], [cat["id"]]
        while stack:
            c = stack.pop(0)
            if c in seen or c not in self.cats:
                continue
            seen.add(c)
            order.append(c)
            for l in self.cats[c].get("catalogueLinks", []):
                stack.append(l["targetId"])
        if self.gst["id"] not in seen:
            order.append(self.gst["id"])
        self._scope[cat["id"]] = order
        return order

    def resolve(self, cat, tid):
        for c in self.scope(cat):
            o = self.idx[c].get(tid)
            if o is not None:
                return o
        for ix in self.idx.values():
            if tid in ix:
                return ix[tid]
        return None


def skip(e):
    n = e.get("name", "")
    return n in SKIP_GROUPS or "Enhancements" in n or "Crusade" in n


def txt(p, name):
    for ch in p.get("characteristics", []):
        if ch.get("name") == name:
            return ch.get("$text", "")
    return ""


def chars(p):
    return {ch["name"]: ch.get("$text", "") for ch in p.get("characteristics", [])}


def limits(e):
    lo, hi = 0, None
    for c in e.get("constraints", []):
        if c.get("field") != "selections" or c.get("scope") != "parent":
            continue
        if c["type"] == "min":
            lo = max(lo, int(c["value"]))
        elif c["type"] == "max":
            hi = int(c["value"]) if hi is None else min(hi, int(c["value"]))
    return lo, hi


def cost(e, tid=PTS):
    for c in e.get("costs", []):
        if c.get("typeId") == tid:
            return c.get("value", 0)
    return 0


class Conv:
    def __init__(self, repo):
        self.r = repo

    # ---- link resolution -------------------------------------------------
    def deref(self, cat, link):
        """Merge an entryLink with its target (link overrides constraints/costs if present)."""
        t = self.r.resolve(cat, link["targetId"])
        if t is None:
            return None
        m = dict(t)
        for k in ("constraints", "costs", "modifiers", "modifierGroups", "categoryLinks", "profiles",
                  "infoLinks", "selectionEntries", "selectionEntryGroups", "entryLinks"):
            if link.get(k):
                if k == "costs":
                    ov = {y.get("typeId") for y in link[k]}
                    m[k] = list(link[k]) + [x for x in t.get(k, []) if x.get("typeId") not in ov]
                elif k == "constraints":
                    m[k] = list(link[k]) + list(t.get(k, []))
                else:
                    m[k] = list(t.get(k, [])) + list(link[k])
        m["_linkhidden"] = link.get("hidden", False)
        if "name" in link:
            m["name"] = link["name"] if link.get("name") else t.get("name")
        return m

    def children(self, cat, e):
        """Ordered children: selectionEntries, selectionEntryGroups, entryLinks (resolved)."""
        out = []
        for s in e.get("selectionEntries", []):
            out.append(s)
        for g in e.get("selectionEntryGroups", []):
            g = dict(g)
            g["_group"] = True
            out.append(g)
        for l in e.get("entryLinks", []):
            m = self.deref(cat, l)
            if m is None:
                continue
            if l.get("type") == "selectionEntryGroup":
                m["_group"] = True
            out.append(m)
        return out

    def profiles(self, cat, e):
        out = list(e.get("profiles", []))
        for il in e.get("infoLinks", []):
            if il.get("type") == "profile":
                p = self.r.resolve(cat, il["targetId"])
                if p:
                    out.append(p)
        for ig in e.get("infoGroups", []):
            out += self.profiles(cat, ig)
        return out

    def rules(self, cat, e):
        out = list(e.get("rules", []))
        for il in e.get("infoLinks", []):
            if il.get("type") == "rule":
                p = self.r.resolve(cat, il["targetId"])
                if p:
                    p = dict(p)
                    if il.get("name"):
                        p["name"] = il["name"]
                    for m in il.get("modifiers", []):
                        if m.get("field") == "name" and m.get("type") == "append" and not m.get("conditions") and not m.get("conditionGroups"):
                            p["name"] = f'{p["name"]}{m.get("join", " ")}{m["value"]}'
                    out.append(p)
        for ig in e.get("infoGroups", []):
            out += self.rules(cat, ig)
        return out

    def has_unit_profile(self, cat, e, depth=0):
        if any(p.get("typeName") == "Unit" for p in self.profiles(cat, e)):
            return True
        if depth > 8:
            return False
        return any(self.has_unit_profile(cat, ch, depth + 1)
                   for ch in self.children(cat, e) if ch.get("name") not in SKIP_GROUPS)

    # ---- unit ------------------------------------------------------------
    def unit(self, cat, e):
        u = {"id": e["id"], "n": e["name"]}
        prim = ""
        kw, fk = [], []
        for cl in e.get("categoryLinks", []):
            n = cl.get("name", "")
            if cl.get("primary"):
                prim = n
                continue
            if n.startswith("Faction: "):
                fk.append(n[len("Faction: "):])
            elif n != e["name"]:
                kw.append(n)
        u["role"] = prim
        u["kw"] = kw
        u["fk"] = fk
        u["pts"] = cost(e)
        pr = []
        for m in e.get("modifiers", []):
            if m.get("field") != PTS or m.get("type") != "set":
                continue
            conds = m.get("conditions", [])
            if len(conds) != 1 or m.get("conditionGroups"):
                continue
            c = conds[0]
            if c.get("field") != "selections":
                continue
            s = c.get("childId", "")
            if s in ("model", "unit", "any"):
                sc = c.get("scope", "")
                s = sc if sc not in ("parent", "self", "roster", "force", "unit", "model-or-unit") else ""
            pr.append([m["value"], c["type"], c["value"], s])
        u["tiers"] = [[p[2], p[0]] for p in pr if p[1] == "atLeast"]
        st, w, ab, ru = [], [], {}, []
        wseen, abseen, ruseen, stseen = set(), set(), set(), set()

        def walk(x, depth):
            for p in self.profiles(cat, x):
                tn = p.get("typeName", "")
                if tn == "Unit":
                    s = {"n": p["name"]}
                    s.update(chars(p))
                    key = json.dumps(s, sort_keys=True)
                    if key not in stseen:
                        stseen.add(key)
                        st.append(s)
                elif tn in WEAPON_TYPES:
                    c = chars(p)
                    ww = {"n": p["name"], "m": tn == "Melee Weapons"}
                    for k, v in c.items():
                        ww["kw" if k == "Keywords" else k] = v
                    key = json.dumps(ww, sort_keys=True)
                    if key not in wseen:
                        wseen.add(key)
                        w.append(ww)
                else:
                    cs = chars(p)
                    if "Description" in cs:
                        d = cs["Description"]
                    else:
                        d = "\n".join(cs.values())
                    nm = tn if tn == "Transport" else p["name"]
                    key = (tn, nm)
                    if key not in abseen:
                        abseen.add(key)
                        ab.setdefault(tn, []).append([nm, d])
            if not any(p.get("typeName") in WEAPON_TYPES for p in self.profiles(cat, x)):
                for r in self.rules(cat, x):
                    if r["name"] not in ruseen:
                        ruseen.add(r["name"])
                        ru.append([r["name"], r.get("description", "")])
            for ch in self.children(cat, x):
                if skip(ch):
                    continue
                walk(ch, depth + 1)

        walk(e, 0)
        u["st"], u["w"], u["ab"], u["ru"] = st, w, ab, ru
        u["lg"] = "[Legends]" in e["name"]
        u["pr"] = pr
        cfg = self.cfg(cat, e)
        if cfg:
            u["cfg"] = cfg
        return u

    def cfg(self, cat, e):
        out = []
        for ch in self.children(cat, e):
            if skip(ch):
                continue
            n = self.node(cat, ch)
            if n:
                out.append(n)
        return out

    def node(self, cat, ch):
        lo, hi = limits(ch)
        if ch.get("_group"):
            kids = self.cfg(cat, ch)
            if not kids:
                return None
            n = {"n": ch["name"], "t": "g", "lo": lo, "hi": 99 if hi is None else hi, "i": ch["id"]}
            if ch.get("defaultSelectionEntryId"):
                n["d"] = ch["defaultSelectionEntryId"]
            n["c"] = kids
            return n
        t = ch.get("type")
        if t == "model":
            n = {"n": ch["name"], "t": "m", "lo": lo, "hi": 99 if hi is None else hi, "i": ch["id"]}
        elif t == "upgrade":
            n = {"n": ch["name"], "t": "u", "lo": lo, "hi": 1 if hi is None else hi}
        else:
            return None
        p = cost(ch)
        if p:
            n["p"] = p
        kids = self.cfg(cat, ch)
        if kids:
            n["c"] = kids
        elif t == "upgrade" and lo == n["hi"]:
            return None
        return n


def cond_ids(o, acc):
    if isinstance(o, dict):
        if "childId" in o:
            acc.add(o["childId"])
        for v in o.values():
            cond_ids(v, acc)
    elif isinstance(o, list):
        for v in o:
            cond_ids(v, acc)
    return acc


def faction_fx(r, cv, c, unit_entries, unit_rules=(), pool_only=()):
    def det_roots(k):
        return [l for l in k.get("entryLinks", []) + k.get("selectionEntries", []) if l.get("name") == "Detachment"]
    scope = [r.cats[i] for i in r.scope(c) if i != r.gst["id"]]
    # catalogues whose root entries (incl. "Detachment") are imported into this army
    roots, stack = [], [c]
    while stack:
        k = stack.pop(0)
        if k in roots:
            continue
        roots.append(k)
        for l in k.get("catalogueLinks", []):
            if l.get("importRootEntries") and l.get("targetId") in r.cats:
                stack.append(r.cats[l["targetId"]])
    cats = [k for k in roots if det_roots(k)]
    rules, rseen = [], set()
    for k in [c] + [k for k in scope if k.get("library") or k in cats]:
        for x in k.get("rules", []) + k.get("sharedRules", []):
            if x["name"] in unit_rules and x["name"] not in rseen:
                rseen.add(x["name"])
                rules.append({"n": x["name"], "d": x.get("description", "")})
    det, det_ids = [], {}
    for k in cats:
        for l in det_roots(k):
            root = r.resolve(k, l["targetId"]) if "targetId" in l else l
            if not root:
                continue
            def walk(e, depth=0):
                for ch in cv.children(k, e):
                    if ch.get("_group") or ch.get("type") != "upgrade":
                        if depth < 3:
                            walk(ch, depth + 1)
                        continue
                    if ch["id"] in det_ids or ch["name"] in det_ids.values():
                        continue
                    det_ids[ch["id"]] = ch["name"]
                    det.append({"n": ch["name"], "dp": cost(ch, DP),
                                "r": [{"n": x["name"], "d": x.get("description", "")} for x in cv.rules(k, ch)],
                                "e": []})
            walk(root)
    # enhancements: groups named "Enhancements*" reachable from this faction's units
    groups, gseen = [], set()
    def find(o, depth=0):
        if depth > 8:
            return
        if isinstance(o, dict):
            n = o.get("name", "")
            if n.startswith("Enhancements") and "targetId" in o and o["targetId"] not in gseen:
                gseen.add(o["targetId"])
                t = r.resolve(c, o["targetId"])
                if t:
                    groups.append((t, cond_ids(o.get("modifiers", []) + o.get("modifierGroups", []), set())))
            for k2 in ("selectionEntries", "selectionEntryGroups", "entryLinks"):
                for v in o.get(k2, []):
                    find(v, depth + 1)
    for e in unit_entries:
        find(e)
    for k in cats:
        for e in k.get("sharedSelectionEntries", []):
            find(e)
    en, seen = [], set()
    stack = list(groups)
    while stack:
        g, inh = stack.pop(0)
        inh = inh | cond_ids(g.get("modifiers", []) + g.get("modifierGroups", []), set())
        stack.extend((x, inh) for x in g.get("selectionEntryGroups", []))
        items = [(x, inh) for x in g.get("selectionEntries", [])]
        for l in g.get("entryLinks", []):
            t = r.resolve(c, l["targetId"])
            if t is None:
                continue
            li = inh | cond_ids(l.get("modifiers", []) + l.get("modifierGroups", []), set())
            if l.get("type") == "selectionEntryGroup":
                stack.append((t, li))
            else:
                items.append((t, li))
        for e, inh2 in items:
            if e["name"] in seen or e.get("hidden") is True and not e.get("modifiers"):
                continue
            seen.add(e["name"])
            dsc = ""
            for p in cv.profiles(c, e):
                dsc = txt(p, "Description") or (list(chars(p).values()) or [""])[0]
                if dsc:
                    break
            if not dsc:
                rr = cv.rules(c, e)
                dsc = rr[0].get("description", "") if rr else ""
            z = {"n": e["name"], "p": cost(e), "d": dsc}
            refs = [det_ids[i] for i in cond_ids(e.get("modifiers", []) + e.get("modifierGroups", []), set(inh2)) if i in det_ids]
            if refs and c["name"] not in pool_only:
                for d in det:
                    if d["n"] in refs:
                        d["e"].append(z)
            else:
                en.append(z)
    return {"rules": rules, "det": det, "en": en}


def build(src, pool_only=()):
    r = Repo(src)
    cv = Conv(r)
    factions, units, fx = {}, {}, {}
    for c in r.cats.values():
        if c.get("type") != "catalogue" or c.get("library"):
            continue
        cand = {}
        for x in c.get("sharedSelectionEntries", []):
            cand.setdefault(x["id"], x)
        for l in c.get("entryLinks", []):
            e = r.resolve(c, l["targetId"])
            if e:
                cand.setdefault(e["id"], e)
        for x in c.get("selectionEntries", []):
            cand.setdefault(x["id"], x)
        ids = []
        for i, e in cand.items():
            if e.get("type") not in ("unit", "model"):
                continue
            if not cv.has_unit_profile(c, e):
                continue
            if i not in units:
                units[i] = cv.unit(c, e)
            ids.append(i)
        ids.sort(key=lambda i: units[i]["n"])
        if ids:
            factions[c["name"]] = ids
        fx[c["name"]] = faction_fx(r, cv, c, [cand[i] for i in ids], {x[0] for i in ids for x in units[i]["ru"]}, pool_only)
    data = {"factions": factions, "units": units, "fx": fx}
    return data


def main():
    src, out = sys.argv[1], sys.argv[2]
    data = build(src)
    factions, units = data["factions"], data["units"]
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(factions)} factions, {len(units)} units")


if __name__ == "__main__":
    main()
