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
    style.textContent = '\
#cookie-banner {\
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 9000;\
  background: var(--surface-glass, rgba(13,11,8,0.92));\
  backdrop-filter: blur(10px);\
  -webkit-backdrop-filter: blur(10px);\
  border-top: 1px solid var(--line, rgba(237,228,204,0.10));\
  padding: 20px 48px;\
  display: flex;\
  align-items: center;\
  gap: 32px;\
  flex-wrap: wrap;\
}\
#cookie-banner[hidden] { display: none !important; }\
.ck-label {\
  font-family: var(--mono, monospace);\
  font-size: 9px;\
  letter-spacing: 0.22em;\
  text-transform: uppercase;\
  color: var(--gold, #c9a544);\
  margin-bottom: 6px;\
}\
.ck-body {\
  flex: 1;\
  min-width: 260px;\
}\
.ck-text {\
  font-family: var(--serif, serif);\
  font-style: italic;\
  font-size: 13px;\
  color: var(--paper-2, #d4c9ac);\
  line-height: 1.65;\
}\
.ck-text a {\
  color: var(--paper-3, #a89c80);\
  text-decoration: underline;\
  text-underline-offset: 3px;\
  transition: color 0.15s;\
}\
.ck-text a:hover { color: var(--paper, #ede4cc); }\
.ck-actions {\
  display: flex;\
  gap: 10px;\
  align-items: center;\
  flex-shrink: 0;\
}\
.ck-btn {\
  font-family: var(--mono, monospace);\
  font-size: 9px;\
  letter-spacing: 0.18em;\
  text-transform: uppercase;\
  padding: 9px 22px;\
  border: 1px solid;\
  background: transparent;\
  cursor: pointer;\
  transition: background 0.2s, color 0.2s, border-color 0.2s;\
  border-radius: 0;\
}\
.ck-btn--accept {\
  color: var(--gold, #c9a544);\
  border-color: var(--gold, #c9a544);\
}\
.ck-btn--accept:hover {\
  background: rgba(201, 165, 68, 0.10);\
}\
.ck-btn--decline {\
  color: var(--muted, #5c5447);\
  border-color: var(--line-2, rgba(237,228,204,0.20));\
}\
.ck-btn--decline:hover {\
  color: var(--paper-3, #a89c80);\
  border-color: var(--paper-3, #a89c80);\
}\
@media (max-width: 768px) {\
  #cookie-banner { padding: 18px 28px; gap: 20px; }\
}\
@media (max-width: 560px) {\
  #cookie-banner { padding: 16px 20px; gap: 16px; }\
  .ck-actions { width: 100%; justify-content: flex-end; }\
}';
    document.head.appendChild(style);
  }

  function showBanner() {
    injectStyles();

    var banner = document.createElement('div');
    banner.id = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');

    var body = document.createElement('div');
    body.className = 'ck-body';

    var label = document.createElement('div');
    label.className = 'ck-label';
    label.textContent = 'Cookies & Privacy';

    var text = document.createElement('p');
    text.className = 'ck-text';
    text.innerHTML = 'This site uses analytical cookies (Google Analytics) solely to understand how visitors use it. '
      + 'No personal profiling, no advertising tracking. Your data is never sold or shared. '
      + '<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google’s Privacy Policy ↗</a>.';

    body.appendChild(label);
    body.appendChild(text);

    var actions = document.createElement('div');
    actions.className = 'ck-actions';

    var declineBtn = document.createElement('button');
    declineBtn.className = 'ck-btn ck-btn--decline';
    declineBtn.textContent = 'Decline';

    var acceptBtn = document.createElement('button');
    acceptBtn.className = 'ck-btn ck-btn--accept';
    acceptBtn.textContent = 'Accept';

    actions.appendChild(declineBtn);
    actions.appendChild(acceptBtn);

    banner.appendChild(body);
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
