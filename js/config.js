// ============================================================
// CONFIG — à adapter avant déploiement
// ============================================================
const CONFIG = {
  // Chemins des fichiers XML statiques (relatifs à la racine du site)
  CHEMIN_QUESTION: "data/question.xml",
  CHEMIN_PROMPT_AGENT: "prompts/agent_prompt.xml",

  // --- Choix du fournisseur IA ---
  // Site statique = pas de vraie "variable d'environnement" (le navigateur
  // n'y a pas accès). Cette constante en tient lieu : changez sa valeur
  // avant de déployer. Valeurs possibles : "anthropic", "openai", "gemini", "mistral"
  FOURNISSEUR_IA: "anthropic",

  // --- Clés API et modèles, un jeu par fournisseur ---
  // ⚠️ Ces clés sont visibles côté client : uniquement pour un prototype/démo,
  // jamais pour un vrai déploiement public avec une clé payante active.
  ANTHROPIC: {
    API_KEY: "REMPLACEZ_PAR_VOTRE_CLE_API",
    MODELE: "claude-sonnet-4-6"
  },
  OPENAI: {
    API_KEY: "REMPLACEZ_PAR_VOTRE_CLE_API",
    MODELE: "gpt-4o-mini"
  },
  GEMINI: {
    API_KEY: "REMPLACEZ_PAR_VOTRE_CLE_API",
    MODELE: "gemini-1.5-flash"
  },
  MISTRAL: {
    API_KEY: "REMPLACEZ_PAR_VOTRE_CLE_API",
    MODELE: "mistral-small-latest"
  }
};
