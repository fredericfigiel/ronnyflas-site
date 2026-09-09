/* Aperçu en direct (live preview) pour Decap CMS.
 *
 * Ce fichier est chargé APRÈS decap-cms.js (voir admin/index.html), une fois
 * que `window.CMS` existe. Il enregistre :
 *   - les feuilles de style du vrai site (polices Google Fonts + main.css),
 *     pour que l'aperçu ressemble réellement au site publié ;
 *   - un template d'aperçu par page (les 15 fichiers de contenu), qui
 *     reconstruit le HTML généré par scripts/build.py pour cette page à
 *     partir des données en cours d'édition.
 *
 * Chaque template lit les données via `entry.get('data').toJS()` (Immutable
 * -> objet JS classique), avec des valeurs par défaut partout : pendant que
 * le propriétaire du site édite, des champs peuvent être vides ou absents,
 * et une erreur ici ne doit jamais faire planter tout le panneau d'aperçu.
 */
(function () {
  "use strict";

  if (!window.CMS) {
    console.error("preview.js: window.CMS introuvable (ce script doit être chargé après decap-cms.js)");
    return;
  }

  var createClass = window.createClass;
  var h = window.h;

  // ---------------------------------------------------------------------
  // Le site est actuellement publié sous un sous-dossier GitHub Pages
  // (https://fredericfigiel.github.io/ronnyflas-site/), pas à la racine du
  // domaine - donc un chemin qui commence par "/" (ex: "/assets/img/x.jpg")
  // pointerait à tort vers la racine de github.io. `asset()` recalcule le
  // bon préfixe à partir de l'URL actuelle de /admin/, ce qui reste correct
  // aussi le jour où le site passera sur www.ronnyflas.com (racine du
  // domaine -> SITE_ROOT vaut alors simplement "/").
  // ---------------------------------------------------------------------
  var SITE_ROOT = location.pathname.replace(/admin\/.*$/, "");
  function asset(p) {
    p = p || "";
    if (!p || /^https?:\/\//.test(p)) return p;
    return SITE_ROOT + p.replace(/^\//, "");
  }

  // ---------------------------------------------------------------------
  // Feuilles de style réelles du site (mêmes URLs que scripts/build.py
  // head()).
  // ---------------------------------------------------------------------
  CMS.registerPreviewStyle(
    "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500;700;800&family=Barlow:wght@400;500;600&family=Jost:wght@300;400&display=swap"
  );
  CMS.registerPreviewStyle(asset("/assets/css/main.css"));
  CMS.registerPreviewStyle(
    ".preview-topbar{background:#111;color:#fff;padding:14px 20px;font-family:'Big Shoulders Display',sans-serif;" +
      "font-weight:700;font-size:20px;letter-spacing:.02em}" +
      ".preview-topbar em{font-style:normal;opacity:.65}" +
      ".preview-wrap{min-height:100%}" +
      // Survolez une partie de l'aperçu : elle se surligne et une bulle
      // d'aide (l'attribut "title" du navigateur) indique dans quel champ
      // du formulaire, à gauche, se trouve ce contenu.
      ".cms-field-tag{outline-offset:3px;cursor:help;transition:outline-color .1s}" +
      ".cms-field-tag:hover{outline:2px dashed #2563eb}",
    { raw: true }
  );

  // ---------------------------------------------------------------------
  // Aides génériques
  // ---------------------------------------------------------------------

  /** Immutable entry -> plain JS object for the 'data' branch, never throws. */
  function toData(entry) {
    try {
      var d = entry && typeof entry.get === "function" ? entry.get("data") : null;
      if (d && typeof d.toJS === "function") return d.toJS() || {};
      return d || {};
    } catch (e) {
      return {};
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /** Mirrors build.py's md() helper: renders a "markdown" widget field
   * (window.marked, loaded in admin/index.html) the same way scripts/build.py
   * does with the Python `markdown` package, so the preview matches the real
   * site. `inline=true` strips a single outer <p>...</p> wrapper for fields
   * interpolated inside a context the call site already wraps itself (a
   * <span>/<h1>/<div class="v">/<div class="k">, or a <p> it provides) -
   * see the longer explanation on md() in scripts/build.py. */
  function mdRender(text, inline) {
    if (!text) return "";
    var rendered;
    try {
      rendered = window.marked ? String(window.marked.parse(text)) : esc(text);
    } catch (e) {
      rendered = esc(text);
    }
    rendered = rendered.replace(/^\s+|\s+$/g, "");
    if (inline && rendered.slice(0, 3) === "<p>" && rendered.slice(-4) === "</p>") {
      var inner = rendered.slice(3, -4);
      if (inner.indexOf("<p>") === -1 && inner.indexOf("<p ") === -1) {
        rendered = inner;
      }
    }
    return rendered;
  }

  /** Mirrors build.py's feed_html() (minus URL/email auto-linking, skipped
   * on purpose for the preview - plain text is fine here). */
  function feedHtml(items) {
    items = items || [];
    var out = items.map(function (item) {
      return "<p>" + esc(item).replace(/\n/g, "<br>") + "</p>";
    });
    return '<div class="newsfeed">\n' + out.join("\n") + "\n</div>";
  }

  /** Mirrors build.py's photos_gallery_section() for a flat list of image
   * paths (used by the *-news pages' "gallery.photos" field). */
  function photosGallerySection(filenames, eyebrow, title) {
    filenames = filenames || [];
    if (!filenames.length) return "";
    eyebrow = eyebrow || "Photos";
    title = title || "Gallery";
    var figures = filenames
      .map(function (f) {
        return '<figure><img loading="lazy" src="' + asset(f) + '" alt=""></figure>';
      })
      .join("\n");
    return (
      '\n<section class="alerts">\n  <div class="wrap">\n    <p class="eyebrow">' +
      esc(eyebrow) +
      "</p>\n    <h2>" +
      (title || "") +
      '</h2>\n    <div class="gallery">\n' +
      figures +
      "\n    </div>\n  </div>\n</section>\n"
    );
  }

  /** Mirrors build.py's youtube_embed() - any pasted YouTube URL shape. */
  var YOUTUBE_ID_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
  function youtubeEmbed(url) {
    if (!url) return "";
    var m = YOUTUBE_ID_RE.exec(url);
    if (!m) return "";
    return (
      '\n    <div class="video-embed">\n      <iframe src="https://www.youtube.com/embed/' +
      m[1] +
      '" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" loading="lazy" allowfullscreen></iframe>\n    </div>'
    );
  }

  /** Mirrors build.py's pagehead() helper. */
  function pageheadHtml(eyebrow, title, lede, imgSrc, imgAlt, imgStyle) {
    var imgAttr = imgStyle ? ' style="' + imgStyle + '"' : "";
    var imgHtml = imgSrc
      ? '<div class="frame"><img loading="lazy" src="' +
        asset(imgSrc) +
        '" alt="' +
        (imgAlt || "") +
        '"' +
        imgAttr +
        "></div>"
      : "";
    var outerStyle = imgSrc ? "" : ' style="grid-template-columns:1fr"';
    return (
      '\n<header class="pagehead">\n  <div class="pagehead-in"' +
      outerStyle +
      '>\n    <div>\n      <p class="eyebrow">' +
      (eyebrow || "") +
      '</p>\n      <h1 class="pagetitle">' +
      (title || "") +
      '</h1>\n      <p class="lede">' +
      (lede || "") +
      "</p>\n    </div>" +
      imgHtml +
      "\n  </div>\n</header>\n"
    );
  }

  function topbar() {
    return h("div", { className: "preview-topbar" }, "Ronny ", h("em", null, "Flas"));
  }

  /** Wraps a raw HTML string body into the React tree Decap expects, with a
   * small static top bar above it (no real nav - this is a content preview,
   * not a site-navigation preview).
   *
   * `sectionLabels`, if given, is an array of French field-group labels (the
   * same wording as the matching `label:` in admin/config.yml) in the exact
   * order the page's top-level <header>/<section> blocks appear in
   * `bodyHtml`. Once mounted, each top-level block gets tagged so hovering
   * it in the preview highlights it and shows (via the browser's native
   * title tooltip) which form section to edit - a full click-to-jump isn't
   * something Decap exposes a stable way to build, this is the reliable
   * middle ground. */
  function frame(bodyHtml, sectionLabels) {
    return h(
      "div",
      { className: "preview-wrap" },
      topbar(),
      h("div", {
        dangerouslySetInnerHTML: { __html: bodyHtml || "" },
        ref: function (el) {
          if (!el || !sectionLabels || !sectionLabels.length) return;
          try {
            var children = el.children;
            for (var i = 0; i < children.length && i < sectionLabels.length; i++) {
              if (!sectionLabels[i]) continue;
              children[i].classList.add("cms-field-tag");
              children[i].setAttribute("title", "Modifier dans : " + sectionLabels[i]);
            }
          } catch (e) {
            // Le surlignage est un bonus - une erreur ici ne doit jamais
            // empêcher l'aperçu lui-même de s'afficher.
          }
        },
      })
    );
  }

  function safe(fn) {
    try {
      return fn() || "";
    } catch (e) {
      console.error("preview.js: erreur de rendu", e);
      return '<p style="padding:20px;color:#900">Aperçu indisponible pour le moment (données incomplètes).</p>';
    }
  }

  // ---------------------------------------------------------------------
  // HOME
  // ---------------------------------------------------------------------
  function homeBody(d) {
    var hero = d.hero || {};
    var latest = d.latest || {};
    var sections = d.sections || {};
    var contact = d.contact || {};

    var roles = (hero.roles || [])
      .map(function (r) {
        var sub = r.sub ? '<span class="role-s">' + r.sub + "</span>" : "";
        return '<li><a href="' + (r.href || "#") + '"><span class="role-t">' + (r.title || "") + "</span>" + sub + "</a></li>";
      })
      .join("\n");

    var heroPhotos = (hero.photos || [])
      .map(function (p) {
        return '<div class="frame hero-photo"><img src="' + asset(p.photo) + '" alt="' + (p.photo_alt || "") + '"></div>';
      })
      .join("\n");

    var alertParas = (latest.alert_paragraphs || []).map(function (p) { return "<p>" + mdRender(p, true) + "</p>"; }).join("\n");

    var domains = (sections.domains || [])
      .map(function (x) {
        var style = x.photo_style ? ' style="' + x.photo_style + '"' : "";
        var facts = (x.facts || []).map(function (f) { return "<li>" + f + "</li>"; }).join("\n");
        return (
          '<article class="domain"><div class="shot"><img loading="lazy" src="' +
          asset(x.photo) +
          '" alt="' +
          (x.photo_alt || "") +
          '"' +
          style +
          '></div><div class="domain-body"><h3>' +
          (x.title || "") +
          "</h3><p>" +
          (x.desc || "") +
          '</p><ul class="facts">' +
          facts +
          '</ul><a class="btn" href="' +
          (x.button_href || "#") +
          '">' +
          (x.button_text || "") +
          "</a></div></article>"
        );
      })
      .join("\n");

    return (
      '\n<header class="hero">\n  <div class="hero-in">\n    <h1 class="name">Ronny<span class="last">Flas</span></h1>\n    <p class="tagline">' +
      (hero.tagline || "") +
      '</p>\n    <div class="photo-pair">\n' +
      heroPhotos +
      '\n    </div>\n    <ul class="roles">\n' +
      roles +
      '\n    </ul>\n  </div>\n</header>\n\n<section class="alerts">\n  <div class="wrap">\n    <div class="alerts-head">\n      <p class="eyebrow" style="margin:0">' +
      (latest.eyebrow || "") +
      "</p>\n      <h2>" +
      (latest.heading || "") +
      '</h2>\n    </div>\n    <article class="alert" style="max-width:640px">\n      <span class="tag">' +
      (latest.alert_tag || "") +
      "</span>\n      <h3>" +
      (latest.alert_title || "") +
      "</h3>\n" +
      alertParas +
      '\n      <a class="btn" href="' +
      (latest.button_href || "#") +
      '">' +
      (latest.button_text || "") +
      '</a>\n    </article>\n  </div>\n</section>\n\n<section>\n  <div class="wrap">\n    <p class="eyebrow">' +
      (sections.eyebrow || "") +
      "</p>\n    <h2>" +
      (sections.heading || "") +
      '</h2>\n\n    <div class="domains">\n' +
      domains +
      '\n    </div>\n  </div>\n</section>\n\n<section class="contact">\n  <div class="wrap">\n    <p class="eyebrow">' +
      mdRender(contact.eyebrow_html, true) +
      "</p>\n    <h2>" +
      (contact.heading || "") +
      '</h2>\n    <p class="lede"><a class="mailto" href="mailto:' +
      (contact.email || "") +
      '">' +
      (contact.email || "") +
      '</a></p>\n    <p style="margin-top:24px"><a class="btn btn-solid" href="' +
      (contact.button_href || "#") +
      '">' +
      (contact.button_text || "") +
      "</a></p>\n  </div>\n</section>\n"
    );
  }

  CMS.registerPreviewTemplate(
    "home",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return homeBody(d); }), [
          "En-tête (photo + accroche)",
          'Bloc "Latest" (actualité en avant)',
          'Section "Sport · Music · Food Business · Charity"',
          "Bloc Contact (bas de page d'accueil)",
        ]);
      },
    })
  );

  // ---------------------------------------------------------------------
  // SPORT
  // ---------------------------------------------------------------------
  function specBlock(s) {
    s = s || {};
    var sub = s.sub ? '<span class="sub">' + s.sub + "</span>" : "";
    var body = mdRender(s.body_html, false);
    var value = s.multiline ? "\n          " + body + "\n        " : body;
    return '<div class="spec"><div class="spec-k">' + (s.key || "") + sub + '</div><div class="spec-v">' + value + "</div></div>";
  }

  function sportBody(d) {
    var ph = d.pagehead || {};
    var quote = d.quote || {};
    var record = d.record || {};
    var coaching = d.coaching || {};
    var gallery = d.gallery || {};
    var newsTeaser = d.news_teaser || {};

    var recordSpecs = (record.specs || []).map(specBlock).join("\n");
    var coachingSpecs = (coaching.specs || []).map(specBlock).join("\n");
    var coachingVideo = youtubeEmbed(coaching.video_url);
    var photos = (gallery.photos || [])
      .map(function (p) {
        return (
          '<figure><img loading="lazy" src="' +
          asset(p.file) +
          '" alt="' +
          (p.alt || "") +
          '"><figcaption>' +
          (p.caption || "") +
          "</figcaption></figure>"
        );
      })
      .join("\n");

    return (
      pageheadHtml(ph.eyebrow, ph.title, ph.lede, ph.photo, ph.photo_alt) +
      '\n<section class="alerts">\n  <div class="wrap">\n    <p class="eyebrow">' +
      (quote.eyebrow || "") +
      '</p>\n    <blockquote class="pull">' +
      (quote.text || "") +
      '</blockquote>\n  </div>\n</section>\n\n<section>\n  <div class="wrap">\n    <p class="eyebrow">' +
      (record.eyebrow || "") +
      "</p>\n    <h2>" +
      (record.heading || "") +
      '</h2>\n    <div class="specs">\n' +
      recordSpecs +
      '\n    </div>\n  </div>\n</section>\n\n<section class="alerts">\n  <div class="wrap">\n    <p class="eyebrow">' +
      (coaching.eyebrow || "") +
      "</p>\n    <h2>" +
      (coaching.heading || "") +
      '</h2>\n    <div class="specs">\n' +
      coachingSpecs +
      "\n    </div>" +
      coachingVideo +
      '\n  </div>\n</section>\n\n<section>\n  <div class="wrap">\n    <p class="eyebrow">' +
      (gallery.eyebrow || "") +
      "</p>\n    <h2>" +
      (gallery.heading || "") +
      '</h2>\n    <div class="gallery">\n' +
      photos +
      '\n    </div>\n    <p style="margin-top:26px"><a class="btn" href="/personalpictures/">Click here to see all the pictures</a></p>\n  </div>\n</section>\n\n<section class="alerts">\n  <div class="wrap">\n    <p class="eyebrow">' +
      (newsTeaser.eyebrow || "") +
      "</p>\n    <h2>" +
      (newsTeaser.heading || "") +
      '</h2>\n    <p class="lede">' +
      (newsTeaser.lede || "") +
      '</p>\n    <p style="margin-top:24px"><a class="btn" href="' +
      (newsTeaser.button_href || "#") +
      '">' +
      (newsTeaser.button_text || "") +
      "</a></p>\n  </div>\n</section>\n"
    );
  }

  CMS.registerPreviewTemplate(
    "sport",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return sportBody(d); }), [
          "En-tête de page",
          "Citation",
          "Palmarès (disciplines)",
          "Coaching / promotion",
          "Galerie photos",
          'Bandeau "Sport news"',
        ]);
      },
    })
  );

  // ---------------------------------------------------------------------
  // MUSIC
  // ---------------------------------------------------------------------
  function chipBlock(section) {
    section = section || {};
    var chips = (section.chips || []).map(function (c) { return "<li>" + c + "</li>"; }).join("\n");
    return (
      '<div class="spec"><div class="spec-k">' +
      (section.key || "") +
      '</div><div class="spec-v">\n          <ul class="chips">\n' +
      chips +
      '\n            <li class="wide">' +
      (section.wide_extra || "") +
      "</li>\n          </ul>\n        </div></div>"
    );
  }

  function musicBody(d) {
    var ph = d.pagehead || {};
    var deals = d.deals || {};
    var studios = d.studios || {};
    var fairs = d.fairs || {};
    var artists = d.artists || {};
    var vp = d.video_producer || {};

    function photoBlock(photos) {
      photos = photos || [];
      if (!photos.length) return "";
      var frames = photos
        .map(function (p) {
          return '<div class="frame hero-photo"><img src="' + asset(p.photo) + '" alt="' + (p.photo_alt || "") + '"></div>';
        })
        .join("\n");
      var style = photos.length === 1 ? ' style="grid-template-columns:1fr;max-width:420px"' : "";
      return '<div class="photo-pair"' + style + ">\n" + frames + "\n    </div>";
    }

    var heroPhotoBlock = photoBlock(d.photos);
    var photosHtml = heroPhotoBlock
      ? "\n<section>\n  <div class=\"wrap\">\n    " + heroPhotoBlock + "\n  </div>\n</section>\n"
      : "";

    var buttonsHtml = (artists.buttons || [])
      .map(function (b) { return '<a class="btn" href="' + (b.href || "#") + '">' + (b.text || "") + "</a>"; })
      .join(" &nbsp; ");

    var videoProducerHtml = vp.heading
      ? (
          '\n<section>\n  <div class="wrap">\n' +
          (vp.eyebrow ? '    <p class="eyebrow">' + vp.eyebrow + "</p>\n" : "") +
          "    <h2>" +
          vp.heading +
          "</h2>\n" +
          (vp.lede ? '    <p class="lede">' + mdRender(vp.lede, true) + "</p>\n" : "") +
          "    " +
          photoBlock(vp.photos) +
          "\n  </div>\n</section>\n"
        )
      : "";

    return (
      pageheadHtml(ph.eyebrow, ph.title, ph.lede) +
      photosHtml +
      '\n<section class="alerts">\n  <div class="wrap">\n    <p class="eyebrow">' +
      (deals.eyebrow || "") +
      "</p>\n    <h2>" +
      (deals.heading || "") +
      '</h2>\n    <div class="specs">\n' +
      chipBlock(deals) +
      '\n    </div>\n  </div>\n</section>\n\n<section>\n  <div class="wrap">\n    <p class="eyebrow">' +
      (studios.eyebrow || "") +
      "</p>\n    <h2>" +
      (studios.heading || "") +
      '</h2>\n    <p class="lede">' +
      (studios.lede || "") +
      '</p>\n    <div class="specs">\n' +
      chipBlock(studios) +
      "\n    </div>\n    " +
      photoBlock(studios.photos) +
      '\n  </div>\n</section>\n\n<section class="alerts">\n  <div class="wrap">\n    <p class="eyebrow">' +
      (fairs.eyebrow || "") +
      "</p>\n    <h2>" +
      (fairs.heading || "") +
      '</h2>\n    <div class="specs">\n' +
      chipBlock(fairs) +
      "\n    </div>\n    " +
      photoBlock(fairs.photos) +
      '\n  </div>\n</section>\n\n<section>\n  <div class="wrap">\n    <p class="eyebrow">' +
      (artists.eyebrow || "") +
      "</p>\n    <h2>" +
      (artists.heading || "") +
      '</h2>\n    <div class="specs">\n' +
      chipBlock(artists) +
      '\n    </div>\n    <p style="margin-top:26px">' +
      buttonsHtml +
      "</p>\n  </div>\n</section>\n" +
      videoProducerHtml
    );
  }

  CMS.registerPreviewTemplate(
    "music",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return musicBody(d); }), [
          "En-tête de page",
          "Photos",
          "Contrats internationaux",
          "Studios d'enregistrement",
          "Salons professionnels",
          "Artistes / pays",
          "Music Video Producer",
        ]);
      },
    })
  );

  // ---------------------------------------------------------------------
  // FOOD BUSINESS
  // ---------------------------------------------------------------------
  function foodBusinessBody(d) {
    var ph = d.pagehead || {};
    var sp = d.specialities || {};
    var products = d.products || {};
    var clients = d.clients || {};

    var specialities = (sp.items || [])
      .map(function (i) {
        return '<div class="honour"><div class="k">' + mdRender(i.k, true) + '</div><div class="v">' + (i.v || "") + "</div></div>";
      })
      .join("\n");
    var companies = (sp.companies || [])
      .map(function (c) {
        return '<li><a href="' + (c.href || "#") + '" style="text-decoration:none">' + (c.label || "") + "</a></li>";
      })
      .join("\n");
    var productPhotos = (products.photos || [])
      .map(function (p) {
        return '<figure><img loading="lazy" src="' + asset(p.file) + '" alt="' + (p.alt || "") + '"></figure>';
      })
      .join("\n");
    var retailChips = (clients.retail_chips || []).map(function (c) { return "<li>" + c + "</li>"; }).join("\n");
    var wholesalerChips = (clients.wholesaler_chips || []).map(function (c) { return "<li>" + c + "</li>"; }).join("");
    var gasChips = (clients.gas_station_chips || []).map(function (c) { return "<li>" + c + "</li>"; }).join("");
    var independantItems = (clients.independant_items || []).map(function (c) { return "<li>" + c + "</li>"; }).join("");

    var photoStyleAttr = ph.photo_style ? ' style="' + ph.photo_style + '"' : "";

    return (
      '\n<header class="pagehead">\n  <div class="pagehead-in">\n    <div>\n      <p class="eyebrow">' +
      (ph.eyebrow || "") +
      '</p>\n      <h1 class="pagetitle">' +
      mdRender(ph.title, true) +
      '</h1>\n      <p class="lede">' +
      (ph.lede || "") +
      '</p>\n    </div>\n    <div class="frame"><img loading="lazy" src="' +
      asset(ph.photo) +
      '" alt="' +
      (ph.photo_alt || "") +
      '"' +
      photoStyleAttr +
      '></div>\n  </div>\n</header>\n\n<section>\n  <div class="wrap">\n    <p class="eyebrow">' +
      (sp.eyebrow || "") +
      "</p>\n    <h2>" +
      (sp.heading || "") +
      '</h2>\n    <div class="honour-grid" style="grid-template-columns:repeat(5,1fr)">\n' +
      specialities +
      '\n    </div>\n    <div class="specs">\n      <div class="spec">\n        <div class="spec-k">Companies</div>\n        <div class="spec-v">\n          <ul class="chips">\n' +
      companies +
      '\n          </ul>\n        </div>\n      </div>\n    </div>\n    <p style="margin-top:26px"><a class="btn" href="' +
      (sp.news_button_href || "#") +
      '">' +
      (sp.news_button_text || "") +
      '</a></p>\n  </div>\n</section>\n\n<section>\n  <div class="wrap">\n    <p class="eyebrow">' +
      (products.eyebrow || "") +
      "</p>\n    <h2>" +
      (products.heading || "") +
      '</h2>\n    <div class="gallery">\n' +
      productPhotos +
      '\n    </div>\n    <div class="frame" style="max-width:220px; aspect-ratio:1007/541; margin-top:14px; background:#000">\n      <img loading="lazy" src="' +
      asset(products.retaxa_photo) +
      '" alt="' +
      (products.retaxa_alt || "") +
      '" style="width:100%;height:100%;object-fit:contain">\n    </div>\n  </div>\n</section>\n\n<section class="alerts">\n  <div class="wrap">\n    <p class="eyebrow">' +
      (clients.eyebrow || "") +
      "</p>\n    <h2>" +
      (clients.heading || "") +
      '</h2>\n    <div class="specs">\n      <div class="spec">\n        <div class="spec-k">Retail</div>\n        <div class="spec-v">\n          <ul class="chips">\n' +
      retailChips +
      '\n          </ul>\n          <p style="margin-top:14px; font-size:14px">' +
      (clients.retail_note || "") +
      '</p>\n        </div>\n      </div>\n      <div class="spec">\n        <div class="spec-k">Wholesalers</div>\n        <div class="spec-v"><ul class="chips">' +
      wholesalerChips +
      '</ul></div>\n      </div>\n      <div class="spec">\n        <div class="spec-k">Gas stations</div>\n        <div class="spec-v"><ul class="chips">' +
      gasChips +
      '</ul></div>\n      </div>\n      <div class="spec">\n        <div class="spec-k">Independant customers</div>\n        <div class="spec-v">\n          <ul>' +
      independantItems +
      "</ul>\n        </div>\n      </div>\n    </div>\n  </div>\n</section>\n"
    );
  }

  CMS.registerPreviewTemplate(
    "food-business",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return foodBusinessBody(d); }), [
          "En-tête de page",
          "Spécialités",
          "Nos produits",
          "Nos clients",
        ]);
      },
    })
  );

  // ---------------------------------------------------------------------
  // CHARITY
  // ---------------------------------------------------------------------
  function charityBody(d) {
    var ph = d.pagehead || {};
    var b = d.body || {};
    return (
      pageheadHtml(ph.eyebrow, ph.title, ph.lede, ph.photo, ph.photo_alt) +
      '\n<section>\n  <div class="wrap" style="max-width:74ch">\n    <p class="eyebrow">' +
      (b.eyebrow || "") +
      "</p>\n    <h2>" +
      (b.heading || "") +
      '</h2>\n    <blockquote class="pull">' +
      (b.quote || "") +
      '</blockquote>\n    <p class="lede">' +
      mdRender(b.lede, true) +
      '</p>\n    <p style="margin-top:24px"><a class="btn btn-solid" href="' +
      (b.button_href || "#") +
      '">' +
      (b.button_text || "") +
      "</a></p>\n  </div>\n</section>\n"
    );
  }

  CMS.registerPreviewTemplate(
    "charity",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return charityBody(d); }), ["En-tête de page", "Corps de la page"]);
      },
    })
  );

  // ---------------------------------------------------------------------
  // NEWS (page d'index)
  // ---------------------------------------------------------------------
  function newsBody(d) {
    var ph = d.pagehead || {};
    var links = (d.links || [])
      .map(function (l) { return '<li><a href="' + (l.href || "#") + '">' + (l.text || "") + "</a></li>"; })
      .join("\n");
    return (
      pageheadHtml(ph.eyebrow, ph.title, ph.lede) +
      '\n<section>\n  <div class="wrap">\n    <ul class="news-links">\n' +
      links +
      "\n    </ul>\n  </div>\n</section>\n"
    );
  }

  CMS.registerPreviewTemplate(
    "news",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return newsBody(d); }), ["En-tête de page", "Liens vers les 5 rubriques"]);
      },
    })
  );

  // ---------------------------------------------------------------------
  // CASTINGS
  // ---------------------------------------------------------------------
  function castingsBody(d) {
    var ph = d.pagehead || {};
    var a = d.alert || {};
    var paras = (a.paragraphs || []).map(function (p) { return "<p>" + (p || "") + "</p>"; }).join("\n");
    return (
      pageheadHtml(ph.eyebrow, ph.title, ph.lede) +
      '\n<section class="alerts">\n  <div class="wrap">\n    <article class="alert" style="max-width:680px">\n      <span class="tag">' +
      (a.tag || "") +
      "</span>\n      <h3>" +
      (a.title || "") +
      "</h3>\n" +
      paras +
      '\n      <a class="btn btn-solid" href="mailto:' +
      (a.email || "") +
      '">' +
      (a.email || "") +
      "</a>\n    </article>\n  </div>\n</section>\n"
    );
  }

  CMS.registerPreviewTemplate(
    "castings",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return castingsBody(d); }), ["En-tête de page", "Annonce"]);
      },
    })
  );

  // ---------------------------------------------------------------------
  // FOOD BUSINESS NEWS / MUSIC NEWS / SPORT NEWS (même structure)
  // ---------------------------------------------------------------------
  function newsPageBody(d) {
    var ph = d.pagehead || {};
    var gallery = d.gallery || {};
    var back = d.back_button || {};
    return (
      pageheadHtml(ph.eyebrow, ph.title, ph.lede, ph.photo, ph.photo_alt, ph.photo_style) +
      '\n<section>\n  <div class="wrap">\n    ' +
      feedHtml(d.items) +
      '\n    <p style="margin-top:26px"><a class="btn" href="' +
      (back.href || "#") +
      '">' +
      (back.text || "") +
      "</a></p>\n  </div>\n</section>\n" +
      photosGallerySection(gallery.photos, gallery.eyebrow, gallery.title)
    );
  }

  ["food-business-news", "music-news", "sport-news"].forEach(function (name) {
    CMS.registerPreviewTemplate(
      name,
      createClass({
        render: function () {
          var d = toData(this.props.entry);
          return frame(safe(function () { return newsPageBody(d); }), [
            "En-tête de page",
            "Actualités (une entrée = un encart) + Bouton retour",
            "Galerie photo",
          ]);
        },
      })
    );
  });

  // ---------------------------------------------------------------------
  // CHARITY NEWS
  // ---------------------------------------------------------------------
  function photoImg(src, alt) {
    return (
      '<img loading="lazy" src="' +
      asset(src) +
      '" alt="' +
      (alt || "") +
      '" style="display:block;max-width:220px;max-height:280px;width:auto;height:auto;margin-bottom:12px;border:1px solid var(--line)">'
    );
  }
  function logoImg(src, alt) {
    return (
      '<img loading="lazy" src="' +
      asset(src) +
      '" alt="' +
      (alt || "") +
      '" style="max-width:130px;display:block;margin-bottom:12px;background:#fff;padding:6px;border:1px solid var(--line)">'
    );
  }
  function smiletrainImg(src, alt) {
    return (
      '<img loading="lazy" src="' +
      asset(src) +
      '" alt="' +
      (alt || "") +
      '" style="display:block;max-width:420px;width:100%;height:auto;margin-bottom:12px;border:1px solid var(--line)">'
    );
  }
  var PHOTO_HELPERS = { logo: logoImg, photo: photoImg, smiletrain: smiletrainImg };

  function causeSpec(c) {
    c = c || {};
    // text_html/text_html_2 are markdown-widget fields (mirrors build.py's
    // cause_spec()): mdRender() already wraps a plain paragraph in
    // <p>...</p> (or passes an already-<p>-wrapped raw-HTML value through
    // unchanged), so no manual <p> wrapping is needed here any more.
    var text = mdRender(c.text_html, false);
    if (c.text_html_2) {
      text = text + "\n          " + mdRender(c.text_html_2, false);
    }
    var helper = PHOTO_HELPERS[c.photo_kind];
    var value = text;
    if (helper && c.photo) {
      value = "\n          " + helper(c.photo, c.photo_alt) + "\n          " + text + "\n        ";
    }
    return '<div class="spec"><div class="spec-k">' + (c.key || "") + '</div><div class="spec-v">' + value + "</div></div>";
  }

  function charityNewsBody(d) {
    var ph = d.pagehead || {};
    var regular = d.regular || {};
    var supports = d.supports || {};
    var insects = d.insects || {};
    var organisations = d.organisations || {};
    var back = organisations.back_button || {};

    var alerts = (d.alerts || [])
      .map(function (a) {
        return (
          '<article class="alert">\n        ' +
          (a.photo ? photoImg(a.photo, a.photo_alt) : "") +
          '\n        <span class="tag">' +
          (a.tag || "") +
          "</span>\n        <h3>" +
          (a.title || "") +
          "</h3>\n        <p>" +
          (a.text || "") +
          "</p>\n      </article>"
        );
      })
      .join("\n");

    var regularSpecs = (regular.causes || []).map(causeSpec).join("\n");
    var supportsSpecs = (supports.causes || []).map(causeSpec).join("\n");
    var insectPhotos = (insects.photos || [])
      .map(function (p) {
        return '<figure><img loading="lazy" src="' + asset(p.file) + '" alt="' + (p.alt || "") + '"></figure>';
      })
      .join("\n");
    var insectSpecs = (insects.causes || []).map(causeSpec).join("\n");
    var logos = (organisations.logos || [])
      .map(function (l) {
        return '<div><img loading="lazy" src="' + asset(l.file) + '" alt="' + (l.alt || "") + '"></div>';
      })
      .join("\n");

    return (
      pageheadHtml(ph.eyebrow, ph.title, ph.lede, ph.photo, ph.photo_alt) +
      '\n<section class="alerts">\n  <div class="wrap">\n    <div class="alert-grid">\n' +
      alerts +
      '\n    </div>\n  </div>\n</section>\n\n<section>\n  <div class="wrap">\n    <p class="eyebrow">' +
      (regular.eyebrow || "") +
      "</p>\n    <h2>" +
      (regular.heading || "") +
      '</h2>\n    <div class="specs">\n' +
      regularSpecs +
      '\n    </div>\n  </div>\n</section>\n\n<section class="alerts">\n  <div class="wrap">\n    <p class="eyebrow">' +
      (supports.eyebrow || "") +
      "</p>\n    <h2>" +
      (supports.heading || "") +
      '</h2>\n    <div class="specs">\n' +
      supportsSpecs +
      '\n    </div>\n  </div>\n</section>\n\n<section>\n  <div class="wrap">\n    <p class="eyebrow">' +
      (insects.eyebrow || "") +
      "</p>\n    <h2>" +
      (insects.heading || "") +
      '</h2>\n    <div class="gallery" style="grid-template-columns:repeat(3,1fr);max-width:640px">\n' +
      insectPhotos +
      '\n    </div>\n    <div class="specs" style="margin-top:20px">\n' +
      insectSpecs +
      '\n    </div>\n  </div>\n</section>\n\n<section class="alerts">\n  <div class="wrap">\n    <p class="eyebrow">' +
      (organisations.eyebrow || "") +
      "</p>\n    <h2>" +
      (organisations.heading || "") +
      '</h2>\n    <div class="logos">\n' +
      logos +
      '\n    </div>\n    <p style="margin-top:26px"><a class="btn" href="' +
      (back.href || "#") +
      '">' +
      (back.text || "") +
      "</a></p>\n  </div>\n</section>\n"
    );
  }

  CMS.registerPreviewTemplate(
    "charity-news",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return charityNewsBody(d); }), [
          "En-tête de page",
          "Alertes en haut de page (ex: Bibi, Leo)",
          "Actions régulières",
          "Autres causes soutenues",
          "Protection des insectes",
          "Organisations soutenues",
        ]);
      },
    })
  );

  // ---------------------------------------------------------------------
  // JOBS
  // ---------------------------------------------------------------------
  function jobsBody(d) {
    var ph = d.pagehead || {};
    var unsolicited = d.unsolicited || {};
    var openings = d.openings || {};

    var positions = (openings.positions || [])
      .map(function (p) {
        return (
          '<div class="spec"><div class="spec-k">' +
          (p.title || "") +
          '<span class="sub">' +
          (p.sub || "") +
          '</span></div><div class="spec-v">\n          ' +
          mdRender(p.body_html, false) +
          "\n        </div></div>"
        );
      })
      .join("\n");

    return (
      pageheadHtml(ph.eyebrow, ph.title, ph.lede, ph.photo, ph.photo_alt) +
      '\n<section class="alerts">\n  <div class="wrap">\n    <p class="eyebrow">' +
      (unsolicited.eyebrow || "") +
      '</p>\n    <p class="lede">' +
      mdRender(unsolicited.lede, true) +
      '</p>\n  </div>\n</section>\n\n<section>\n  <div class="wrap">\n    <p class="eyebrow">' +
      (openings.eyebrow || "") +
      "</p>\n    <h2>" +
      (openings.heading || "") +
      '</h2>\n    <div class="specs">\n' +
      positions +
      "\n    </div>\n  </div>\n</section>\n"
    );
  }

  CMS.registerPreviewTemplate(
    "jobs",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return jobsBody(d); }), [
          "En-tête de page",
          "Candidature spontanée",
          "Postes ouverts",
        ]);
      },
    })
  );

  // ---------------------------------------------------------------------
  // CONTACT
  // ---------------------------------------------------------------------
  function contactBody(d) {
    var ph = d.pagehead || {};
    var b = d.body || {};
    return (
      pageheadHtml(ph.eyebrow, ph.title, ph.lede) +
      '\n<section class="contact">\n  <div class="wrap">\n    <p class="lede">' +
      mdRender(b.lede, true) +
      "</p>\n  </div>\n</section>\n"
    );
  }

  CMS.registerPreviewTemplate(
    "contact",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return contactBody(d); }), ["En-tête de page", "Corps de la page"]);
      },
    })
  );

  // ---------------------------------------------------------------------
  // PERSONAL PICTURES
  // ---------------------------------------------------------------------
  function personalPicturesGallery(pictures) {
    pictures = pictures || [];
    var out = pictures.map(function (p) {
      var t = esc(p.title || "");
      var cap = "<strong>" + t + "</strong>";
      if (p.desc) cap += " &mdash; " + esc(p.desc);
      return '<figure><img loading="lazy" src="' + asset(p.file) + '" alt="' + t + '"><figcaption>' + cap + "</figcaption></figure>";
    });
    return '<div class="gallery" style="grid-template-columns:repeat(3,1fr)">\n' + out.join("\n") + "\n</div>";
  }

  function personalPicturesBody(d) {
    var ph = d.pagehead || {};
    return (
      pageheadHtml(ph.eyebrow, ph.title, ph.lede) +
      '\n<section>\n  <div class="wrap">\n    ' +
      personalPicturesGallery(d.pictures) +
      "\n  </div>\n</section>\n"
    );
  }

  CMS.registerPreviewTemplate(
    "personal-pictures",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return personalPicturesBody(d); }), ["En-tête de page", "Photos"]);
      },
    })
  );

  // ---------------------------------------------------------------------
  // MUSIC CONSULTING
  // ---------------------------------------------------------------------
  function musicConsultingBody(d) {
    var ph = d.pagehead || {};
    var b = d.body || {};
    return (
      pageheadHtml(ph.eyebrow, ph.title, ph.lede) +
      '\n<section class="contact">\n  <div class="wrap">\n    <p class="lede">' +
      (b.lede || "") +
      "</p>\n    <p>" +
      (b.paragraph || "") +
      '</p>\n    <p style="margin-top:24px">' +
      mdRender(b.closing_html, true) +
      "</p>\n  </div>\n</section>\n"
    );
  }

  CMS.registerPreviewTemplate(
    "music-consulting",
    createClass({
      render: function () {
        var d = toData(this.props.entry);
        return frame(safe(function () { return musicConsultingBody(d); }), ["En-tête de page", "Corps de la page"]);
      },
    })
  );
})();
