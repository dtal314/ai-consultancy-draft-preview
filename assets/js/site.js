/* =========================================================================
   Site behaviour: theme, nav, ROI calculator, membership demo states.
   No dependencies. Progressive: every page reads fine with JS disabled.
   ========================================================================= */
(function () {
  'use strict';

  /* ------------------------------------------------------------- theme */
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) {}
  if (stored === 'light' || stored === 'dark') root.setAttribute('data-theme', stored);

  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  function currentTheme() {
    var set = root.getAttribute('data-theme');
    if (set) return set;
    return prefersDark.matches ? 'dark' : 'light';
  }

  /* Chromium does not repaint a transitioned property when the custom property
     it reads from changes — nav links, ghost borders and buttons strand on the
     old palette. Suppressing transitions around the swap forces the repaint.
     Reflow between steps so the changes cannot be batched into one recalc. */
  function repaintTheme(apply) {
    root.setAttribute('data-theme-switching', '');
    void root.offsetHeight;
    apply();
    void root.offsetHeight;
    root.removeAttribute('data-theme-switching');
  }

  var themeBtn = document.querySelector('[data-theme-toggle]');
  if (themeBtn) {
    var paint = function () {
      var t = currentTheme();
      themeBtn.textContent = t === 'dark' ? '☾' : '☀';
      themeBtn.setAttribute('aria-label', 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' theme');
    };
    paint();
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      repaintTheme(function () { root.setAttribute('data-theme', next); });
      try { localStorage.setItem('theme', next); } catch (e) {}
      paint();
    });
  }

  /* The OS theme can flip while the page is open. That changes the same custom
     properties with no click to hang the fix on, so it needs the same repaint —
     otherwise a visitor who switches their system theme sees a half-themed page. */
  function onSchemeChange() {
    if (!root.getAttribute('data-theme')) {
      repaintTheme(function () {});
      if (themeBtn) themeBtn.textContent = currentTheme() === 'dark' ? '☾' : '☀';
    }
  }
  if (prefersDark.addEventListener) {
    prefersDark.addEventListener('change', onSchemeChange);
  } else if (prefersDark.addListener) {
    prefersDark.addListener(onSchemeChange); // Safari < 14
  }

  /* --------------------------------------------------------------- nav */
  var navBtn = document.querySelector('[data-nav-toggle]');
  var nav = document.getElementById('primary-nav');
  if (navBtn && nav) {
    navBtn.addEventListener('click', function () {
      var open = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', String(!open));
      navBtn.setAttribute('aria-expanded', String(!open));
      navBtn.textContent = !open ? '✕' : '☰';
    });
  }

  /* -------------------------------------------------- number formatting */
  var nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

  function money(n) {
    // [CURRENCY — Dan to confirm] — USD assumed for display only.
    var r = Math.round(n);
    // Sign belongs outside the symbol: -$73,824, never $-73,824.
    return (r < 0 ? '-$' : '$') + nf0.format(Math.abs(r));
  }

  /* --------------------------------------------------------- calculator */
  var calc = document.getElementById('calc');
  if (calc) initCalc(calc);

  function initCalc(form) {
    var el = function (id) { return document.getElementById(id); };

    var fields = ['c-people', 'c-hours', 'c-weeks', 'c-cost', 'c-impl', 'c-monthly', 'c-retired'];
    var levers = ['c-uptake', 'c-reduction'];

    /* Read a numeric field. Returns null when genuinely blank — blank is a
       meaningful state here, not zero. Returns NaN when invalid. */
    function val(id) {
      var node = el(id);
      if (!node) return null;
      var raw = String(node.value).trim();
      if (raw === '') return null;
      var n = Number(raw);
      return isFinite(n) ? n : NaN;
    }

    function setErr(id, msg) {
      var e = el(id + '-err');
      if (e) e.textContent = msg || '';
      var f = el(id);
      if (f) f.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }

    function compute() {
      var ok = true;

      var P = val('c-people');
      var H = val('c-hours');
      var W = val('c-weeks');
      var C = val('c-cost');
      var I = val('c-impl');
      var M = val('c-monthly');
      var A = val('c-retired');
      var U = Number(el('c-uptake').value);
      var R = Number(el('c-reduction').value);

      // validation — explain inline, never silently coerce
      function guard(id, v, opts) {
        if (v === null) { setErr(id, ''); return true; }
        if (isNaN(v)) { setErr(id, 'Enter a number.'); return false; }
        if (v < 0) { setErr(id, 'Cannot be negative.'); return false; }
        if (opts && opts.int && v % 1 !== 0) { setErr(id, 'Whole numbers only.'); return false; }
        if (opts && opts.min != null && v < opts.min) { setErr(id, 'Must be at least ' + opts.min + '.'); return false; }
        if (opts && opts.max != null && v > opts.max) { setErr(id, 'Must be ' + opts.max + ' or less.'); return false; }
        setErr(id, '');
        return true;
      }

      ok = guard('c-people', P, { int: true, min: 1 }) && ok;
      ok = guard('c-hours', H, { min: 0 }) && ok;
      ok = guard('c-weeks', W, { int: true, min: 1, max: 52 }) && ok;
      ok = guard('c-cost', C) && ok;
      ok = guard('c-impl', I) && ok;
      ok = guard('c-monthly', M) && ok;
      ok = guard('c-retired', A) && ok;

      // lever readouts always reflect UI
      el('c-uptake-val').textContent = U + '%';
      el('c-reduction-val').textContent = R + '%';

      var out = {
        hours: el('out-hours'),
        value: el('out-value'),
        roi: el('out-roi'),
        roiNote: el('out-roi-note'),
        valueNote: el('out-value-note'),
        math: el('out-math')
      };

      function blank(node, msg) {
        node.textContent = msg || '—';
        node.setAttribute('data-empty', 'true');
      }
      function fill(node, text) {
        node.textContent = text;
        node.setAttribute('data-empty', 'false');
      }

      var haveBase = P !== null && H !== null && W !== null && ok &&
                     !isNaN(P) && !isNaN(H) && !isNaN(W);

      if (!haveBase) {
        blank(out.hours, '—');
        blank(out.value, '—');
        blank(out.roi, '—');
        out.valueNote.textContent = 'Enter people, hours and working weeks.';
        out.roiNote.textContent = '';
        out.math.textContent = 'Enter your workflow values to see the substituted formulas.';
        return;
      }

      var B = P * H * W;                       // baseline annual hours
      var Q = B * (U / 100) * (R / 100);       // hours reclaimed
      fill(out.hours, nf0.format(Math.round(Q)));

      // Value requires a loaded cost. Blank cost => hours only, honestly.
      var G = null;
      if (C === null) {
        blank(out.value, '—');
        out.valueNote.textContent = 'Add a fully loaded hourly cost to see value.';
      } else {
        G = Q * C;
        fill(out.value, money(G));
        out.valueNote.textContent = 'Capacity value is not booked revenue or cash savings.';
      }

      // ROI requires costs to have been explicitly entered.
      var Aeff = (A === null ? 0 : A);
      if (G === null || I === null || M === null) {
        blank(out.roi, '—');
        out.roiNote.textContent = 'Add costs to calculate ROI.';
      } else {
        var O = M * 12;
        var T = I + O;
        var V = G + Aeff;
        var N = V - T;
        if (T > 0) {
          var ROI = (N / T) * 100;
          fill(out.roi, nf0.format(Math.round(ROI)) + '%');
          out.roiNote.textContent = 'First-year net modelled value ' + money(N) + '.';
        } else {
          blank(out.roi, '—');
          out.roiNote.textContent = 'Add costs to calculate ROI.';
        }
      }

      // Show the math
      var lines = [];
      lines.push('B = P × H × W');
      lines.push('  = ' + nf0.format(P) + ' × ' + nf1.format(H) + ' × ' + nf0.format(W) +
                 ' = ' + nf0.format(B) + ' baseline annual hours');
      lines.push('');
      lines.push('Q = B × (U/100) × (R/100)');
      lines.push('  = ' + nf0.format(B) + ' × ' + (U / 100) + ' × ' + (R / 100) +
                 ' = ' + nf0.format(Math.round(Q)) + ' hours reclaimed');
      if (G !== null) {
        lines.push('');
        lines.push('G = Q × C');
        lines.push('  = ' + nf0.format(Math.round(Q)) + ' × ' + money(C) + ' = ' + money(G) + ' capacity value');
      }
      if (M !== null) {
        var O2 = M * 12;
        lines.push('');
        lines.push('O = M × 12  = ' + money(O2) + ' annual recurring AI cost');
        if (I !== null) {
          var T2 = I + O2;
          var V2 = (G === null ? 0 : G) + Aeff;
          var N2 = V2 - T2;
          var S2 = ((G === null ? 0 : G) + Aeff) / 12 - M;
          lines.push('T = I + O  = ' + money(T2) + ' first-year investment');
          if (G !== null) {
            lines.push('V = G + A  = ' + money(V2) + ' first-year modelled benefit');
            lines.push('N = V − T  = ' + money(N2) + ' first-year net');
            lines.push('');
            lines.push('S = ((G + A)/12) − M  = ' + money(S2) + ' monthly benefit after recurring cost');
            if (S2 > 0) {
              var pb = I / S2;
              lines.push('Payback = I / S  = ' + (I === 0 ? '0' : nf1.format(pb)) + ' months');
            } else {
              lines.push('Payback: no payback under this scenario');
            }
          }
        }
      }
      out.math.textContent = lines.join('\n');
    }

    fields.concat(levers).forEach(function (id) {
      var node = el(id);
      if (node) node.addEventListener('input', compute);
    });

    var reset = el('c-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        fields.forEach(function (id) { var n = el(id); if (n) { n.value = ''; setErr(id, ''); } });
        el('c-uptake').value = 0;
        el('c-reduction').value = 0;
        compute();
      });
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); });
    compute();
  }

  /* --------------------------------------------------------- videos */
  /* Click-to-load. The poster is a static thumbnail; no YouTube iframe (and so
     no YouTube request) exists until the visitor actually asks to watch.
     nocookie domain, and autoplay on insert since the click IS the intent. */
  document.querySelectorAll('.video[data-video]').forEach(function (box) {
    var btn = box.querySelector('.video__poster');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var id = box.getAttribute('data-video');
      var label = btn.getAttribute('aria-label') || 'Video';
      var frame = document.createElement('iframe');
      frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
                  '?autoplay=1&rel=0&modestbranding=1';
      frame.title = label.replace(/^Play:\s*/, '');
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      frame.allowFullscreen = true;
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      box.innerHTML = '';
      box.appendChild(frame);
    });
  });

  /* ------------------------------------------------- membership states */
  var stateBar = document.querySelector('[data-member-states]');
  if (stateBar) {
    var buttons = stateBar.querySelectorAll('button[data-state]');
    var apply = function (state) {
      buttons.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-state') === state));
      });
      document.querySelectorAll('[data-when]').forEach(function (node) {
        var when = node.getAttribute('data-when').split(' ');
        node.hidden = when.indexOf(state) === -1;
      });
    };
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { apply(b.getAttribute('data-state')); });
    });
    apply('anon');
  }

  /* --------------------------------------------------------- contact form */
  var cf = document.getElementById('contact-form');
  if (cf) {
    var errBox = document.getElementById('form-errors');
    var okBox = document.getElementById('form-ok');
    cf.addEventListener('submit', function (e) {
      e.preventDefault();
      var missing = [];
      ['f-name', 'f-email', 'f-org', 'f-workflow'].forEach(function (id) {
        var n = document.getElementById(id);
        var err = document.getElementById(id + '-err');
        if (!n) return;
        var bad = !String(n.value).trim();
        if (!bad && id === 'f-email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n.value)) bad = true;
        if (bad) {
          missing.push(n.getAttribute('data-label') || id);
          if (err) err.textContent = id === 'f-email' && String(n.value).trim()
            ? 'Enter a valid email address.' : 'This field is required.';
          n.setAttribute('aria-invalid', 'true');
        } else {
          if (err) err.textContent = '';
          n.setAttribute('aria-invalid', 'false');
        }
      });
      if (missing.length) {
        okBox.hidden = true;
        errBox.hidden = false;
        errBox.textContent = 'Please complete: ' + missing.join(', ') + '.';
        errBox.focus();
      } else {
        errBox.hidden = true;
        okBox.hidden = false;
        okBox.focus();
      }
    });
  }
})();
