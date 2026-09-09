#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generates the static ronnyflas.com site (one real HTML page per URL).

All editable content lives in YAML files under content/ (one file per page),
so the site owner can edit copy through the Decap CMS admin UI (see admin/)
without touching this script. This file only contains structure/behaviour:
it loads each page's YAML and interpolates it into (mostly) unchanged
render functions.
"""
import html
import os
import re

import markdown
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT_DIR = os.path.join(ROOT, "content")
DOMAIN = "https://www.ronnyflas.com"

NAV_ITEMS = [
    ("Home", "/", "home"),
    ("Sport", "/sport/", "sport"),
    ("Music", "/music/", "music"),
    ("Food Business", "/food-business-career/", "food"),
    ("Charity", "/charity/", "charity"),
    ("News", "/news/", "news"),
    ("Jobs", "/jobs/", "jobs"),
    ("Contact", "/contact/", "contact"),
    ("Personal Pictures", "/personalpictures/", "personalpictures"),
]


def load(name):
    with open(os.path.join(CONTENT_DIR, f"{name}.yml"), encoding="utf-8") as f:
        return yaml.safe_load(f)


def nav(active):
    lis = []
    for label, href, key in NAV_ITEMS:
        cls = ' class="is-active"' if key == active else ""
        lis.append(f'      <li><a href="{href}"{cls}>{label}</a></li>')
    links = "\n".join(lis)
    return f"""<nav class="nav">
  <div class="nav-in">
    <a class="mark" href="/">Ronny <em>Flas</em></a>
    <ul class="nav-links">
{links}
    </ul>
  </div>
</nav>"""


FOOTER = """<footer>
  <div class="wrap foot-in">
    <div>&copy; 2026 by FF</div>
    <div class="foot-links">
      <a href="/personalpictures/">Personal pictures</a>
      <a href="/music-consulting/">Music consulting</a>
      <a href="/jobs/">Jobs</a>
      <a href="/contact/">Contact</a>
    </div>
  </div>
</footer>"""


def head(title, description, canonical):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{DOMAIN}{canonical}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500;700;800&family=Barlow:wght@400;500;600&family=Jost:wght@300;400&display=swap">
<link rel="stylesheet" href="/assets/css/main.css">
</head>
<body>
"""


def _depth(path):
    """All our pages live at the root or exactly one level down (/slug/)."""
    return 0 if path == "/" else 1


def to_relative(html_doc, path):
    """Rewrites root-relative hrefs/srcs/meta-refresh targets (leading '/') into
    paths relative to `path`'s own location, so the site works from a subfolder
    (e.g. GitHub Pages project preview) as well as from a domain root."""
    depth = _depth(path)

    def rel(value):
        if value == "/":
            return "./" if depth == 0 else "../"
        stripped = value.lstrip("/")
        return stripped if depth == 0 else "../" * depth + stripped

    html_doc = re.sub(
        r'(href|src)="(/[^"]*)"',
        lambda m: f'{m.group(1)}="{rel(m.group(2))}"',
        html_doc,
    )
    html_doc = re.sub(
        r'(content="0; url=)(/[^"]*)(")',
        lambda m: f'{m.group(1)}{rel(m.group(2))}{m.group(3)}',
        html_doc,
    )
    return html_doc


def page(path, title, description, active_nav, body_html):
    """path: e.g. '/' or '/sport/' -> writes <path>/index.html"""
    html_doc = head(title, description, path) + "\n" + nav(active_nav) + "\n" + body_html + "\n\n" + FOOTER + "\n</body>\n</html>\n"
    html_doc = to_relative(html_doc, path)
    out_dir = ROOT if path == "/" else os.path.join(ROOT, path.strip("/"))
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(html_doc)


def redirect(path, target, title):
    html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url={target}">
<link rel="canonical" href="{DOMAIN}{target}">
<title>{title}</title>
</head>
<body>
<p>This page has moved to <a href="{target}">{target}</a>.</p>
</body>
</html>
"""
    html_doc = to_relative(html_doc, path)
    out_dir = os.path.join(ROOT, path.strip("/"))
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(html_doc)


# ---------------------------------------------------------------------------
# Text-feed helper: turns a list of verbatim blurbs into bordered paragraphs,
# auto-linkifying the handful of URLs/emails that appear inline in the copy.
# ---------------------------------------------------------------------------
LINKIFY = [
    (re.compile(r"(?i)www\.flaronis\.com"), lambda m: f'<a href="https://www.flaronis.com">{m.group(0)}</a>'),
    (re.compile(r"info@flaronis\.be"), lambda m: f'<a href="mailto:{m.group(0)}">{m.group(0)}</a>'),
    (re.compile(r"www\.jennifermccray\.com"), lambda m: f'<a href="https://www.jennifermccray.com">{m.group(0)}</a>'),
    (re.compile(r"http://www\.derbestemix\.be/view\.php\?dgcharts"), lambda m: f'<a href="{m.group(0)}">{m.group(0)}</a>'),
    (re.compile(r"ronny\.flas@tsprecords\.com"), lambda m: f'<a href="mailto:{m.group(0)}">{m.group(0)}</a>'),
    (re.compile(r"ronny\.flas@gmail\.com"), lambda m: f'<a href="mailto:{m.group(0)}">{m.group(0)}</a>'),
    (re.compile(r"micheline\.matagne@retaxa\.lu"), lambda m: f'<a href="mailto:{m.group(0)}">{m.group(0)}</a>'),
]


def linkify(escaped_text):
    for pattern, repl in LINKIFY:
        escaped_text = pattern.sub(repl, escaped_text)
    return escaped_text


def feed_html(items):
    out = []
    for item in items:
        escaped = html.escape(item, quote=False)
        escaped = linkify(escaped)
        escaped = escaped.replace("\n", "<br>")
        out.append(f"<p>{escaped}</p>")
    return '<div class="newsfeed">\n' + "\n".join(out) + "\n</div>"


# ---------------------------------------------------------------------------
# Markdown rendering for the fields the Decap `markdown` widget now edits
# (see admin/config.yml). Those fields still hold the same raw HTML this
# site has always used for the handful of `<br>`/`<a>`/`<ul><li>`/`<strong>`
# tags they need - Python-Markdown passes inline/block raw HTML straight
# through unchanged, so existing content keeps rendering exactly as before;
# new content the site owner formats with the CMS's bold/italic/link/list
# toolbar renders through normal Markdown syntax.
# ---------------------------------------------------------------------------
def md(text, inline=False):
    """Renders a markdown-widget field to HTML.

    `inline=True` is for fields interpolated inside a context the call site
    already wraps in its own inline/heading element (a `<span>`, `<h1>`,
    `<div class="v">`/`<div class="k">`, or a `<p>` the call site itself
    provides) rather than a block container meant to hold `<p>`/`<ul>`
    children. Markdown always wraps a plain-text paragraph in `<p>...</p>`
    (raw HTML blocks like an existing `<ul>...</ul>` pass through as-is
    instead) - for `inline` fields that outer `<p>` would either break the
    layout or add a wrapper the original HTML never had, so when the
    rendered output is exactly one `<p>...</p>` with no nested block inside
    it, that single wrapper is stripped before returning.
    """
    if not text:
        return ""
    rendered = markdown.markdown(text).strip()
    if inline and rendered.startswith("<p>") and rendered.endswith("</p>"):
        inner = rendered[len("<p>"):-len("</p>")]
        if "<p>" not in inner and "<p " not in inner:
            rendered = inner
    return rendered


def IMG(path):
    """Content YAML stores full '/assets/img/...' paths (so Decap's image
    widget, which always writes public_folder-prefixed paths, works directly
    without a mismatch) - this is now an identity passthrough kept only so
    call sites read clearly as 'this is an image reference'."""
    return path


YOUTUBE_ID_RE = re.compile(
    r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{6,})"
)


def youtube_embed(url):
    """Renders a responsive YouTube embed from any pasted YouTube URL shape
    (watch?v=, youtu.be/, embed/, shorts/) - returns '' if empty/unrecognized
    so a missing/blank field never breaks the page."""
    if not url:
        return ""
    m = YOUTUBE_ID_RE.search(url)
    if not m:
        return ""
    video_id = m.group(1)
    return (
        '\n    <div class="video-embed">\n'
        f'      <iframe src="https://www.youtube.com/embed/{video_id}" title="Video"\n'
        '        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"\n'
        '        loading="lazy" allowfullscreen></iframe>\n'
        "    </div>"
    )


def photos_gallery_section(filenames, eyebrow="Photos", title="Gallery"):
    if not filenames:
        return ""
    figures = "\n".join(
        f'<figure><img loading="lazy" src="{IMG(f)}" alt=""></figure>' for f in filenames
    )
    return f"""
<section class="alerts">
  <div class="wrap">
    <p class="eyebrow">{eyebrow}</p>
    <h2>{title}</h2>
    <div class="gallery">
{figures}
    </div>
  </div>
</section>
"""


def pagehead(eyebrow, h1, lede, img_src=None, img_alt="", img_style=""):
    img_attr = f' style="{img_style}"' if img_style else ""
    img_html = f'\n    <div class="frame"><img loading="lazy" src="{img_src}" alt="{img_alt}"{img_attr}></div>' if img_src else ""
    style = "" if img_src else ' style="grid-template-columns:1fr"'
    return f"""
<header class="pagehead">
  <div class="pagehead-in"{style}>
    <div>
      <p class="eyebrow">{eyebrow}</p>
      <h1 class="pagetitle">{h1}</h1>
      <p class="lede">{lede}</p>
    </div>{img_html}
  </div>
</header>
"""


# ---------------------------------------------------------------------------
# HOME
# ---------------------------------------------------------------------------
def build_home():
    d = load("home")
    roles = "\n".join(
        f'        <li><a href="{r["href"]}"><span class="role-t">{r["title"]}</span>'
        + (f'<span class="role-s">{r["sub"]}</span>' if r.get("sub") else "")
        + '</a></li>'
        for r in d["hero"]["roles"]
    )
    hero_photos = "\n".join(
        f'      <div class="frame hero-photo"><img src="{IMG(p["photo"])}" alt="{p["photo_alt"]}"></div>'
        for p in d["hero"]["photos"]
    )
    alert_paras = "\n".join(f"      <p>{md(p, inline=True)}</p>" for p in d["latest"]["alert_paragraphs"])
    domains = "\n\n".join(
        f"""      <article class="domain">
        <div class="shot"><img loading="lazy" src="{IMG(x['photo'])}" alt="{x['photo_alt']}"{f' style="{x["photo_style"]}"' if x.get('photo_style') else ''}></div>
        <div class="domain-body">
          <h3>{x['title']}</h3>
          <p>{x['desc']}</p>
          <ul class="facts">
{chr(10).join(f'            <li>{fact}</li>' for fact in x['facts'])}
          </ul>
          <a class="btn" href="{x['button_href']}">{x['button_text']}</a>
        </div>
      </article>"""
        for x in d["sections"]["domains"]
    )
    body = f"""
<header class="hero">
  <div class="hero-in">
    <h1 class="name">Ronny<span class="last">Flas</span></h1>
    <p class="tagline">{d['hero']['tagline']}</p>
    <div class="photo-pair">
{hero_photos}
    </div>
    <ul class="roles">
{roles}
    </ul>
  </div>
</header>

<section class="alerts">
  <div class="wrap">
    <div class="alerts-head">
      <p class="eyebrow" style="margin:0">{d['latest']['eyebrow']}</p>
      <h2>{d['latest']['heading']}</h2>
    </div>
    <article class="alert" style="max-width:640px">
      <span class="tag">{d['latest']['alert_tag']}</span>
      <h3>{d['latest']['alert_title']}</h3>
{alert_paras}
      <a class="btn" href="{d['latest']['button_href']}">{d['latest']['button_text']}</a>
    </article>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">{d['sections']['eyebrow']}</p>
    <h2>{d['sections']['heading']}</h2>

    <div class="domains">
{domains}
    </div>
  </div>
</section>

<section class="contact">
  <div class="wrap">
    <p class="eyebrow">{md(d['contact']['eyebrow_html'], inline=True)}</p>
    <h2>{d['contact']['heading']}</h2>
    <p class="lede"><a class="mailto" href="mailto:{d['contact']['email']}">{d['contact']['email']}</a></p>
    <p style="margin-top:24px"><a class="btn btn-solid" href="{d['contact']['button_href']}">{d['contact']['button_text']}</a></p>
  </div>
</section>
"""

    page("/", d["meta"]["title"], d["meta"]["description"], "home", body)


build_home()

# ---------------------------------------------------------------------------
# SPORT
# ---------------------------------------------------------------------------
def build_sport():
    d = load("sport")
    ph = d["pagehead"]

    def spec_block(s):
        sub = f'<span class="sub">{s["sub"]}</span>' if s.get("sub") else ""
        body = md(s["body_html"])
        value = f"\n          {body}\n        " if s.get("multiline") else body
        return f"""      <div class="spec">
        <div class="spec-k">{s['key']}{sub}</div>
        <div class="spec-v">{value}</div>
      </div>"""

    record_specs = "\n".join(spec_block(s) for s in d["record"]["specs"])
    coaching_specs = "\n".join(spec_block(s) for s in d["coaching"]["specs"])
    coaching_video = youtube_embed(d["coaching"].get("video_url"))
    photos = "\n".join(
        f'      <figure><img loading="lazy" src="{IMG(p["file"])}" alt="{p["alt"]}"><figcaption>{p["caption"]}</figcaption></figure>'
        for p in d["gallery"]["photos"]
    )

    body = f"""
<header class="pagehead">
  <div class="pagehead-in">
    <div>
      <p class="eyebrow">{ph['eyebrow']}</p>
      <h1 class="pagetitle">{ph['title']}</h1>
      <p class="lede">{ph['lede']}</p>
    </div>
    <div class="frame"><img loading="lazy" src="{IMG(ph['photo'])}" alt="{ph['photo_alt']}"></div>
  </div>
</header>

<section class="alerts">
  <div class="wrap">
    <p class="eyebrow">{d['quote']['eyebrow']}</p>
    <blockquote class="pull">{d['quote']['text']}</blockquote>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">{d['record']['eyebrow']}</p>
    <h2>{d['record']['heading']}</h2>
    <div class="specs">
{record_specs}
    </div>
  </div>
</section>

<section class="alerts">
  <div class="wrap">
    <p class="eyebrow">{d['coaching']['eyebrow']}</p>
    <h2>{d['coaching']['heading']}</h2>
    <div class="specs">
{coaching_specs}
    </div>{coaching_video}
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">{d['gallery']['eyebrow']}</p>
    <h2>{d['gallery']['heading']}</h2>
    <div class="gallery">
{photos}
    </div>
    <p style="margin-top:26px"><a class="btn" href="/personalpictures/">Click here to see all the pictures</a></p>
  </div>
</section>

<section class="alerts">
  <div class="wrap">
    <p class="eyebrow">{d['news_teaser']['eyebrow']}</p>
    <h2>{d['news_teaser']['heading']}</h2>
    <p class="lede">{d['news_teaser']['lede']}</p>
    <p style="margin-top:24px"><a class="btn" href="{d['news_teaser']['button_href']}">{d['news_teaser']['button_text']}</a></p>
  </div>
</section>
"""

    page("/sport/", d["meta"]["title"], d["meta"]["description"], "sport", body)


build_sport()

# ---------------------------------------------------------------------------
# MUSIC
# ---------------------------------------------------------------------------
def build_music():
    d = load("music")
    ph = d["pagehead"]
    def photo_block(photos):
        photos = photos or []
        if not photos:
            return ""
        frames = "\n".join(
            f'      <div class="frame hero-photo"><img src="{IMG(p["photo"])}" alt="{p["photo_alt"]}"></div>'
            for p in photos
        )
        style = ' style="grid-template-columns:1fr;max-width:420px"' if len(photos) == 1 else ""
        return f'<div class="photo-pair"{style}>\n{frames}\n    </div>'

    hero_photos_html = (
        f'\n<section>\n  <div class="wrap">\n    {photo_block(d.get("photos"))}\n  </div>\n</section>\n'
        if d.get("photos")
        else ""
    )

    def chip_block(section):
        # NOTE: the live site hand-wraps these <li> tags irregularly across
        # several source lines purely for source readability (no visual
        # effect - <li> is block-level either way). We render one per line
        # instead, which is easier to maintain from the CMS; see the build
        # report for the (whitespace-only) diff this causes.
        chips = "\n".join(f"            <li>{c}</li>" for c in section["chips"])
        return f"""      <div class="spec">
        <div class="spec-k">{section['key']}</div>
        <div class="spec-v">
          <ul class="chips">
{chips}
            <li class="wide">{section['wide_extra']}</li>
          </ul>
        </div>
      </div>"""

    buttons_html = " &nbsp; ".join(
        f'<a class="btn" href="{b["href"]}">{b["text"]}</a>' for b in d["artists"]["buttons"]
    )

    vp = d.get("video_producer") or {}
    video_producer_html = (
        f"""
<section>
  <div class="wrap">
{f'    <p class="eyebrow">{vp["eyebrow"]}</p>' if vp.get("eyebrow") else ""}
    <h2>{vp['heading']}</h2>
{f'    <p class="lede">{md(vp["lede"], inline=True)}</p>' if vp.get("lede") else ""}
    {photo_block(vp.get("photos"))}
  </div>
</section>
"""
        if vp.get("heading")
        else ""
    )

    body = f"""
<header class="pagehead">
  <div class="pagehead-in" style="grid-template-columns:1fr">
    <div>
      <p class="eyebrow">{ph['eyebrow']}</p>
      <h1 class="pagetitle">{ph['title']}</h1>
      <p class="lede">{ph['lede']}</p>
    </div>
  </div>
</header>
{hero_photos_html}
<section class="alerts">
  <div class="wrap">
    <p class="eyebrow">{d['deals']['eyebrow']}</p>
    <h2>{d['deals']['heading']}</h2>
    <div class="specs">
{chip_block(d['deals'])}
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">{d['studios']['eyebrow']}</p>
    <h2>{d['studios']['heading']}</h2>
    <p class="lede">{d['studios']['lede']}</p>
    <div class="specs">
{chip_block(d['studios'])}
    </div>
    {photo_block(d['studios'].get('photos'))}
  </div>
</section>

<section class="alerts">
  <div class="wrap">
    <p class="eyebrow">{d['fairs']['eyebrow']}</p>
    <h2>{d['fairs']['heading']}</h2>
    <div class="specs">
{chip_block(d['fairs'])}
    </div>
    {photo_block(d['fairs'].get('photos'))}
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">{d['artists']['eyebrow']}</p>
    <h2>{d['artists']['heading']}</h2>
    <div class="specs">
{chip_block(d['artists'])}
    </div>
    <p style="margin-top:26px">{buttons_html}</p>
  </div>
</section>
{video_producer_html}"""

    page("/music/", d["meta"]["title"], d["meta"]["description"], "music", body)


build_music()

# ---------------------------------------------------------------------------
# FOOD BUSINESS
# ---------------------------------------------------------------------------
def build_food_business():
    d = load("food-business")
    ph = d["pagehead"]
    sp = d["specialities"]
    specialities = "\n".join(
        f'      <div class="honour"><div class="k">{md(i["k"], inline=True)}</div><div class="v">{i["v"]}</div></div>'
        for i in sp["items"]
    )
    companies = "\n".join(
        f'            <li><a href="{c["href"]}" style="text-decoration:none">{c["label"]}</a></li>'
        for c in sp["companies"]
    )
    product_photos = "\n".join(
        f'      <figure><img loading="lazy" src="{IMG(p["file"])}" alt="{p["alt"]}"></figure>'
        for p in d["products"]["photos"]
    )
    # NOTE: original hand-wraps these irregularly across lines (cosmetic
    # only - <li> is block-level); we render one per line here instead.
    retail_chips = "\n".join(f"            <li>{c}</li>" for c in d["clients"]["retail_chips"])
    wholesaler_chips = "".join(f"<li>{c}</li>" for c in d["clients"]["wholesaler_chips"])
    gas_chips = "".join(f"<li>{c}</li>" for c in d["clients"]["gas_station_chips"])
    independant_items = "".join(f"<li>{c}</li>" for c in d["clients"]["independant_items"])

    body = f"""
<header class="pagehead">
  <div class="pagehead-in">
    <div>
      <p class="eyebrow">{ph['eyebrow']}</p>
      <h1 class="pagetitle">{md(ph['title'], inline=True)}</h1>
      <p class="lede">{ph['lede']}</p>
    </div>
    <div class="frame"><img loading="lazy" src="{IMG(ph['photo'])}" alt="{ph['photo_alt']}" style="{ph['photo_style']}"></div>
  </div>
</header>

<section>
  <div class="wrap">
    <p class="eyebrow">{sp['eyebrow']}</p>
    <h2>{sp['heading']}</h2>
    <div class="honour-grid" style="grid-template-columns:repeat(5,1fr)">
{specialities}
    </div>
    <div class="specs">
      <div class="spec">
        <div class="spec-k">Companies</div>
        <div class="spec-v">
          <ul class="chips">
{companies}
          </ul>
        </div>
      </div>
    </div>
    <p style="margin-top:26px"><a class="btn" href="{sp['news_button_href']}">{sp['news_button_text']}</a></p>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">{d['products']['eyebrow']}</p>
    <h2>{d['products']['heading']}</h2>
    <div class="gallery">
{product_photos}
    </div>
    <div class="frame" style="max-width:220px; aspect-ratio:1007/541; margin-top:14px; background:#000">
      <img loading="lazy" src="{IMG(d['products']['retaxa_photo'])}" alt="{d['products']['retaxa_alt']}" style="width:100%;height:100%;object-fit:contain">
    </div>
  </div>
</section>

<section class="alerts">
  <div class="wrap">
    <p class="eyebrow">{d['clients']['eyebrow']}</p>
    <h2>{d['clients']['heading']}</h2>
    <div class="specs">
      <div class="spec">
        <div class="spec-k">Retail</div>
        <div class="spec-v">
          <ul class="chips">
{retail_chips}
          </ul>
          <p style="margin-top:14px; font-size:14px">{d['clients']['retail_note']}</p>
        </div>
      </div>
      <div class="spec">
        <div class="spec-k">Wholesalers</div>
        <div class="spec-v"><ul class="chips">{wholesaler_chips}</ul></div>
      </div>
      <div class="spec">
        <div class="spec-k">Gas stations</div>
        <div class="spec-v"><ul class="chips">{gas_chips}</ul></div>
      </div>
      <div class="spec">
        <div class="spec-k">Independant customers</div>
        <div class="spec-v">
          <ul>{independant_items}</ul>
        </div>
      </div>
    </div>
  </div>
</section>
"""

    page("/food-business-career/", d["meta"]["title"], d["meta"]["description"], "food", body)


build_food_business()

# ---------------------------------------------------------------------------
# CHARITY
# ---------------------------------------------------------------------------
def build_charity():
    d = load("charity")
    ph = d["pagehead"]
    b = d["body"]
    body = f"""
<header class="pagehead">
  <div class="pagehead-in">
    <div>
      <p class="eyebrow">{ph['eyebrow']}</p>
      <h1 class="pagetitle">{ph['title']}</h1>
      <p class="lede">{ph['lede']}</p>
    </div>
    <div class="frame"><img loading="lazy" src="{IMG(ph['photo'])}" alt="{ph['photo_alt']}"></div>
  </div>
</header>

<section>
  <div class="wrap" style="max-width:74ch">
    <p class="eyebrow">{b['eyebrow']}</p>
    <h2>{b['heading']}</h2>
    <blockquote class="pull">{b['quote']}</blockquote>
    <p class="lede">{md(b['lede'], inline=True)}</p>
    <p style="margin-top:24px"><a class="btn btn-solid" href="{b['button_href']}">{b['button_text']}</a></p>
  </div>
</section>
"""

    page("/charity/", d["meta"]["title"], d["meta"]["description"], "charity", body)


build_charity()

# ---------------------------------------------------------------------------
# NEWS (index of the 5 news sections)
# ---------------------------------------------------------------------------
def build_news():
    d = load("news")
    ph = d["pagehead"]
    links = "\n".join(f'      <li><a href="{l["href"]}">{l["text"]}</a></li>' for l in d["links"])
    body = pagehead(ph["eyebrow"], ph["title"], ph["lede"]) + f"""
<section>
  <div class="wrap">
    <ul class="news-links">
{links}
    </ul>
  </div>
</section>
"""
    page("/news/", d["meta"]["title"], d["meta"]["description"], "news", body)


build_news()

# ---------------------------------------------------------------------------
# CASTINGS
# ---------------------------------------------------------------------------
def build_castings():
    d = load("castings")
    ph = d["pagehead"]
    a = d["alert"]
    paras = "\n".join(f"      <p>{p}</p>" for p in a["paragraphs"])
    body = pagehead(ph["eyebrow"], ph["title"], ph["lede"]) + f"""
<section class="alerts">
  <div class="wrap">
    <article class="alert" style="max-width:680px">
      <span class="tag">{a['tag']}</span>
      <h3>{a['title']}</h3>
{paras}
      <a class="btn btn-solid" href="mailto:{a['email']}">{a['email']}</a>
    </article>
  </div>
</section>
"""
    page("/castings/", d["meta"]["title"], d["meta"]["description"], "news", body)


build_castings()

# ---------------------------------------------------------------------------
# FOOD BUSINESS NEWS
# ---------------------------------------------------------------------------
def build_food_business_news():
    d = load("food-business-news")
    ph = d["pagehead"]
    body = pagehead(
        ph["eyebrow"], ph["title"], ph["lede"], IMG(ph["photo"]), ph["photo_alt"],
        img_style=ph.get("photo_style", ""),
    ) + f"""
<section>
  <div class="wrap">
    {feed_html(d['items'])}
    <p style="margin-top:26px"><a class="btn" href="{d['back_button']['href']}">{d['back_button']['text']}</a></p>
  </div>
</section>
""" + photos_gallery_section(
        d["gallery"]["photos"], eyebrow=d["gallery"]["eyebrow"], title=d["gallery"]["title"]
    )

    page("/food-business-news/", d["meta"]["title"], d["meta"]["description"], "food", body)


build_food_business_news()

# ---------------------------------------------------------------------------
# MUSIC NEWS
# ---------------------------------------------------------------------------
def build_music_news():
    d = load("music-news")
    ph = d["pagehead"]
    body = pagehead(
        ph["eyebrow"], ph["title"], ph["lede"], IMG(ph["photo"]), ph["photo_alt"],
    ) + f"""
<section>
  <div class="wrap">
    {feed_html(d['items'])}
    <p style="margin-top:26px"><a class="btn" href="{d['back_button']['href']}">{d['back_button']['text']}</a></p>
  </div>
</section>
""" + photos_gallery_section(
        d["gallery"]["photos"], eyebrow=d["gallery"]["eyebrow"], title=d["gallery"]["title"]
    )

    page("/music-news/", d["meta"]["title"], d["meta"]["description"], "music", body)


build_music_news()

# ---------------------------------------------------------------------------
# SPORT NEWS
# ---------------------------------------------------------------------------
def build_sport_news():
    d = load("sport-news")
    ph = d["pagehead"]
    body = pagehead(
        ph["eyebrow"], ph["title"], ph["lede"], IMG(ph["photo"]), ph["photo_alt"],
    ) + f"""
<section>
  <div class="wrap">
    {feed_html(d['items'])}
    <p style="margin-top:26px"><a class="btn" href="{d['back_button']['href']}">{d['back_button']['text']}</a></p>
  </div>
</section>
""" + photos_gallery_section(
        d["gallery"]["photos"], eyebrow=d["gallery"]["eyebrow"], title=d["gallery"]["title"]
    )

    page("/sport-news/", d["meta"]["title"], d["meta"]["description"], "sport", body)


build_sport_news()

# ---------------------------------------------------------------------------
# CHARITY NEWS
# ---------------------------------------------------------------------------
def logo_img(fname, alt):
    return f'<img loading="lazy" src="{IMG(fname)}" alt="{alt}" style="max-width:130px;display:block;margin-bottom:12px;background:#fff;padding:6px;border:1px solid var(--line)">'


def photo_img(fname, alt):
    return (
        f'<img loading="lazy" src="{IMG(fname)}" alt="{alt}" '
        f'style="display:block;max-width:220px;max-height:280px;width:auto;height:auto;'
        f'margin-bottom:12px;border:1px solid var(--line)">'
    )


def smiletrain_img(fname, alt):
    return (
        f'<img loading="lazy" src="{IMG(fname)}" alt="{alt}" '
        f'style="display:block;max-width:420px;width:100%;height:auto;margin-bottom:12px;border:1px solid var(--line)">'
    )


PHOTO_HELPERS = {"logo": logo_img, "photo": photo_img, "smiletrain": smiletrain_img}


def cause_spec(c):
    """Renders one .spec block for a charity 'cause' (with or without a photo).

    text_html/text_html_2 are markdown-widget fields rendered as block
    content (md() without inline=True) - md() already wraps a plain
    paragraph in <p>...</p> (or passes an already-<p>-wrapped raw-HTML
    value through unchanged), so unlike the old code this no longer needs
    to add its own <p> wrapper around either field.
    """
    text = md(c["text_html"])
    if c.get("text_html_2"):
        text = f"{text}\n          {md(c['text_html_2'])}"
    helper = PHOTO_HELPERS.get(c.get("photo_kind"))
    if helper and c.get("photo"):
        img = helper(c["photo"], c["photo_alt"])
        value = f"""
          {img}
          {text}
        """
    else:
        value = text
    return f"""      <div class="spec">
        <div class="spec-k">{c['key']}</div>
        <div class="spec-v">{value}</div>
      </div>"""


def build_charity_news():
    d = load("charity-news")
    ph = d["pagehead"]

    alerts = "\n".join(
        f"""      <article class="alert">
        {photo_img(a['photo'], a['photo_alt'])}
        <span class="tag">{a['tag']}</span>
        <h3>{a['title']}</h3>
        <p>{a['text']}</p>
      </article>"""
        for a in d["alerts"]
    )

    regular_specs = "\n".join(cause_spec(c) for c in d["regular"]["causes"])
    supports_specs = "\n".join(cause_spec(c) for c in d["supports"]["causes"])
    insect_photos = "\n".join(
        f'      <figure><img loading="lazy" src="{IMG(p["file"])}" alt="{p["alt"]}"></figure>'
        for p in d["insects"]["photos"]
    )
    insect_specs = "\n".join(cause_spec(c) for c in d["insects"]["causes"])
    logos = "\n".join(
        f'      <div><img loading="lazy" src="{IMG(l["file"])}" alt="{l["alt"]}"></div>'
        for l in d["organisations"]["logos"]
    )

    body = pagehead(ph["eyebrow"], ph["title"], ph["lede"], IMG(ph["photo"]), ph["photo_alt"]) + f"""
<section class="alerts">
  <div class="wrap">
    <div class="alert-grid">
{alerts}
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">{d['regular']['eyebrow']}</p>
    <h2>{d['regular']['heading']}</h2>
    <div class="specs">
{regular_specs}
    </div>
  </div>
</section>

<section class="alerts">
  <div class="wrap">
    <p class="eyebrow">{d['supports']['eyebrow']}</p>
    <h2>{d['supports']['heading']}</h2>
    <div class="specs">
{supports_specs}
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">{d['insects']['eyebrow']}</p>
    <h2>{d['insects']['heading']}</h2>
    <div class="gallery" style="grid-template-columns:repeat(3,1fr);max-width:640px">
{insect_photos}
    </div>
    <div class="specs" style="margin-top:20px">
{insect_specs}
    </div>
  </div>
</section>

<section class="alerts">
  <div class="wrap">
    <p class="eyebrow">{d['organisations']['eyebrow']}</p>
    <h2>{d['organisations']['heading']}</h2>
    <div class="logos">
{logos}
    </div>
    <p style="margin-top:26px"><a class="btn" href="{d['organisations']['back_button']['href']}">{d['organisations']['back_button']['text']}</a></p>
  </div>
</section>
"""

    page("/charity-news/", d["meta"]["title"], d["meta"]["description"], "news", body)


build_charity_news()

# ---------------------------------------------------------------------------
# JOBS
# ---------------------------------------------------------------------------
def build_jobs():
    d = load("jobs")
    ph = d["pagehead"]
    positions = "\n".join(
        f"""      <div class="spec">
        <div class="spec-k">{p['title']}<span class="sub">{p['sub']}</span></div>
        <div class="spec-v">
          {md(p['body_html'])}
        </div>
      </div>"""
        for p in d["openings"]["positions"]
    )

    body = pagehead(ph["eyebrow"], ph["title"], ph["lede"], IMG(ph["photo"]), ph["photo_alt"]) + f"""
<section class="alerts">
  <div class="wrap">
    <p class="eyebrow">{d['unsolicited']['eyebrow']}</p>
    <p class="lede">{md(d['unsolicited']['lede'], inline=True)}</p>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">{d['openings']['eyebrow']}</p>
    <h2>{d['openings']['heading']}</h2>
    <div class="specs">
{positions}
    </div>
  </div>
</section>
"""

    page("/jobs/", d["meta"]["title"], d["meta"]["description"], "jobs", body)


build_jobs()

# ---------------------------------------------------------------------------
# CONTACT
# ---------------------------------------------------------------------------
def build_contact():
    d = load("contact")
    ph = d["pagehead"]
    body = pagehead(ph["eyebrow"], ph["title"], ph["lede"]) + f"""
<section class="contact">
  <div class="wrap">
    <p class="lede">{md(d['body']['lede'], inline=True)}</p>
  </div>
</section>
"""
    page("/contact/", d["meta"]["title"], d["meta"]["description"], "contact", body)


build_contact()

# ---------------------------------------------------------------------------
# PERSONAL PICTURES
# ---------------------------------------------------------------------------
def personal_pictures_gallery(pictures):
    out = []
    for p in pictures:
        t = html.escape(p["title"], quote=False)
        cap = f"<strong>{t}</strong>"
        if p.get("desc"):
            cap += " &mdash; " + linkify(html.escape(p["desc"], quote=False))
        out.append(
            f'<figure><img loading="lazy" src="{IMG(p["file"])}" alt="{t}"><figcaption>{cap}</figcaption></figure>'
        )
    return '<div class="gallery" style="grid-template-columns:repeat(3,1fr)">\n' + "\n".join(out) + "\n</div>"


def build_personal_pictures():
    d = load("personal-pictures")
    ph = d["pagehead"]
    body = pagehead(ph["eyebrow"], ph["title"], ph["lede"]) + f"""
<section>
  <div class="wrap">
    {personal_pictures_gallery(d['pictures'])}
  </div>
</section>
"""
    page("/personalpictures/", d["meta"]["title"], d["meta"]["description"], "personalpictures", body)


build_personal_pictures()

# ---------------------------------------------------------------------------
# MUSIC CONSULTING
# ---------------------------------------------------------------------------
def build_music_consulting():
    d = load("music-consulting")
    ph = d["pagehead"]
    b = d["body"]
    body = pagehead(ph["eyebrow"], ph["title"], ph["lede"]) + f"""
<section class="contact">
  <div class="wrap">
    <p class="lede">{b['lede']}</p>
    <p>{b['paragraph']}</p>
    <p style="margin-top:24px">{md(b['closing_html'], inline=True)}</p>
  </div>
</section>
"""
    page("/music-consulting/", d["meta"]["title"], d["meta"]["description"], "music", body)


build_music_consulting()

# ---------------------------------------------------------------------------
# Redirects for renamed pages
# ---------------------------------------------------------------------------
redirect("/copie-de-sport-news-1/", "/castings/", "Castings - Ronny Flas")
redirect("/copie-de-sport-news/", "/charity-news/", "Charity news - Ronny Flas")

# NOTE: no CNAME file — removed so the GitHub Pages project preview
# (fredericfigiel.github.io/ronnyflas-site/) doesn't get redirected to the
# live Wix site. Re-add it (containing "www.ronnyflas.com") at DNS cutover.

print("Done.")
