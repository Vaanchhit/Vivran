// The landing page's scripts, in page order (each one stands alone).

(function () {
  "use strict";

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FINE = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var MOTION = !REDUCED;
  var HAS_GSAP = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  if (HAS_GSAP) gsap.registerPlugin(ScrollTrigger);

  document.getElementById("yr").textContent = new Date().getFullYear();

  /* ---------------- one shared rAF driver ---------------- */
  var tasks = [];
  var rafId = 0;
  function pump() { if (!rafId) rafId = requestAnimationFrame(tick); }
  function tick(now) {
    rafId = 0;
    for (var i = tasks.length - 1; i >= 0; i--) {
      if (tasks[i](now) === false) tasks.splice(i, 1);
    }
    if (tasks.length) pump();
  }
  function addTask(fn) {
    if (tasks.indexOf(fn) < 0) tasks.push(fn);
    pump();
  }

  /* ---------------- nav ---------------- */
  var nav = document.getElementById("nav");
  var burger = document.getElementById("burger");
  var menu = document.getElementById("mobile-menu");

  function onScroll() {
    if (window.scrollY > 8) nav.classList.add("stuck");
    else nav.classList.remove("stuck");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function closeMenu() {
    nav.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
  }
  burger.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  });
  Array.prototype.forEach.call(menu.querySelectorAll("a"), function (a) {
    a.addEventListener("click", closeMenu);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  /* ---------------- generic reveals (IntersectionObserver) ---------------- */
  var rvs = document.querySelectorAll(".rv");
  if (REDUCED || !("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(rvs, function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    Array.prototype.forEach.call(rvs, function (el) { io.observe(el); });
  }

  /* ---------------- index <-> desk specimen linking ---------------- */
  var deskEl = document.getElementById("desk");
  var ixRows = Array.prototype.slice.call(document.querySelectorAll(".ix-row"));
  if (deskEl && FINE) {
    ixRows.forEach(function (row) {
      var key = row.getAttribute("data-spec");
      var spec = deskEl.querySelector('[data-spec="' + key + '"]');
      if (!spec) return;
      row.addEventListener("pointerenter", function () { spec.classList.add("raise"); row.classList.add("on"); });
      row.addEventListener("pointerleave", function () { spec.classList.remove("raise"); row.classList.remove("on"); });
    });
  }

  /* ---------------- hero stack: fan-in + cursor parallax ---------------- */
  var frame = document.getElementById("stackFrame");
  var tiltEl = document.getElementById("stackTilt");
  var stage = document.getElementById("stackStage");
  var sheets = Array.prototype.slice.call(stage.querySelectorAll(".sheet"));
  var FAN = [
    { z: 0,   x: 0,   y: 0   },
    { z: 30,  x: 22,  y: -26 },
    { z: 60,  x: 44,  y: -52 },
    { z: 90,  x: 66,  y: -78 }
  ];
  var fanP = REDUCED ? 1 : 0;
  var fanT0 = 0;
  var px = 0, py = 0, tpx = 0, tpy = 0;
  var hov = [0, 0, 0, 0], hovT = [0, 0, 0, 0];
  var LAST = sheets.length - 1 || 1;

  function renderStack() {
    for (var i = 0; i < sheets.length; i++) {
      var f = FAN[i] || FAN[FAN.length - 1];
      var d = i / LAST;                 // 0 = back sheet, 1 = front sheet
      var h = hov[i];
      var par = 5 + 15 * d;             // front sheet travels furthest
      var X = f.x * fanP + px * par - h * 12;
      var Y = f.y * fanP + py * par - h * 17;
      var Z = f.z * fanP + h * 58;
      var rx = -py * 3.2 * (0.35 + d);
      var ry = px * 3.6 * (0.35 + d);
      sheets[i].style.transform =
        "translate3d(" + X.toFixed(2) + "px," + Y.toFixed(2) + "px," + Z.toFixed(2) + "px)" +
        " rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg)";
    }
    if (tiltEl) {
      tiltEl.style.transform =
        "rotateX(" + (-py * 2.6).toFixed(2) + "deg) rotateY(" + (px * 3).toFixed(2) + "deg)";
    }
  }

  function stackTick(now) {
    var busy = false;
    if (fanP < 1) {
      if (!fanT0) fanT0 = now;
      var e = (now - fanT0 - 140) / 900;
      if (e < 0) e = 0;
      if (e > 1) e = 1;
      fanP = 1 - Math.pow(1 - e, 3);
      if (e < 1) busy = true;
    }
    px += (tpx - px) * 0.085;
    py += (tpy - py) * 0.085;
    if (Math.abs(tpx - px) > 0.0015 || Math.abs(tpy - py) > 0.0015) busy = true;
    else { px = tpx; py = tpy; }
    for (var i = 0; i < hov.length; i++) {
      hov[i] += (hovT[i] - hov[i]) * 0.14;
      if (Math.abs(hovT[i] - hov[i]) > 0.002) busy = true;
      else hov[i] = hovT[i];
    }
    renderStack();
    return busy;
  }

  renderStack();
  if (MOTION) addTask(stackTick);

  if (MOTION && FINE) {
    frame.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var r = frame.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      var ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
      tpx = nx < -1 ? -1 : nx > 1 ? 1 : nx;
      tpy = ny < -1 ? -1 : ny > 1 ? 1 : ny;
      addTask(stackTick);
    }, { passive: true });
    frame.addEventListener("pointerleave", function () {
      tpx = 0; tpy = 0; addTask(stackTick);
    });
    sheets.forEach(function (s, i) {
      s.addEventListener("pointerenter", function () { hovT[i] = 1; addTask(stackTick); });
      s.addEventListener("pointerleave", function () { hovT[i] = 0; addTask(stackTick); });
    });
  }

  /* ---------------- grounding: citations + edges ---------------- */
  var ground = document.getElementById("ground");
  var edgesSvg = document.getElementById("groundEdges");
  var qrows = Array.prototype.slice.call(document.querySelectorAll("#qlist .qrow"));
  var mats = Array.prototype.slice.call(document.querySelectorAll(".mat"));
  var paths = [];
  var drawn = false;

  function buildEdges() {
    while (edgesSvg.firstChild) edgesSvg.removeChild(edgesSvg.firstChild);
    paths = [];
    if (window.innerWidth < 900) return;
    var gb = ground.getBoundingClientRect();
    edgesSvg.setAttribute("viewBox", "0 0 " + gb.width + " " + gb.height);
    edgesSvg.setAttribute("preserveAspectRatio", "none");
    qrows.forEach(function (row) {
      var mi = row.getAttribute("data-mat");
      if (mi === null) return;
      var m = mats[+mi];
      if (!m) return;
      var mb = m.getBoundingClientRect(), rb = row.getBoundingClientRect();
      var x1 = mb.right - gb.left, y1 = mb.top + mb.height / 2 - gb.top;
      var x2 = rb.left - gb.left, y2 = rb.top + rb.height / 2 - gb.top;
      var dx = (x2 - x1) * 0.55;
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + x2 + "," + y2);
      p.setAttribute("fill", "none");
      p.style.stroke = "var(--vv-edge)";
      p.setAttribute("stroke-width", "1");
      p.setAttribute("vector-effect", "non-scaling-stroke");
      edgesSvg.appendChild(p);
      var len = p.getTotalLength ? p.getTotalLength() : 600;
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = drawn ? 0 : len;
      paths.push(p);
    });
  }

  function showAllCitations() {
    Array.prototype.forEach.call(document.querySelectorAll(".qcite"), function (c) { c.classList.add("on"); });
  }



  /* ---------------- scroll set pieces ---------------- */
  if (REDUCED || !HAS_GSAP) {
    // Render every end state statically.
    drawn = true;
    showAllCitations();
    buildEdges();
    document.getElementById("gcNum").textContent = "5";
  } else {

    var gcObj = { v: 0 };
    ScrollTrigger.create({
      trigger: "#ground",
      start: "top 70%",
      once: true,
      onEnter: function () {
        drawn = true;
        var withCite = qrows.filter(function (r) { return r.getAttribute("data-mat") !== null; });
        if (paths.length) {
          gsap.to(paths, { strokeDashoffset: 0, duration: 0.85, ease: "power2.inOut", stagger: 0.075 });
        }
        withCite.forEach(function (r, i) {
          var c = r.querySelector(".qcite");
          if (!c) return;
          gsap.delayedCall(0.28 + i * 0.075, function () { c.classList.add("on"); });
        });
        gsap.to(gcObj, {
          v: 5, duration: 1.1, delay: 0.3, ease: "power2.out",
          onUpdate: function () { document.getElementById("gcNum").textContent = Math.round(gcObj.v); }
        });
      }
    });

    var mm = gsap.matchMedia();
    mm.add("(min-width: 900px)", function () {
      buildEdges();
      return function () {
        while (edgesSvg.firstChild) edgesSvg.removeChild(edgesSvg.firstChild);
        paths = [];
      };
    });
  }

  /* ---------------- theme toggle ---------------- */
  (function () {
    var root = document.documentElement;
    var btn = document.getElementById("theme-btn");
    var sys = window.matchMedia("(prefers-color-scheme: dark)");
    function saved() { try { return localStorage.getItem("vivran_theme"); } catch (e) { return null; } }
    function apply(t) {
      root.setAttribute("data-theme", t);
      var dark = t === "dark";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      var f = document.getElementById("tourFrame");
      if (f && f.contentWindow) f.contentWindow.postMessage({ type: "vivran-theme", theme: t }, location.origin);
    }
    apply(root.getAttribute("data-theme") === "dark" ? "dark" : "light");
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { localStorage.setItem("vivran_theme", next); } catch (e) {}
      apply(next);
    });
    var follow = function (e) { if (!saved()) apply(e.matches ? "dark" : "light"); };
    if (sys.addEventListener) sys.addEventListener("change", follow);
  })();

  /* ---------------- chalk dust cursor ---------------- */
  if (MOTION && FINE) {
    (function () {
      var cv = null, ctx = null, dpr = 1, W = 0, H = 0;
      var parts = [];
      var MAX = 300;
      var lx = null, ly = null;
      var footEl = document.querySelector(".foot");

      function sizeCanvas() {
        if (!cv) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth; H = window.innerHeight;
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      function ensureCanvas() {
        if (cv) return;
        cv = document.createElement("canvas");
        cv.id = "chalk";
        cv.setAttribute("aria-hidden", "true");
        document.body.appendChild(cv);
        ctx = cv.getContext("2d");
        sizeCanvas();
        window.addEventListener("resize", sizeCanvas, { passive: true });
      }

      function spawn(x, y, dx, dy) {
        if (parts.length >= MAX) return;
        var jx = (Math.random() - 0.5) * 7;
        var jy = (Math.random() - 0.5) * 7;
        parts.push({
          x: x + jx, y: y + jy,
          vx: dx * 0.05 + (Math.random() - 0.5) * 0.5,
          vy: dy * 0.04 + (Math.random() - 0.35) * 0.45,
          s: Math.random() < 0.72 ? 1 : 2,
          a: 0.16 + Math.random() * 0.16,
          t: 0,
          life: 600 + Math.random() * 300
        });
      }

      function chalkTick(now) {
        if (!ctx) return false;
        var prev = chalkTick.prev || now;
        var dt = Math.min(now - prev, 48);
        chalkTick.prev = now;

        var darkTop = document.documentElement.getAttribute("data-theme") === "dark"
          ? -Infinity
          : (footEl ? footEl.getBoundingClientRect().top : Infinity);

        ctx.clearRect(0, 0, W, H);
        for (var i = parts.length - 1; i >= 0; i--) {
          var p = parts[i];
          p.t += dt;
          if (p.t >= p.life) { parts.splice(i, 1); continue; }
          p.x += p.vx * (dt / 16.67);
          p.y += p.vy * (dt / 16.67);
          p.vy += 0.008 * (dt / 16.67);
          p.vx *= 0.985;
          var k = 1 - p.t / p.life;
          var a = p.a * k * k;
          if (a < 0.004) continue;
          var onDark = p.y > darkTop;
          ctx.fillStyle = onDark
            ? "rgba(250,246,238," + (a * 2.1).toFixed(3) + ")"
            : "rgba(24,21,18," + Math.min(0.9, a * 3.4).toFixed(3) + ")";
          // Charcoal on paper needs a heavier grain than white on the board to read as chalk.
          var sz = onDark ? p.s : p.s + 1;
          ctx.fillRect(p.x | 0, p.y | 0, sz, sz);
        }
        if (!parts.length) { chalkTick.prev = 0; ctx.clearRect(0, 0, W, H); return false; }
        return true;
      }

      document.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") return;
        ensureCanvas();
        var x = e.clientX, y = e.clientY;
        if (lx === null) { lx = x; ly = y; return; }
        var dx = x - lx, dy = y - ly;
        var dist = Math.sqrt(dx * dx + dy * dy);
        lx = x; ly = y;
        if (dist < 2.5) return;
        var light = document.documentElement.getAttribute("data-theme") !== "dark";
        var n = Math.min(light ? 5 : 3, Math.round(dist / (light ? 5 : 8)));
        if (n < 1) n = 1;
        for (var i = 0; i < n; i++) {
          var f = i / n;
          spawn(x - dx * f, y - dy * f, dx, dy);
        }
        chalkTick.prev = 0;
        addTask(chalkTick);
      }, { passive: true });

      document.addEventListener("pointerleave", function () { lx = null; ly = null; });
    })();
  }

  /* ---------------- resize handling ---------------- */
  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (window.innerWidth >= 900) buildEdges();
      if (HAS_GSAP && MOTION) ScrollTrigger.refresh();
    }, 180);
  });

  // Fonts can shift layout after first paint — recompute once they're in.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (window.innerWidth >= 900) buildEdges();
      if (HAS_GSAP && MOTION) ScrollTrigger.refresh();
    });
  }

  window.addEventListener("pagehide", function () {
    if (HAS_GSAP) ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
  });
})();

/* The tour iframe reports its height so it never shows a scrollbar of its own. */
window.addEventListener('message', function(e){
  if (e.origin !== location.origin || !e.data) return;
  if (e.data.type === 'vivran-theme-ask') { e.source && e.source.postMessage({ type:'vivran-theme', theme: document.documentElement.getAttribute('data-theme') || 'light' }, location.origin); return; }
  if (e.data.type !== 'vivran-tour-height') return;
  var f = document.getElementById('tourFrame'); if (f) f.style.height = Math.ceil(e.data.height) + 'px';
});

/* The week: builds when it scrolls into view, then shows the same week with Vivran.
   The visitor can flip it with the toggle; hovering a block names it and shows the change. */
(function(){
  var wk=document.getElementById('wk'); if(!wk) return;
  var segs=[].slice.call(wk.querySelectorAll('.wk-seg')), tip=document.getElementById('wkTip');
  var prepEl=document.getElementById('wkPrep'), backEl=document.getElementById('wkBack');
  var toggle=document.querySelector('.wk-toggle'), pill=toggle.querySelector('.wk-pill'), btns=[].slice.call(toggle.querySelectorAll('button'));
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches, touched=false, mode=null;
  var nums={prep:22, back:0};
  function count(el, from, to, ms){
    if(reduce){ el.textContent=fmt(to); return; }
    var t0=performance.now();
    (function step(t){ var k=Math.min(1,(t-t0)/ms), e=1-Math.pow(1-k,3); el.textContent=fmt(from+(to-from)*e); if(k<1) requestAnimationFrame(step); })(t0);
  }
  function fmt(v){ return (Math.round(v*2)/2).toString(); }
  function movePill(){ var b=btns.find(function(x){ return x.dataset.mode===mode; }); if(!b) return; pill.style.width=b.offsetWidth+'px'; pill.style.transform='translateX('+(b.offsetLeft-4)+'px)'; }
  function set(m){
    if(m===mode) return; mode=m; wk.dataset.mode=m;
    btns.forEach(function(b){ b.setAttribute('aria-selected', String(b.dataset.mode===m)); });
    movePill();
    segs.forEach(function(sg){ var h=+sg.dataset[m]; sg.style.flexBasis=(h/40*100)+'%'; sg.classList.toggle('wide', h>=4); });
    var line=document.getElementById('wkLine');
    if(line){ line.classList.add('swap'); setTimeout(function(){
      line.innerHTML = m==='today' ? '<span class="wk-hl">18 hours</span> <span class="wk-dim">in the classroom.</span>'
                                   : '<span class="wk-hl wk-ok">15 more hours</span> <span class="wk-dim">for students, every week.</span>';
      line.classList.remove('swap'); }, reduce?0:250); }
    var prep=m==='today'?22:7, back=m==='today'?0:15;
    count(prepEl, nums.prep, prep, 900); count(backEl, nums.back, back, 900); nums={prep:prep, back:back};
  }
  btns.forEach(function(b){ b.addEventListener('click', function(){ touched=true; set(b.dataset.mode); }); });
  window.addEventListener('resize', movePill);
  segs.forEach(function(sg){
    sg.addEventListener('mouseenter', function(){
      var a=+sg.dataset.today, v=+sg.dataset.vivran, n=sg.dataset.name;
      tip.innerHTML = n==='Time for students' ? '<b>Time for students</b>: 15 hours a week for feedback, one-to-one help and better lessons' :
        n==='In the classroom' ? '<b>In the classroom</b>: 18 hours, unchanged' :
        '<b>'+n+'</b>: '+a+'h today &rarr; '+v+'h with Vivran';
    });
    sg.addEventListener('mouseleave', function(){ tip.textContent=''; });
    sg.addEventListener('click', function(){ sg.dispatchEvent(new Event('mouseenter')); });
  });
  // start empty, build on view, then show Vivran's week unless the visitor took over
  segs.forEach(function(sg){ sg.style.flexBasis='0%'; });
  function start(){
    if(reduce){ set('today'); return; }
    segs.forEach(function(sg,i){ setTimeout(function(){ var h=+sg.dataset.today; sg.style.flexBasis=(h/40*100)+'%'; sg.classList.toggle('wide', h>=4); }, 120*i); });
    mode='today'; movePill();
    setTimeout(function(){ if(!touched) set('vivran'); }, 2600);
  }
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){ if(es.some(function(e){ return e.isIntersecting; })){ io.disconnect(); start(); } }, {threshold:.45});
    io.observe(wk);
  } else start();
  mode=null; requestAnimationFrame(function(){ mode='today'; movePill(); mode=null; });
})();

/* Features: switch who the section speaks to. Same material, three uses. */
(function(){
  var grid=document.getElementById('makesGrid'); if(!grid) return;
  var sw=document.querySelector('.aud-switch'), pill=sw.querySelector('.aud-pill'), btns=[].slice.call(sw.querySelectorAll('button'));
  var lede=document.getElementById('audLede'), status=document.getElementById('audStatus');
  var LEDE={
    teacher: lede.innerHTML,
    student: 'The same material becomes revision and practice for students, built on exactly what was taught in class, with every answer linked back to the page.',
    institution: 'For leadership, Vivran turns the everyday work of teaching into a clear view of the whole institution: what is taught, what is learned, and where to step in.'
  };
  function place(b){ pill.style.width=b.offsetWidth+'px'; pill.style.transform='translateX('+(b.offsetLeft-4)+'px)'; }
  function pick(a){
    grid.dataset.aud=a;
    btns.forEach(function(b){ var on=b.dataset.aud===a; b.setAttribute('aria-selected',String(on)); if(on) place(b); });
    lede.innerHTML=LEDE[a];
    status.textContent = a==='teacher' ? 'Live today' : a==='institution' ? 'Pilots open' : 'Coming next';
    if(a==='institution' && window.vvBoard) window.vvBoard();
    status.classList.toggle('soon', a!=='teacher');
    [].slice.call(grid.querySelectorAll('.desk > .spec[data-aud="'+a+'"]')).forEach(function(c,i){ c.style.setProperty('--k', i); });
  }
  btns.forEach(function(b){ b.addEventListener('click', function(){ pick(b.dataset.aud); }); });
  window.addEventListener('resize', function(){ var on=btns.find(function(b){ return b.getAttribute('aria-selected')==='true'; }); if(on) place(on); });
  requestAnimationFrame(function(){ place(btns[0]); });
})();
