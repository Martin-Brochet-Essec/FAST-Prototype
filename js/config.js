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
    API_KEY: "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",
    MODELE: "claude-sonnet-4-6"
  },
  OPENAI: {
    API_KEY: "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",
    MODELE: "gpt-4o-mini"
  },
  GEMINI: {
    API_KEY: "AQ.Ab8RN6INYIGyCeFSZAbtX7MsdiavkGf2eQUMMVYjMF6Mq0EVzw",
    MODELE: "gemini-2.0-flash"
  },
  MISTRAL: {
    API_KEY: "REMPLACEZ_PAR_VOTRE_CLE_API",
    MODELE: "mistral-small-latest"
  }
};
