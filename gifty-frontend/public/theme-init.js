/* Put the remembered theme on the page before it is painted, so dark-theme
   visitors get no white flash. Same rules as src/utils/theme.js; React
   re-applies it on load. */
(function () {
  var theme = 'light';
  try {
    var stored = window.localStorage.getItem('gifty-theme');
    if (stored === 'light' || stored === 'dark') theme = stored;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
  } catch (e) {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
    } catch (e2) { /* keep light */ }
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
