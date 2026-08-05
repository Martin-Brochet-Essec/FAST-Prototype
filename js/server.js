// ============================================================
// SERVEUR EXEMPLE — architecture générique
//
// Rôle de ce fichier :
//  1. Servir les pages HTML/CSS/JS du dossier /public
//  2. GET  /api/question   -> lit data/question.xml et renvoie la question
//  3. POST /api/repondre   -> reçoit {question, reponse}
//       a. écrit l'échange dans un fichier XML ET un fichier TXT (data/interactions/)
//       b. charge prompts/agent_prompt.xml, y injecte question + réponse
//       c. envoie ce prompt à une IA (fonction interrogerAgentIA, à adapter)
//       d. complète le fichier XML avec la réponse de l'IA
//       e. renvoie le tout au navigateur (page 2)
//
// Aucune dépendance lourde : uniquement "express".
// ============================================================

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DOSSIER_DATA = path.join(__dirname, "data");
const DOSSIER_INTERACTIONS = path.join(DOSSIER_DATA, "interactions");
const FICHIER_QUESTION = path.join(DOSSIER_DATA, "question.xml");
const FICHIER_PROMPT_AGENT = path.join(__dirname, "prompts", "agent_prompt.xml");

if (!fs.existsSync(DOSSIER_INTERACTIONS)) {
  fs.mkdirSync(DOSSIER_INTERACTIONS, { recursive: true });
}

// ------------------------------------------------------------
// Utilitaires génériques
// ------------------------------------------------------------

// Échappe les caractères spéciaux XML pour éviter de casser le fichier
function echapperXML(texte) {
  return String(texte)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Extrait très simplement le contenu d'une balise (suffisant pour cet exemple)
function extraireBalise(xml, nomBalise) {
  const motif = new RegExp(`<${nomBalise}>([\\s\\S]*?)<\\/${nomBalise}>`);
  const resultat = xml.match(motif);
  return resultat ? resultat[1].trim() : "";
}

function horodatage() {
  const maintenant = new Date();
  return maintenant.toISOString().replace(/[:.]/g, "-");
}

// ------------------------------------------------------------
// Étape "agent IA" — isolée dans sa propre fonction pour rester générique.
// Remplacez le corps de cette fonction par un vrai appel API
// (Anthropic, OpenAI, etc.) selon le fournisseur choisi.
// ------------------------------------------------------------
async function interrogerAgentIA(promptFinal) {
  const cleAPI = process.env.ANTHROPIC_API_KEY;

  if (!cleAPI) {
    // Mode démo hors-ligne : pas de clé API configurée.
    // Permet de tester tout le circuit (XML/TXT) sans dépendre d'un service externe.
    return "Réponse de démonstration (aucune clé API configurée). " +
           "Configurez ANTHROPIC_API_KEY pour obtenir une vraie réponse d'agent. " +
           "Le reste du circuit (stockage XML/TXT) fonctionne normalement.";
  }

  const reponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cleAPI,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [{ role: "user", content: promptFinal }]
    })
  });

  const donnees = await reponse.json();
  const blocTexte = (donnees.content || []).find((b) => b.type === "text");
  return blocTexte ? blocTexte.text.trim() : "";
}

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------

// 1) Fournir la question à afficher sur la page 1
app.get("/api/question", (requete, reponseHTTP) => {
  const contenuXML = fs.readFileSync(FICHIER_QUESTION, "utf-8");
  const question = extraireBalise(contenuXML, "texte");
  reponseHTTP.json({ question });
});

// 2) Recevoir la réponse de l'utilisateur, stocker, interroger l'agent, répondre
app.post("/api/repondre", async (requete, reponseHTTP) => {
  try {
    const { question, reponse } = requete.body;
    if (!question || !reponse) {
      return reponseHTTP.status(400).json({ erreur: "question et reponse requis" });
    }

    const id = horodatage();
    const cheminXML = path.join(DOSSIER_INTERACTIONS, `${id}.xml`);
    const cheminTXT = path.join(DOSSIER_INTERACTIONS, `${id}.txt`);

    // --- a) Stockage brut (XML + TXT) AVANT l'appel IA ---
    const xmlInitial =
`<?xml version="1.0" encoding="UTF-8"?>
<interaction id="${id}">
  <date>${new Date().toISOString()}</date>
  <question>${echapperXML(question)}</question>
  <reponse_utilisateur>${echapperXML(reponse)}</reponse_utilisateur>
  <reponse_ia></reponse_ia>
</interaction>
`;
    fs.writeFileSync(cheminXML, xmlInitial, "utf-8");

    const txtInitial =
`Date : ${new Date().toISOString()}
Question : ${question}
Réponse utilisateur : ${reponse}
Réponse agent IA : (en attente)
`;
    fs.writeFileSync(cheminTXT, txtInitial, "utf-8");

    // --- b) Charger le prompt d'agent (XML) et l'assembler ---
    const gabaritPrompt = fs.readFileSync(FICHIER_PROMPT_AGENT, "utf-8");
    const promptFinal = gabaritPrompt
      .replace("{{QUESTION}}", echapperXML(question))
      .replace("{{REPONSE_UTILISATEUR}}", echapperXML(reponse));

    // --- c) Appeler l'agent IA ---
    const reponseIA = await interrogerAgentIA(promptFinal);

    // --- d) Compléter les fichiers avec la réponse de l'IA ---
    const xmlFinal = xmlInitial.replace(
      "<reponse_ia></reponse_ia>",
      `<reponse_ia>${echapperXML(reponseIA)}</reponse_ia>`
    );
    fs.writeFileSync(cheminXML, xmlFinal, "utf-8");

    const txtFinal = txtInitial.replace(
      "Réponse agent IA : (en attente)",
      `Réponse agent IA : ${reponseIA}`
    );
    fs.writeFileSync(cheminTXT, txtFinal, "utf-8");

    // --- e) Renvoyer le résultat pour l'affichage en page 2 ---
    reponseHTTP.json({ id, question, reponse, reponseIA });

  } catch (erreur) {
    console.error(erreur);
    reponseHTTP.status(500).json({ erreur: "Erreur serveur" });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Serveur exemple lancé sur http://localhost:${PORT}`);
});
