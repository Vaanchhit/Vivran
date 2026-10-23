"""Search Wikimedia Commons for openly licensed photos and record their licence.

usage: python find_images.py "search terms" [n]
Prints candidates (title, size, licence, author) and saves 400px previews in work/cand/.
Only public domain, CC0, CC BY and CC BY-SA images are listed; anything else is skipped.
"""
import json, os, re, sys, urllib.parse, urllib.request, html

UA = {"User-Agent": "VivranShowcaseBuilder/1.0 (info@vivran.co.in)"}
OK = re.compile(r"^(public domain|pd|cc0|cc by(-sa)? ?[0-9.]*)", re.I)

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read()

def search(q, n=8):
    api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrlimit": 30,
        "gsrsearch": f"{q} filetype:bitmap", "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 400})
    pages = json.loads(get(api)).get("query", {}).get("pages", {})
    out = []
    for p in sorted(pages.values(), key=lambda x: x.get("index", 0)):
        ii = p["imageinfo"][0]; md = ii.get("extmetadata", {})
        lic = html.unescape(re.sub("<[^>]+>", "", md.get("LicenseShortName", {}).get("value", "")))
        if not OK.match(lic) or ii["width"] < 1200: continue
        author = html.unescape(re.sub("<[^>]+>", "", md.get("Artist", {}).get("value", ""))).strip()[:80]
        out.append({"title": p["title"], "w": ii["width"], "h": ii["height"], "license": lic, "author": author,
                    "page": ii["descriptionurl"], "url": ii["url"], "thumb": ii["thumburl"]})
        if len(out) >= n: break
    return out

if __name__ == "__main__":
    q = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    os.makedirs("work/cand", exist_ok=True)
    res = search(q, n)
    slug = re.sub(r"[^a-z0-9]+", "-", q.lower())[:30]
    for i, r in enumerate(res):
        path = f"work/cand/{slug}-{i}.jpg"
        try: open(path, "wb").write(get(r["thumb"]))
        except Exception as e: path = f"(preview failed: {e})"
        print(f"{i} | {r['title'][5:70]} | {r['w']}x{r['h']} | {r['license']} | {r['author'][:40]} | {path}")
    json.dump(res, open(f"work/cand/{slug}.json", "w"), indent=1)
