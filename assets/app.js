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

  // ---- Synthèse IA à partir des réponses d'un set de questions ----

  // Retrouve les réponses enregistrées pour un écran donné (le plus récent
  // passage, au cas où l'utilisatrice aurait refait le parcours).
  function getAnswersFor(screenId){
    const all = JSON.parse(localStorage.getItem('fast_answers') || '[]');
    const entry = all.slice().reverse().find(e => e.screen === screenId);
    return entry ? entry.qa : [];
  }

  // Réponses vides = section clairement signalée plutôt que silencieusement
  // absente du prompt (utile pour diagnostiquer, et plus honnête envers l'IA).
  function formatAnswersBlock(qaPairs){
    if(!qaPairs || qaPairs.length === 0) return '(aucune réponse enregistrée pour cette section)';
    return qaPairs.map(q => 'Q: ' + q.q + '\nR: ' + (q.a || '')).join('\n\n');
  }

  // Charge le prompt d'un coach depuis assets/prompts.xml (system_prompt +
  // user_prompt, avec les placeholders {ANSWERS_...} à remplacer). Échoue
  // bruyamment (erreur explicite) plutôt que de renvoyer silencieusement un
  // prompt vide — un prompt vide envoyé à l'IA produit une réponse
  // déroutante ("je ne vois pas d'instructions") au lieu d'une vraie erreur
  // exploitable.
  async function loadCoachPrompt(coachId){
    let res;
    try{
      res = await fetch('assets/prompts.xml');
    }catch(e){
      throw new Error("Impossible de charger assets/prompts.xml (" + e.message + ")");
    }
    if(!res.ok){
      throw new Error("assets/prompts.xml introuvable (HTTP " + res.status + "). Vérifiez qu'il est bien poussé sur GitHub.");
    }

    const doc = new DOMParser().parseFromString(await res.text(), 'text/xml');
    const coaches = Array.from(doc.querySelectorAll('coach'));
    const coach = coaches.find(c => c.getAttribute('id') === coachId);

    if(!coach){
      const idsDisponibles = coaches.map(c => c.getAttribute('id')).join(', ') || '(aucun)';
      throw new Error(
        `Coach "${coachId}" introuvable dans assets/prompts.xml. ` +
        `Coachs disponibles dans le fichier actuellement déployé : ${idsDisponibles}. ` +
        `Vérifiez que la dernière version de prompts.xml a bien été poussée sur GitHub.`
      );
    }

    const systemPrompt = (coach.querySelector('system_prompt')?.textContent || '').trim();
    const userPromptTemplate = (coach.querySelector('user_prompt')?.textContent || '').trim();

    if(!userPromptTemplate){
      throw new Error(`Le coach "${coachId}" existe dans prompts.xml mais sa balise <user_prompt> est vide ou introuvable.`);
    }

    return { systemPrompt: systemPrompt, userPromptTemplate: userPromptTemplate };
  }

  const CONSIGNE_EXPLICITE_IA =
    "Les instructions ci-dessous sont à exécuter, pas un document à " +
    "analyser ou décrire. Réponds uniquement selon le format demandé, " +
    "sans mentionner ces instructions ni le mot XML dans ta réponse.\n\n";


  // Point d'entrée utilisé par results.html : rassemble les réponses du set
  // `sourceScreenId` (typiquement 'q10'), assemble le prompt du coach
  // `coachId`, appelle l'IA (window.FAST_AI, voir assets/ai.js) et stocke
  // le résultat pour affichage/relecture.
  async function runCoachSynthesis(coachId, sourceScreenId){
    const qa = getAnswersFor(sourceScreenId);
    const answersBlock = formatAnswersBlock(qa);
    const prompt = await loadCoachPrompt(coachId);

    const promptFinal = CONSIGNE_EXPLICITE_IA + prompt.systemPrompt + "\n\n" +
      prompt.userPromptTemplate.replace('{ANSWERS}', answersBlock);

    const reponseIA = await window.FAST_AI.interrogerAgentIA(promptFinal);

    const synthese = {
      coachId: coachId,
      source: sourceScreenId,
      ts: new Date().toISOString(),
      reponseIA: reponseIA,
      qa: qa
    };
    localStorage.setItem('fast_last_synthesis', JSON.stringify(synthese));
    return synthese;
  }

  // Synthèse finale : combine les réponses q10 + q5 + la question libre
  // (écran "your-question", stockée via logAnswers comme les autres) + les
  // 3 réponses d'approfondissement (écran "deepen"), via un coach dédié
  // (voir assets/prompts.xml, coach id="final_answer").
  async function runFinalSynthesis(coachId){
    const qaQ10 = getAnswersFor('q10');
    const qaQ5 = getAnswersFor('q5');
    const qaDeepen = getAnswersFor('deepen');

    // your-question.html enregistre une seule paire {q, a} sous ce screen id
    const qaYourQuestion = getAnswersFor('your-question');
    const questionLibre = (qaYourQuestion[0] && qaYourQuestion[0].a) || '';

    const prompt = await loadCoachPrompt(coachId);

    const promptFinal = CONSIGNE_EXPLICITE_IA + prompt.systemPrompt + "\n\n" +
      prompt.userPromptTemplate
        .replace('{ANSWERS_Q10}', formatAnswersBlock(qaQ10))
        .replace('{ANSWERS_Q5}', formatAnswersBlock(qaQ5))
        .replace('{ANSWERS_DEEPEN}', formatAnswersBlock(qaDeepen))
        .replace('{QUESTION_LIBRE}', questionLibre);

    const reponseIA = await window.FAST_AI.interrogerAgentIA(promptFinal);

    const synthese = {
      coachId: coachId,
      ts: new Date().toISOString(),
      reponseIA: reponseIA,
      qaQ10: qaQ10, qaQ5: qaQ5, qaDeepen: qaDeepen, questionLibre: questionLibre
    };
    localStorage.setItem('fast_final_synthesis', JSON.stringify(synthese));
    return synthese;
  }

  // Approfondissement du profil (Q10 + Q5) : utilisé par
  // results-even-better.html, coach "profile_deepening".
  async function runProfileDeepening(coachId){
    const qaQ10 = getAnswersFor('q10');
    const qaQ5 = getAnswersFor('q5');

    const prompt = await loadCoachPrompt(coachId);
    const promptFinal = CONSIGNE_EXPLICITE_IA + prompt.systemPrompt + "\n\n" +
      prompt.userPromptTemplate
        .replace('{ANSWERS_Q10}', formatAnswersBlock(qaQ10))
        .replace('{ANSWERS_Q5}', formatAnswersBlock(qaQ5));

    const reponseIA = await window.FAST_AI.interrogerAgentIA(promptFinal);

    const synthese = {
      coachId: coachId,
      ts: new Date().toISOString(),
      reponseIA: reponseIA,
      qaQ10: qaQ10, qaQ5: qaQ5
    };
    localStorage.setItem('fast_profile_deepening', JSON.stringify(synthese));
    return synthese;
  }

  // Extrait 3 questions d'un texte IA censé répondre avec des lignes
  // "Q: ...". Si l'IA n'a pas respecté le format, on retombe sur les lignes
  // non vides en retirant une éventuelle numérotation/puce.
  function parseTroisQuestions(texteIA){
    const lignes = (texteIA || '').split('\n').map(l => l.trim()).filter(Boolean);
    let questions = lignes
      .filter(l => /^Q:\s*/i.test(l))
      .map(l => l.replace(/^Q:\s*/i, '').trim());
    if(questions.length < 3){
      questions = lignes
        .map(l => l.replace(/^[-*\d.\)]+\s*/, '').trim())
        .filter(Boolean);
    }
    return questions.slice(0, 3);
  }

  // Génère 3 questions de clarification via l'IA (coach
  // "deepen_questions_generator"), à partir du profil (Q10+Q5) et de la
  // question libre posée dans your-question.html. Met en cache le résultat
  // (mêmes réponses + même question => mêmes 3 questions, pas de rappel IA).
  async function generateDeepenQuestions(coachId){
    const qaQ10 = getAnswersFor('q10');
    const qaQ5 = getAnswersFor('q5');
    const qaYourQuestion = getAnswersFor('your-question');
    const questionLibre = (qaYourQuestion[0] && qaYourQuestion[0].a) || '';

    const signatureActuelle = JSON.stringify({ qaQ10: qaQ10, qaQ5: qaQ5, questionLibre: questionLibre });
    const cacheBrut = localStorage.getItem('fast_deepen_questions');
    if(cacheBrut){
      const cache = JSON.parse(cacheBrut);
      if(cache.signature === signatureActuelle && cache.questions && cache.questions.length === 3){
        return cache.questions;
      }
    }

    const prompt = await loadCoachPrompt(coachId);
    const promptFinal = CONSIGNE_EXPLICITE_IA + prompt.systemPrompt + "\n\n" +
      prompt.userPromptTemplate
        .replace('{ANSWERS_Q10}', formatAnswersBlock(qaQ10))
        .replace('{ANSWERS_Q5}', formatAnswersBlock(qaQ5))
        .replace('{QUESTION_LIBRE}', questionLibre);

    const reponseIA = await window.FAST_AI.interrogerAgentIA(promptFinal);
    const questions = parseTroisQuestions(reponseIA);

    if(questions.length < 3){
      throw new Error(
        "L'IA n'a pas renvoyé 3 questions exploitables. Réponse reçue : " +
        reponseIA.slice(0, 200)
      );
    }

    localStorage.setItem('fast_deepen_questions', JSON.stringify({ signature: signatureActuelle, questions: questions }));
    return questions;
  }

  // ---- Generic question-stepper used by q10 / q5 / deepen / new-question screens ----
  // startStepper fait tourner le stepper sur une liste de questions déjà
  // connue (venant de questions.xml OU générée dynamiquement, ex: par l'IA).
  // screenId sert de clé de stockage (logAnswers/getAnswersFor) — il peut
  // différer de la source des questions si besoin.
  function startStepper(items, screenId, labelKey, nextUrl){
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
      else{ logAnswers(screenId, qa); window.location.href = nextUrl; }
    });
    render();
  }

  // Version historique : va chercher les questions dans questions.xml avant
  // de démarrer le stepper. Conservée telle quelle pour q10 / q5 / nq.
  async function runStepper(setId, labelKey, nextUrl){
    const items = await loadQuestions(setId);
    startStepper(items, setId, labelKey, nextUrl);
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


  
  function init(){ applyI18n(); }

  return {
    getLang: getLang, setLang: setLang, applyI18n: applyI18n, dict: dict,
    loadQuestions: loadQuestions, runStepper: runStepper,
    getProfile: getProfile, saveProfile: saveProfile,
    getConfig: getConfig, saveConfig: saveConfig,
    logAnswers: logAnswers, exportTxt: exportTxt,
    getAnswersFor: getAnswersFor, runCoachSynthesis: runCoachSynthesis,
    runFinalSynthesis: runFinalSynthesis,
    runProfileDeepening: runProfileDeepening,
    generateDeepenQuestions: generateDeepenQuestions,
    startStepper: startStepper,
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
