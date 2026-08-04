// FAST prototype — shared logic across all screens.
// NOTE on storage: a browser page cannot write arbitrary files to disk, or read local
// XML via fetch() unless the site is served over http(s) (opening files directly with
// file:// blocks fetch by CORS in most browsers). This file therefore:
//  - tries fetch() first (works when you serve this folder, e.g. `python3 -m http.server`)
//  - falls back to an embedded copy of the same content (assets/fallback.js) so the
//    prototype still works if opened directly by double-clicking index.html.
//  - "writes a text file" the only way a browser page safely can: it generates the file
//    in memory and triggers a real download, named with date, time and the user's name.
//  - profile / preferences are kept in localStorage, standing in for the requested XML
//    file (same limitation: no direct disk writes from a browser page).

window.FAST = (function(){
  function getLang(){ return localStorage.getItem('fast_lang') || 'fr'; }

  function xmlToDict(xmlText){
    const dict = {};
    try{
      const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
      doc.querySelectorAll('string').forEach(n => { dict[n.getAttribute('key')] = n.textContent; });
    }catch(e){}
    return dict;
  }

  function dict(){
    const lang = getLang();
    return (window.FAST_FALLBACK_I18N && window.FAST_FALLBACK_I18N[lang]) || {};
  }

  async function applyI18n(){
    const lang = getLang();
    let d = (window.FAST_FALLBACK_I18N && window.FAST_FALLBACK_I18N[lang]) || {};
    try{
      const res = await fetch('assets/i18n/' + lang + '.xml');
      if(res.ok){
        const fetched = xmlToDict(await res.text());
        if(Object.keys(fetched).length) d = fetched;
      }
    }catch(e){ /* served via file:// — silently keep the fallback */ }

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if(d[k] !== undefined) el.textContent = d[k];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const k = el.getAttribute('data-i18n-ph');
      if(d[k] !== undefined) el.setAttribute('placeholder', d[k]);
    });
    document.querySelectorAll('[data-i18n-label]').forEach(el => {
      const k = el.getAttribute('data-i18n-label');
      if(d[k] !== undefined) el.setAttribute('data-label', d[k]);
    });
    document.querySelectorAll('.langbtn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    updateGreeting();
  }

  function setLang(lang){
    localStorage.setItem('fast_lang', lang);
    applyI18n();
  }

  async function loadQuestions(setId){
    const lang = getLang();
    let list = (window.FAST_FALLBACK_Q && window.FAST_FALLBACK_Q[setId] && window.FAST_FALLBACK_Q[setId][lang]) || [];
    try{
      const res = await fetch('assets/questions.xml');
      if(res.ok){
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, 'text/xml');
        const sets = Array.from(doc.querySelectorAll('set'));
        const set = sets.find(s => s.getAttribute('id') === setId && s.getAttribute('lang') === lang);
        if(set){
          const items = Array.from(set.querySelectorAll('q')).map(n => n.textContent);
          if(items.length) list = items;
        }
      }
    }catch(e){ /* file:// — keep fallback */ }
    return list;
  }

  // ---- Profile (stands in for the requested profile XML file) ----
  function getProfile(){
    try{ return JSON.parse(localStorage.getItem('fast_profile') || '{}'); }
    catch(e){ return {}; }
  }
  function saveProfile(patch){
    const p = Object.assign(getProfile(), patch);
    localStorage.setItem('fast_profile', JSON.stringify(p));
    updateGreeting();
    return p;
  }
  function updateGreeting(){
    const el = document.getElementById('greetName');
    if(!el) return;
    const p = getProfile();
    el.textContent = p.firstname || dict().home_name_fallback || '';
  }

  // ---- Configuration (reminder frequency, retention) ----
  function getConfig(){
    try{ return JSON.parse(localStorage.getItem('fast_config') || '{}'); }
    catch(e){ return {}; }
  }
  function saveConfig(patch){
    const c = Object.assign(getConfig(), patch);
    localStorage.setItem('fast_config', JSON.stringify(c));
    return c;
  }

  // ---- Answers log + export to a downloadable .txt file ----
  function logAnswers(screen, qaPairs){
    const all = JSON.parse(localStorage.getItem('fast_answers') || '[]');
    all.push({ screen: screen, ts: new Date().toISOString(), qa: qaPairs });
    localStorage.setItem('fast_answers', JSON.stringify(all));
  }
  function pad(n){ return String(n).padStart(2, '0'); }
  function exportTxt(){
    const p = getProfile();
    const username = (p.firstname || 'utilisatrice').replace(/[^a-zA-Z0-9_-]/g, '_');
    const all = JSON.parse(localStorage.getItem('fast_answers') || '[]');
    let content = 'FAST — export des réponses\nUtilisatrice : ' + username + '\nGénéré le : ' + new Date().toString() + '\n\n';
    if(all.length === 0){ content += '(aucune réponse enregistrée pour le moment)\n'; }
    all.forEach(entry => {
      content += '--- ' + entry.screen + ' (' + entry.ts + ') ---\n';
      entry.qa.forEach(q => { content += 'Q: ' + q.q + '\nR: ' + (q.a || '') + '\n\n'; });
    });
    const now = new Date();
    const stamp = now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    const filename = 'FAST_reponses_' + username + '_' + stamp + '.txt';
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ---- Generic question-stepper used by q10 / q5 / deepen / new-question screens ----
  async function runStepper(setId, labelKey, nextUrl){
    const items = await loadQuestions(setId);
    const qa = new Array(items.length);
    let i = 0;
    const textEl = document.getElementById('q-text');
    const answerEl = document.getElementById('q-answer');
    const progressEl = document.getElementById('q-progress');
    const dotsEl = document.getElementById('q-dots');
    const nextEl = document.getElementById('q-next');
    const prevEl = document.getElementById('q-prev');

    function render(){
      textEl.textContent = items[i];
      answerEl.value = (qa[i] && qa[i].a) || '';
      const d = dict();
      progressEl.textContent = (d[labelKey] || '') + ' ' + (i+1) + ' / ' + items.length;
      dotsEl.innerHTML = items.map((_, idx) => '<div class="dot ' + (idx <= i ? 'done' : '') + '"></div>').join('');
      nextEl.textContent = (i === items.length - 1) ? (d.nav_finish || 'Terminer') : (d.nav_next || 'Suivant');
    }
    answerEl.addEventListener('input', function(){ qa[i] = { q: items[i], a: answerEl.value }; });
    prevEl.addEventListener('click', function(){ if(i > 0){ i--; render(); } });
    nextEl.addEventListener('click', function(){
      if(!qa[i]) qa[i] = { q: items[i], a: answerEl.value };
      if(i < items.length - 1){ i++; render(); }
      else{ logAnswers(setId, qa); window.location.href = nextUrl; }
    });
    render();
  }

  function openMenu(){ document.getElementById('menuOverlay').classList.add('open'); }
  function closeMenu(){ document.getElementById('menuOverlay').classList.remove('open'); }

  function selectFeel(el){
    el.parentElement.querySelectorAll('.feel').forEach(f => f.classList.remove('sel'));
    el.classList.add('sel');
  }
  function selectRadio(el, groupName){
    el.parentElement.querySelectorAll('.radio-opt').forEach(f => f.classList.remove('sel'));
    el.classList.add('sel');
    el.parentElement.dataset.selected = el.dataset.value;
  }


  // 1. Fonction pour charger le prompt depuis le fichier XML
async function loadCoachPrompt(coachId) {
  try {
    const res = await fetch('assets/prompts.xml');
    const xmlText = await res.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const coachNode = xmlDoc.querySelector(`coach[id="${coachId}"]`);
    
    if (coachNode) {
      return {
        system: coachNode.querySelector('system_prompt').textContent,
        user: coachNode.querySelector('user_prompt').textContent
      };
    }
  } catch (err) {
    console.error('Erreur chargement XML prompt:', err);
  }
  return null;
}

  
  function init(){ applyI18n(); }

  return {
    getLang: getLang, setLang: setLang, applyI18n: applyI18n, dict: dict,
    loadQuestions: loadQuestions, runStepper: runStepper,
    getProfile: getProfile, saveProfile: saveProfile,
    getConfig: getConfig, saveConfig: saveConfig,
    logAnswers: logAnswers, exportTxt: exportTxt,
    openMenu: openMenu, closeMenu: closeMenu,
    selectFeel: selectFeel, selectRadio: selectRadio,
    init: init
  };
})();

// ==========================================
// Composant Web Centralisé pour le Menu
// ==========================================
class FastHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="statusbar">
        <span>9:41</span>
         <button class="menubtn" onclick="FAST.openMenu()" aria-label="Menu" style="background:none; border:none; font-size:20px; cursor:pointer; color: var(--text, #000);">&#9776;</button>
      </div>
      <div class="menu-overlay" id="menuOverlay" onclick="if(event.target===this) FAST.closeMenu()">
        <div class="menu-panel">
          <a class="menu-item" href="index.html" data-i18n="menu_accueil">Accueil</a>
          <a class="menu-item" href="profile.html" data-i18n="menu_profil">Profil</a>
          <a class="menu-item" href="who-am-i.html" data-i18n="menu_whoami">Qui suis-je</a>
          <a class="menu-item" href="config.html" data-i18n="menu_config">Configuration</a>
          <a class="menu-item" href="subscription.html" data-i18n="menu_subscription">Abonnement</a>
          <a class="menu-item" href="index.html" data-i18n="menu_deconnexion">Se déconnecter</a>
        </div>
      </div>
    `;
  }
}
customElements.define('fast-header', FastHeader);

document.addEventListener('DOMContentLoaded', FAST.init);
