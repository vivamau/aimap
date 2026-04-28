(function () {
  var CONSENT_KEY = 'aimap-cookie-consent';
  var GA_ID = 'G-FDVDGF4HX4';

  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }

  function setConsent(val) {
    try { localStorage.setItem(CONSENT_KEY, val); } catch (e) {}
  }

  function loadGA() {
    if (document.getElementById('ga-script')) return;
    var s = document.createElement('script');
    s.id = 'ga-script';
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID);
  }

  function injectStyles() {
    if (document.getElementById('cookie-consent-styles')) return;
    var style = document.createElement('style');
    style.id = 'cookie-consent-styles';
    style.textContent = [
      '#cookie-banner {',
      '  position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;',
      '  background: var(--surface, #0d0b08);',
      '  border-top: 1px solid var(--line, rgba(255,255,255,0.08));',
      '  padding: 18px 32px;',
      '  display: flex; align-items: center; gap: 24px; flex-wrap: wrap;',
      '  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);',
      '}',
      '#cookie-banner[hidden] { display: none; }',
      '.cookie-banner__text {',
      '  font-family: var(--mono, monospace);',
      '  font-size: 11px; letter-spacing: 0.1em;',
      '  color: var(--paper-3, rgba(232,220,196,0.6));',
      '  line-height: 1.65; flex: 1; min-width: 240px;',
      '}',
      '.cookie-banner__text strong {',
      '  display: block; margin-bottom: 4px;',
      '  color: var(--paper, #e8dcc4);',
      '  letter-spacing: 0.18em; text-transform: uppercase; font-size: 10px;',
      '}',
      '.cookie-banner__link {',
      '  color: inherit; text-decoration: underline; opacity: 0.6;',
      '  transition: opacity 0.15s;',
      '}',
      '.cookie-banner__link:hover { opacity: 1; }',
      '.cookie-banner__actions { display: flex; gap: 10px; flex-shrink: 0; }',
      '.cookie-btn {',
      '  font-family: var(--mono, monospace);',
      '  font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;',
      '  padding: 8px 20px; border: 1px solid; cursor: pointer; background: transparent;',
      '  transition: background 0.18s, color 0.18s, border-color 0.18s;',
      '}',
      '.cookie-btn--accept {',
      '  color: var(--gold, #c9a544); border-color: var(--gold, #c9a544);',
      '}',
      '.cookie-btn--accept:hover { background: rgba(201,165,68,0.1); }',
      '.cookie-btn--decline {',
      '  color: var(--muted, rgba(180,170,150,0.45));',
      '  border-color: rgba(180,170,150,0.2);',
      '}',
      '.cookie-btn--decline:hover {',
      '  color: var(--paper-3, rgba(232,220,196,0.6));',
      '  border-color: rgba(180,170,150,0.4);',
      '}',
      '@media (max-width: 640px) {',
      '  #cookie-banner { padding: 16px 20px; gap: 16px; }',
      '  .cookie-banner__actions { width: 100%; justify-content: flex-end; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function showBanner() {
    injectStyles();
    var banner = document.createElement('div');
    banner.id = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.setAttribute('aria-live', 'polite');

    var text = document.createElement('p');
    text.className = 'cookie-banner__text';
    text.innerHTML =
      '<strong>Cookies &amp; Privacy</strong>' +
      'This site uses analytical cookies (Google Analytics) solely to understand how visitors use it. ' +
      'No personal profiling, no advertising tracking. Your data is never sold or shared with third parties. ' +
      '<a class="cookie-banner__link" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>.';

    var actions = document.createElement('div');
    actions.className = 'cookie-banner__actions';

    var declineBtn = document.createElement('button');
    declineBtn.className = 'cookie-btn cookie-btn--decline';
    declineBtn.textContent = 'Decline';

    var acceptBtn = document.createElement('button');
    acceptBtn.className = 'cookie-btn cookie-btn--accept';
    acceptBtn.textContent = 'Accept';

    actions.appendChild(declineBtn);
    actions.appendChild(acceptBtn);
    banner.appendChild(text);
    banner.appendChild(actions);
    document.body.appendChild(banner);

    acceptBtn.addEventListener('click', function () {
      setConsent('accepted');
      banner.hidden = true;
      loadGA();
    });

    declineBtn.addEventListener('click', function () {
      setConsent('declined');
      banner.hidden = true;
    });
  }

  var consent = getConsent();
  if (consent === 'accepted') {
    loadGA();
  } else if (consent !== 'declined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }
})();
