/**
 * Dark/Light switch. Loaded synchronously in <head> (before the first paint,
 * so a saved choice never flashes the wrong theme); stylesheet.css follows the
 * OS setting unless <html data-theme="light|dark"> overrides it. The switch
 * is injected into the navbar, so pages without JavaScript simply follow the OS.
 */
(function () {
  'use strict';

  var KEY = 'theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function current() {
    var t = root.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return media && media.matches ? 'dark' : 'light';
  }

  var initial = saved();
  if (initial === 'light' || initial === 'dark') root.setAttribute('data-theme', initial);

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('.navbar');
    if (!nav) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';

    function label() {
      var next = current() === 'dark' ? 'light' : 'dark';
      btn.textContent = next === 'dark' ? 'Dark' : 'Light';
      btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    }

    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
      label();
    });
    if (media && media.addEventListener) media.addEventListener('change', label);

    label();
    nav.appendChild(btn);
  });
})();
