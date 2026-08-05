// ============================================================
// PAGE 1 — version 100% statique (GitHub Pages)
// 1) Charge la question depuis data/question.xml (fetch, fichier statique)
// 2) L'utilisateur répond
// 3) Charge prompts/agent_prompt.xml, y injecte question + réponse
// 4) Appelle l'API IA DIRECTEMENT depuis le navigateur
// 5) Génère un fichier XML + un fichier TXT de l'échange (téléchargés)
// 6) Garde le résultat en sessionStorage et redirige vers la page 2
// ============================================================

const elementQuestion = document.getElementById("question-affichee");
const formulaire = document.getElementById("formulaire-reponse");
const champReponse = document.getElementById("champ-reponse");
const boutonEnvoyer = document.getElementById("bouton-envoyer");
const statut = document.getElementById("statut");

let questionCourante = "";

// --- Utilitaires génériques ---

function analyserXML(texteXML) {
  return new DOMParser().parseFromString(texteXML, "application/xml");
}

function horodatage() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function telechargerFichier(nomFichier, contenu, typeMime) {
  const blob = new Blob([contenu], { type: typeMime });
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(blob);
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(lien.href);
}

function echapperXML(texte) {
  return String(texte)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// --- 1) Charger la question au chargement de la page ---
async function chargerQuestion() {
  try {
    const res = await fetch(CONFIG.CHEMIN_QUESTION);
    const texteXML = await res.text();
    const doc = analyserXML(texteXML);
    questionCourante = doc.querySelector("texte").textContent.trim();
    elementQuestion.textContent = questionCourante;
  } catch (erreur) {
    elementQuestion.textContent =
      "Impossible de charger data/question.xml (vérifiez le chemin du fichier).";
  }
}

// --- Appel IA direct depuis le navigateur ---
// Point d'entrée générique : redirige vers la bonne fonction selon
// CONFIG.FOURNISSEUR_IA. Chaque fonction renvoie une simple chaîne de texte,
// donc le reste du fichier (stockage XML/TXT, affichage) n'a pas à savoir
// quel fournisseur a été utilisé.
async function interrogerAgentIA(promptFinal) {
  if (CONFIG.UTILISER_RELAIS) {
    return interrogerViaRelais(promptFinal);
  }

  switch (CONFIG.FOURNISSEUR_IA) {
    case "anthropic": return interrogerAnthropic(promptFinal);
    case "openai":    return interrogerOpenAI(promptFinal);
    case "gemini":    return interrogerGemini(promptFinal);
    case "mistral":   return interrogerMistral(promptFinal);
    default:
      throw new Error(`Fournisseur IA inconnu : "${CONFIG.FOURNISSEUR_IA}"`);
  }
}

// Appelle le relais serverless (voir /relais-ia/worker.js) au lieu du
// fournisseur directement. Le relais choisit lui-même la bonne clé API
// selon le champ "fournisseur" envoyé ici.
async function interrogerViaRelais(promptFinal) {
  const res = await fetch(CONFIG.URL_RELAIS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fournisseur: CONFIG.FOURNISSEUR_IA,
      prompt: promptFinal
    })
  });
  const donnees = await res.json();
  if (donnees.erreur) throw new Error(donnees.erreur);
  return donnees.reponseIA;
}

async function interrogerAnthropic(promptFinal) {
  const reponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CONFIG.ANTHROPIC.API_KEY,
      "anthropic-version": "2023-06-01",
      // Requis pour autoriser un appel direct depuis un navigateur (prototype only)
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: CONFIG.ANTHROPIC.MODELE,
      max_tokens: 200,
      messages: [{ role: "user", content: promptFinal }]
    })
  });

  const donnees = await reponse.json();
  if (donnees.error) throw new Error(donnees.error.message);

  const blocTexte = (donnees.content || []).find((b) => b.type === "text");
  return blocTexte ? blocTexte.text.trim() : "";
}

async function interrogerOpenAI(promptFinal) {
  // ⚠️ L'API OpenAI ne renvoie pas d'en-têtes CORS pour les appels
  // navigateur : cet appel échouera probablement tel quel depuis
  // GitHub Pages. Il faudra alors passer par une fonction serverless
  // relais (voir le README) plutôt que d'appeler directement cette URL.
  const reponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CONFIG.OPENAI.API_KEY}`
    },
    body: JSON.stringify({
      model: CONFIG.OPENAI.MODELE,
      messages: [{ role: "user", content: promptFinal }]
    })
  });

  const donnees = await reponse.json();
  if (donnees.error) throw new Error(donnees.error.message);

  return (donnees.choices?.[0]?.message?.content || "").trim();
}

async function interrogerGemini(promptFinal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI.MODELE}:generateContent?key=${CONFIG.GEMINI.API_KEY}`;

  const reponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptFinal }] }]
    })
  });

  const donnees = await reponse.json();
  if (donnees.error) throw new Error(donnees.error.message);

  return (donnees.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

async function interrogerMistral(promptFinal) {
  // ⚠️ Comme pour OpenAI, un appel direct depuis un navigateur peut être
  // bloqué par la politique CORS de l'API. À tester ; sinon passer par
  // une fonction serverless relais.
  const reponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CONFIG.MISTRAL.API_KEY}`
    },
    body: JSON.stringify({
      model: CONFIG.MISTRAL.MODELE,
      messages: [{ role: "user", content: promptFinal }]
    })
  });

  const donnees = await reponse.json();
  if (donnees.error) throw new Error(donnees.error.message || JSON.stringify(donnees.error));

  return (donnees.choices?.[0]?.message?.content || "").trim();
}

// --- 2) Gérer l'envoi du formulaire ---
formulaire.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();

  const reponseUtilisateur = champReponse.value.trim();
  if (!reponseUtilisateur) return;

  boutonEnvoyer.disabled = true;
  statut.textContent = "Interrogation de l'agent IA...";

  try {
    // --- 3) Charger et assembler le prompt agent ---
    const resPrompt = await fetch(CONFIG.CHEMIN_PROMPT_AGENT);
    let gabaritPrompt = await resPrompt.text();

    // On retire les commentaires XML (<!-- ... -->) : sans ça, l'IA a
    // tendance à croire qu'on lui demande d'analyser/expliquer le fichier
    // plutôt que d'exécuter les instructions qu'il contient.
    gabaritPrompt = gabaritPrompt.replace(/<!--[\s\S]*?-->/g, "").trim();

    const consigneExplicite =
      "Les balises XML ci-dessous sont des INSTRUCTIONS à exécuter, pas un " +
      "document à analyser ou décrire. Applique le rôle et les règles " +
      "qu'elles définissent, puis réponds uniquement au contenu de la " +
      "balise <contexte>, dans le format demandé par <format_de_sortie>. " +
      "Ne mentionne jamais le XML lui-même dans ta réponse.\n\n";

    const promptFinal = consigneExplicite + gabaritPrompt
      .replace("{{QUESTION}}", echapperXML(questionCourante))
      .replace("{{REPONSE_UTILISATEUR}}", echapperXML(reponseUtilisateur));

    // --- 4) Appeler l'IA ---
    const reponseIA = await interrogerAgentIA(promptFinal);

    // --- 5) Générer les fichiers XML + TXT de l'échange (téléchargement local) ---
    const id = horodatage();
    const dateISO = new Date().toISOString();

    const contenuXML =
`<?xml version="1.0" encoding="UTF-8"?>
<interaction id="${id}">
  <date>${dateISO}</date>
  <question>${echapperXML(questionCourante)}</question>
  <reponse_utilisateur>${echapperXML(reponseUtilisateur)}</reponse_utilisateur>
  <reponse_ia>${echapperXML(reponseIA)}</reponse_ia>
</interaction>
`;
    const contenuTXT =
`Date : ${dateISO}
Question : ${questionCourante}
Réponse utilisateur : ${reponseUtilisateur}
Réponse agent IA : ${reponseIA}
`;

    telechargerFichier(`${id}.xml`, contenuXML, "application/xml");
    telechargerFichier(`${id}.txt`, contenuTXT, "text/plain");

    // --- 6) Garder le résultat pour l'affichage en page 2 ---
    sessionStorage.setItem("dernier_resultat", JSON.stringify({
      id, question: questionCourante, reponse: reponseUtilisateur, reponseIA
    }));

    window.location.href = "reponse.html";
  } catch (erreur) {
    statut.textContent = "Erreur : " + erreur.message;
    boutonEnvoyer.disabled = false;
  }
});

chargerQuestion();
