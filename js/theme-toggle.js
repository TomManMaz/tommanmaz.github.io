(function () {
  var html = document.documentElement;
  var saved = localStorage.getItem('theme');
  if (saved === 'dark') html.setAttribute('data-theme', 'dark');

  function icon() {
    return html.getAttribute('data-theme') === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('theme-toggle');
    var iconEl = document.getElementById('theme-icon');
    if (iconEl) iconEl.textContent = icon();
    if (!toggle) return;
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      if (next === 'dark') {
        html.setAttribute('data-theme', 'dark');
      } else {
        html.removeAttribute('data-theme');
      }
      localStorage.setItem('theme', next);
      if (iconEl) iconEl.textContent = icon();
    });
  });
})();
