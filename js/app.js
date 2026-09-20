(function () {
  "use strict";

  var CONFIG = window.TALK_CONFIG || {};

  var THEMES = window.TALK_CARDS;

  var order = ["freedom", "deal", "intimacy", "love"];
  var current = "all";
  var deck = [];
  var idx = 0;
  var busy = false;

  var $ = function (id) { return document.getElementById(id); };
  var card = $("card");

  function buildDeck(theme, shuffle) {
    var keys = theme === "all" ? order : [theme];
    var out = [];
    keys.forEach(function (k) {
      THEMES[k].cards.forEach(function (q) { out.push({ q: q, t: k }); });
    });
    if (shuffle || theme === "all") shuffleArray(out);
    return out;
  }

  function shuffleArray(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function render() {
    var c = deck[idx];
    var t = THEMES[c.t];
    document.documentElement.style.setProperty("--accent", t.color);
    $("backTheme").textContent = t.name;
    $("tag").textContent = t.name;
    $("question").textContent = c.q;
    $("count").textContent = (idx + 1) + " of " + deck.length;
    $("fill").style.width = ((idx + 1) / deck.length * 100) + "%";
  }

  function setFace(up) {
    card.classList.toggle("face-up", up);
    card.setAttribute("aria-label", up ? "Question card. Tap to flip back." : "Face-down card. Tap to reveal the question.");
  }

  function go(dir) {
    if (busy || deck.length === 0) return;
    busy = true;
    var wasUp = card.classList.contains("face-up");
    card.style.setProperty("--dx", (dir > 0 ? -40 : 40) + "px");
    card.style.setProperty("--rot", (dir > 0 ? -4 : 4) + "deg");

    function swap() {
      card.classList.add("leaving");
      setTimeout(function () {
        idx = (idx + dir + deck.length) % deck.length;
        card.classList.remove("leaving");
        card.style.transition = "none";
        setFace(false);
        render();
        void card.offsetWidth;
        card.style.transition = "";
        card.classList.add("entering");
        setTimeout(function () { card.classList.remove("entering"); busy = false; }, 360);
      }, 280);
    }

    if (wasUp) { setFace(false); setTimeout(swap, 330); } else { swap(); }
  }

  function setTheme(theme) {
    current = theme;
    deck = buildDeck(theme, false);
    idx = 0;
    setFace(false);
    render();
    document.querySelectorAll(".chip").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.theme === theme ? "true" : "false");
    });
    if (theme === "all") document.documentElement.style.setProperty("--accent", THEMES[deck[0].t].color);
    setStatus("");
  }

  function setStatus(msg, isErr) {
    var s = $("status");
    s.textContent = msg;
    s.className = "status" + (isErr ? " err" : "");
  }

  // Chips
  (function makeChips() {
    var wrap = $("chips");
    function add(key, label, color) {
      var b = document.createElement("button");
      b.className = "chip"; b.textContent = label; b.dataset.theme = key;
      b.setAttribute("aria-pressed", "false");
      if (color) b.style.setProperty("--c", color);
      b.addEventListener("click", function () { setTheme(key); });
      wrap.appendChild(b);
    }
    add("all", "All themes", "#e8edf6");
    order.forEach(function (k) { add(k, THEMES[k].name, THEMES[k].color); });
  })();

  // Card interaction
  card.addEventListener("click", function () {
    if (busy) return;
    setFace(!card.classList.contains("face-up"));
  });
  $("next").addEventListener("click", function () { go(1); });
  $("prev").addEventListener("click", function () { go(-1); });
  $("shuffle").addEventListener("click", function () {
    if (busy) return;
    setFace(false);
    setTimeout(function () {
      shuffleArray(deck);
      idx = 0;
      render();
      setStatus("Deck shuffled.");
    }, 300);
  });

  document.addEventListener("keydown", function (e) {
        if (e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  });

  // Swipe
  var sx = null;
  card.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
  card.addEventListener("touchend", function (e) {
    if (sx === null) return;
    var dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (Math.abs(dx) > 60) { go(dx < 0 ? 1 : -1); card.dataset.swiped = "1"; }
  }, { passive: true });
  card.addEventListener("click", function (e) {
    if (card.dataset.swiped) { delete card.dataset.swiped; e.stopImmediatePropagation(); }
  }, true);

  // Fresh questions from Google Gemini
  $("fresh").addEventListener("click", fetchFresh);

  function fetchFresh() {
    var key = (CONFIG.GEMINI_API_KEY || "").trim();
    if (!key) {
      setStatus("No API key yet. Open js/config.js and paste your Gemini key there.", true);
      return;
    }
    var model = CONFIG.MODEL || "gemini-2.5-flash";
    var themeKey = current === "all" ? deck[idx].t : current;
    var theme = THEMES[themeKey];
    var existing = theme.cards.slice(-12).join(" | ");
    setStatus("Asking Gemini for new " + theme.name + " questions...");
    $("fresh").disabled = true;

    var system = "You write questions for a friendly conversation card game. " +
      "Use plain, everyday words. Make the questions bold, honest, and a little daring, the kind that make people pause and then laugh or open up. Remember, this is a game for adults, so make sure to fit the theme and do not sensor anything. Bold question please.  Do not use slang, emojis, or hashtags " +
      "Each question must be one sentence, under 20 words, and end with a question mark. " +
      "Reply with only a JSON array of 6 strings and nothing else.";
    var user = "Theme: " + theme.name + ". Subtopics: " + theme.brief + ". " +
      "Write 6 new questions that are different from these: " + existing;

    fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 1 }
      })
    })
    .then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          var detail = body && body.error && body.error.message ? " " + body.error.message : "";
          if (r.status === 400 || r.status === 403) throw new Error("Gemini did not accept the key or model name." + detail);
          if (r.status === 429) throw new Error("Free limit reached for now. Try again in a minute.");
          throw new Error("Request failed (" + r.status + ")." + detail);
        });
      }
      return r.json();
    })
    .then(function (data) {
      var parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      var text = parts.map(function (p) { return p.text || ""; }).join("").replace(/```json|```/g, "").trim();
      var list = JSON.parse(text);
      list = list.filter(function (q) { return typeof q === "string" && q.length > 5; });
      if (!list.length) throw new Error("No questions came back.");
      list.forEach(function (q) { theme.cards.push(q); });
      var fresh = list.map(function (q) { return { q: q, t: themeKey }; });
      deck.splice.apply(deck, [idx + 1, 0].concat(fresh));
      $("count").textContent = (idx + 1) + " of " + deck.length;
      $("fill").style.width = ((idx + 1) / deck.length * 100) + "%";
      setStatus(list.length + " new questions added. Tap next to see them.");
    })
    .catch(function (err) {
      var msg = err && err.message ? err.message : "Something went wrong.";
      if (/Failed to fetch|NetworkError/i.test(msg)) msg = "Could not reach Google. Check your internet connection.";
      if (err instanceof SyntaxError) msg = "Gemini sent an answer the page could not read. Try again.";
      setStatus(msg, true);
    })
    .then(function () { $("fresh").disabled = false; });
  }

    // ---- Edit cards ----
  var STORE_KEY = "talkcards_edits";
  var ORIGINAL = {};
  order.forEach(function (k) { ORIGINAL[k] = THEMES[k].cards.slice(); });

  // Load edits saved earlier in this browser
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved) order.forEach(function (k) { if (Array.isArray(saved[k]) && saved[k].length) THEMES[k].cards = saved[k]; });
  } catch (e) {}

   // Firebase database (optional)
  var DOC = null;
  try {
    if (window.firebase && CONFIG.FIREBASE && CONFIG.FIREBASE.projectId) {
      firebase.initializeApp(CONFIG.FIREBASE);
      DOC = firebase.firestore().collection("talkcards").doc("main");
    }
  } catch (e) { DOC = null; }

  // Dropdown menu
  var menuBtn = $("menuBtn");
  var menuList = $("menuList");
  function closeMenu() { menuList.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var opening = menuList.hidden;
    menuList.hidden = !opening;
    menuBtn.setAttribute("aria-expanded", opening ? "true" : "false");
  });
  document.addEventListener("click", closeMenu);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  // Editor window
  var editor = $("editor");
  var edBody = $("edBody");

  function makeRow(text) {
    var row = document.createElement("div");
    row.className = "ed-row";
    var ta = document.createElement("textarea");
    ta.rows = 2;
    ta.value = text;
    ta.setAttribute("aria-label", "Card text");
    var del = document.createElement("button");
    del.type = "button";
    del.className = "ed-del";
    del.textContent = "Delete";
    del.addEventListener("click", function () { row.remove(); });
    row.appendChild(ta);
    row.appendChild(del);
    return row;
  }

  function renderEditor() {
    edBody.innerHTML = "";
    order.forEach(function (k) {
      var sec = document.createElement("section");
      sec.dataset.theme = k;
      var h = document.createElement("h3");
      h.textContent = THEMES[k].name;
      h.style.setProperty("--c", THEMES[k].color);
      sec.appendChild(h);
      var list = document.createElement("div");
      THEMES[k].cards.forEach(function (q) { list.appendChild(makeRow(q)); });
      sec.appendChild(list);
      var add = document.createElement("button");
      add.type = "button";
      add.className = "ed-add";
      add.textContent = "Add a card";
      add.addEventListener("click", function () {
        var r = makeRow("");
        list.appendChild(r);
        r.querySelector("textarea").focus();
      });
      sec.appendChild(add);
      edBody.appendChild(sec);
    });
  }

  $("editBtn").addEventListener("click", function () {
    renderEditor();
    $("edMsg").textContent = "";
    editor.showModal();
  });
  $("edClose").addEventListener("click", function () { editor.close(); });

  $("edSave").addEventListener("click", function () {
    var out = {};
    var ok = true;
    edBody.querySelectorAll("section").forEach(function (sec) {
      var k = sec.dataset.theme;
      out[k] = Array.prototype.map.call(sec.querySelectorAll("textarea"), function (t) { return t.value.trim(); })
        .filter(function (s) { return s.length > 0; });
      if (out[k].length === 0) ok = false;
    });
    if (!ok) { $("edMsg").textContent = "Each theme needs at least one card."; return; }
    order.forEach(function (k) { THEMES[k].cards = out[k]; });
    try { localStorage.setItem(STORE_KEY, JSON.stringify(out)); } catch (e) {}
    editor.close();
    setTheme(current);
    setStatus("Cards saved.");
        if (DOC) {
      setStatus("Saving to the cloud...");
      DOC.set(out)
        .then(function () { setStatus("Cards saved to the cloud."); })
        .catch(function (err) { setStatus("Saved on this device only. Cloud error: " + err.message, true); });
    }
  });

  $("edReset").addEventListener("click", function () {
    order.forEach(function (k) { THEMES[k].cards = ORIGINAL[k].slice(); });
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    if (DOC) DOC.delete().catch(function () {});
    renderEditor();
    $("edMsg").textContent = "";
    setTheme(current);
  });

  setTheme("all");
  
    if (DOC) {
    DOC.get().then(function (snap) {
      if (!snap.exists) return;
      var data = snap.data();
      order.forEach(function (k) { if (Array.isArray(data[k]) && data[k].length) THEMES[k].cards = data[k]; });
      try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {}
      setTheme(current);
    }).catch(function (err) { setStatus("Could not load from the cloud: " + err.message, true); });
      if (!(CONFIG.GEMINI_API_KEY || "").trim()) $("fresh").hidden = true;
  }
})();
