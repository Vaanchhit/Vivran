"""Download the chosen images at slide resolution and write credits.json (author, licence, source page)."""
import json, urllib.parse, urllib.request, os, re, html
UA = {"User-Agent": "VivranShowcaseBuilder/1.0 (info@vivran.co.in)"}
PICK = {
  "leaf": "File:Sunlight on a green leaf (India, 2016).jpg",
  "chloroplasts": "File:Moss chloroplasts 100× objective.jpg",
  "stomata": "File:Upper epidermal stomata of a melon leaf with powdery mildew.jpg",
  "paddy": "File:Women Harvesting Rice Paddy.jpg",
  "bastille": "File:Prise de la Bastille clean.jpg",
  "oath": "File:Jacques-Louis David - Serment du Jeu de paume, le 20 juin 1789 - P67 - mus\u00e9e Carnavalet - 0.jpg",
  "declaration": "File:Declaration of the Rights of Man and of the Citizen in 1789.jpg",
  "execution": "File:Exécution de Louis Capet XVI.me du nom, le 21 janvier 1793.jpg",
  "onion_mitosis": "File:Onion Root Tip Cells Mitosis.jpg",
  "veg_vendor": "File:Vegetable market, Bulandshahr.jpg",
  "onions": "File:Onion Vendor taking a Mid-day break.jpg",
  "market": "File:Market Hyderabad.jpg",
  "lab": "File:Work in the computer lab.JPG",
}
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return r.read()
os.makedirs("img", exist_ok=True)
credits = {}
for key, title in PICK.items():
    api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "format": "json", "titles": title,
          "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 2000})
    pages = json.loads(get(api))["query"]["pages"]; p = next(iter(pages.values()))
    if "imageinfo" not in p:
        # exact title not found (e.g. the Google Art Project name differs): search for it
        print("not found, searching:", title); continue
    ii = p["imageinfo"][0]; md = ii["extmetadata"]
    clean = lambda k: html.unescape(re.sub("<[^>]+>", "", md.get(k, {}).get("value", ""))).strip()
    open(f"img/{key}.jpg", "wb").write(get(ii["thumburl"]))
    credits[key] = {"title": title[5:], "author": clean("Artist")[:120] or "Unknown", "license": clean("LicenseShortName"), "source": ii["descriptionurl"]}
    print(key, "|", credits[key]["license"], "|", credits[key]["author"][:50])
json.dump(credits, open("img/credits.json", "w"), indent=1, ensure_ascii=False)
