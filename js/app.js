(function () {
  "use strict";

  var CONFIG = window.TALK_CONFIG || {};

  var THEMES = window.TALK_CARDS;

  var order = ["freedom", "deal", "intimacy", "love", "character"];
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
    $("themeSelect").value = theme;
    if (theme === "all") document.documentElement.style.setProperty("--accent", THEMES[deck[0].t].color);
    setStatus("");
  }

  function setStatus(msg, isErr) {
    var s = $("status");
    s.textContent = msg;
    s.className = "status" + (isErr ? " err" : "");
  }

  // Theme dropdown
  (function populateThemeSelect() {
    var sel = $("themeSelect");
    function addOption(key, label) {
      var o = document.createElement("option");
      o.value = key; o.textContent = label;
      sel.appendChild(o);
    }
    addOption("all", "All themes");
    order.forEach(function (k) { addOption(k, THEMES[k].name); });
    sel.addEventListener("change", function () { setTheme(sel.value); });
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

    fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key), {
      method: "POST",
      headers: {
        "content-type": "application/json"
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

      var entries = list.map(function (q) { return { text: q, by: MY_ID, source: "ai" }; });
      entries.forEach(function (e) { ADDED[themeKey].push(e); });
      rebuildCards(); saveAddedLocally();
      if (DOC) {
        var fv = firebase.firestore.FieldValue.arrayUnion.apply(null, entries);
        var patch = {}; patch[themeKey] = fv;
        DOC.set(patch, { merge: true }).catch(function (err) { setStatus("Added here, but not saved to the cloud: " + err.message, true); });
      }

      var fresh = list.map(function (q) { return { q: q, t: themeKey }; });
      deck.splice.apply(deck, [idx + 1, 0].concat(fresh));
      $("count").textContent = (idx + 1) + " of " + deck.length;
      $("fill").style.width = ((idx + 1) / deck.length * 100) + "%";
      setStatus(list.length + " new questions added and saved to the cloud. Tap next to see them.");
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
    var MY_ID = (function () {
    try {
      var id = localStorage.getItem("talkcards_myid");
      if (!id) {
        id = "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("talkcards_myid", id);
      }
      return id;
    } catch (e) { return "u_anon"; }
  })();

  function normalizeItem(item) {
    if (typeof item === "string") return { text: item, by: null, source: "manual" };
    return { text: item.text, by: item.by || null, source: item.source || "manual" };
  }

  var STORE_KEY = "talkcards_added";
  var BASE = {};
  order.forEach(function (k) { BASE[k] = THEMES[k].cards.slice(); });
  var ADDED = { freedom: [], deal: [], intimacy: [], love: [], character: [] };

  function rebuildCards() {
    order.forEach(function (k) {
      var extra = ADDED[k].map(function (item) { return normalizeItem(item).text; });
      THEMES[k].cards = BASE[k].concat(extra);
    });
  }
  function saveAddedLocally() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(ADDED)); } catch (e) {}
  }

  // Load anything added earlier in this browser, before Firebase answers
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved) order.forEach(function (k) { if (Array.isArray(saved[k])) ADDED[k] = saved[k]; });
  } catch (e) {}
  rebuildCards();

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

   function renderEditor() {
    edBody.innerHTML = "";
    order.forEach(function (k) {
      var sec = document.createElement("section");
      var h = document.createElement("h3");
      h.textContent = THEMES[k].name;
      h.style.setProperty("--c", THEMES[k].color);
      sec.appendChild(h);

      var list = document.createElement("ul");
      list.className = "ed-added";
      ADDED[k].forEach(function (raw, i) {
        var item = normalizeItem(raw);
        var li = document.createElement("li");
        var span = document.createElement("span");
        span.textContent = item.text;
        li.appendChild(span);
        if (item.by === MY_ID) {
          var x = document.createElement("button");
          x.className = "ed-x"; x.type = "button"; x.textContent = "\u00d7";
          x.setAttribute("aria-label", "Remove this card");
          x.addEventListener("click", function () {
            ADDED[k].splice(i, 1);
            rebuildCards(); saveAddedLocally();
            if (DOC) DOC.set(makeOut(), { merge: true }).catch(function () {});
            renderEditor();
            setTheme(current);
          });
          li.appendChild(x);
        } else {
          var lock = document.createElement("span");
          lock.className = "ed-lock";
          lock.textContent = "Added by someone else";
          li.appendChild(lock);
        }
        list.appendChild(li);
      });
      sec.appendChild(list);

      var row = document.createElement("div");
      row.className = "ed-new";
      var input = document.createElement("textarea");
      input.rows = 3;
      input.placeholder = "Write a new " + THEMES[k].name.toLowerCase() + " question";
      input.addEventListener("input", function () {
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
      });
      var add = document.createElement("button");
      add.type = "button"; add.textContent = "Add";

      function submit() {
        var text = input.value.trim();
        if (!text) return;
        var entry = { text: text, by: MY_ID, source: "manual" };
        ADDED[k].push(entry);
        rebuildCards(); saveAddedLocally();
        if (DOC) {
          var fv = firebase.firestore.FieldValue.arrayUnion(entry);
          var patch = {}; patch[k] = fv;
          DOC.set(patch, { merge: true }).catch(function (err) { $("edMsg").textContent = "Saved here, but not in the cloud: " + err.message; });
        }
        input.value = "";
        input.style.height = "";
        renderEditor();
        setTheme(current);
      }
      
      add.addEventListener("click", submit);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } });
      row.appendChild(input); row.appendChild(add);
      sec.appendChild(row);

      edBody.appendChild(sec);
    });
  }

  function makeOut() {
    var out = {};
    order.forEach(function (k) { out[k] = ADDED[k]; });
    return out;
  }


  $("editBtn").addEventListener("click", function () {
    renderEditor();
    $("edMsg").textContent = "";
    editor.showModal();
  });
  $("edClose").addEventListener("click", function () { editor.close(); });


  
  // ---- Admin ----
  var adminDialog = $("adminDialog");
  var adminBody = $("adminBody");

  function renderAdmin() {
    adminBody.innerHTML = "";
    order.forEach(function (k) {
      var sec = document.createElement("section");
      var h = document.createElement("h3");
      h.textContent = THEMES[k].name;
      h.style.setProperty("--c", THEMES[k].color);
      sec.appendChild(h);

      var manualEntries = [];
      var aiEntries = [];
      ADDED[k].forEach(function (raw, i) {
        var item = normalizeItem(raw);
        (item.source === "ai" ? aiEntries : manualEntries).push({ item: item, i: i });
      });

      function renderGroup(label, entries) {
        if (!entries.length) return;
        var groupLabel = document.createElement("div");
        groupLabel.className = "ed-group-label";
        groupLabel.textContent = label;
        sec.appendChild(groupLabel);
        entries.forEach(function (entry) {
          var i = entry.i;
          var row = document.createElement("div");
          row.className = "ed-edit-row";
          var ta = document.createElement("textarea");
          ta.rows = 2;
          ta.value = entry.item.text;
          var saveBtn = document.createElement("button");
          saveBtn.className = "ed-save"; saveBtn.type = "button"; saveBtn.textContent = "Save";
          saveBtn.addEventListener("click", function () {
            var newText = ta.value.trim();
            if (!newText) return;
            var normalized = normalizeItem(ADDED[k][i]);
            ADDED[k][i] = { text: newText, by: normalized.by, source: normalized.source };
            rebuildCards(); saveAddedLocally();
            if (DOC) DOC.set(makeOut(), { merge: true }).catch(function (err) {
              $("adminMsg").textContent = "Saved here, but not in the cloud: " + err.message;
            });
            renderAdmin();
            setTheme(current);
          });
          var delBtn = document.createElement("button");
          delBtn.className = "ed-x"; delBtn.type = "button"; delBtn.textContent = "\u00d7";
          delBtn.setAttribute("aria-label", "Remove this card");
          delBtn.addEventListener("click", function () {
            ADDED[k].splice(i, 1);
            rebuildCards(); saveAddedLocally();
            if (DOC) DOC.set(makeOut(), { merge: true }).catch(function () {});
            renderAdmin();
            setTheme(current);
          });
          row.appendChild(ta); row.appendChild(saveBtn); row.appendChild(delBtn);
          sec.appendChild(row);
        });
      }

      renderGroup("Added manually", manualEntries);
      renderGroup("AI-generated", aiEntries);

      if (!manualEntries.length && !aiEntries.length) {
        var none = document.createElement("div");
        none.className = "ed-lock";
        none.textContent = "No added cards yet for this theme.";
        sec.appendChild(none);
      }

      adminBody.appendChild(sec);
    });
  }

  $("adminBtn").addEventListener("click", function () {
    var pw = (CONFIG.ADMIN_PASSWORD || "").trim();
    if (!pw) { alert("Set ADMIN_PASSWORD in js/config.js first."); return; }
    var entered = window.prompt("Admin password:");
    if (entered === null) return;
    if (entered !== pw) { alert("Incorrect password."); return; }
    renderAdmin();
    $("adminMsg").textContent = "";
    adminDialog.showModal();
  });
  $("adminClose").addEventListener("click", function () { adminDialog.close(); });
 
  
   if (DOC) {
    DOC.get().then(function (snap) {
      if (!snap.exists) return;
      var data = snap.data();
      order.forEach(function (k) { if (Array.isArray(data[k])) ADDED[k] = data[k]; });
      rebuildCards(); saveAddedLocally();
      setTheme(current);
    }).catch(function (err) { setStatus("Could not load from the cloud: " + err.message, true); });
  }
})();
