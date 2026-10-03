// Cookie consent + (consent-gated) Meta Pixel. Shared by public pages.
(function () {
  var KEY = 'femme.cookieConsent';
  function get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, JSON.stringify({ v: v, at: new Date().toISOString() })); } catch (e) {} }
  function bar() { return document.getElementById('cookie-bar'); }
  function loadPixel() {
    var id = window.__metaPixelId;
    if (!id || window.fbq || !get() || get().v !== 'all') return;
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', id); window.fbq('track', 'PageView');
  }
  window.siteConsentApply = loadPixel;
  document.addEventListener('DOMContentLoaded', function () {
    var b = bar(); if (!b) return;
    if (!get()) b.hidden = false;
    b.querySelectorAll('[data-cookie]').forEach(function (btn) {
      btn.addEventListener('click', function () { set(btn.dataset.cookie); b.hidden = true; loadPixel(); });
    });
    var o = document.getElementById('open-cookies'); if (o) o.addEventListener('click', function () { b.hidden = false; });
    loadPixel();
  });
})();
