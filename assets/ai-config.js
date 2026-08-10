// ============================================================
// AI-CONFIG — à adapter avant déploiement
// Sur un site statique, il n'existe pas de vraie variable
// d'environnement (le navigateur n'y a pas accès) : ces valeurs
// en tiennent lieu.
// ============================================================
window.FAST_AI_CONFIG = {
  CHEMIN_PROMPTS: "assets/prompts.xml",

  // "anthropic" | "openai" | "gemini" | "mistral"
  FOURNISSEUR_IA: "anthropic",

  // false = appel direct au fournisseur depuis ce navigateur (clé visible).
  // true  = passe par un relais serverless qui cache la clé (voir /relais-ia).
  UTILISER_RELAIS: false,
  URL_RELAIS: "https://relais-ia-fast.VOTRE-SOUS-DOMAINE.workers.dev",

  // ⚠️ Visibles côté client si UTILISER_RELAIS = false : uniquement pour
  // un prototype/démo, jamais pour un déploiement public avec une clé
  // payante active.
  ANTHROPIC: {
    API_KEY: "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",
    MODELE: "claude-sonnet-4-6"
    //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
  },
  OPENAI: {
    API_KEY: "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",
    MODELE: "gpt-4o-mini"
    
  },
  GEMINI: {
    API_KEY: "AQ.Ab8RN6INYIGyCeFSZAbtX7MsdiavkGf2eQUMMVYjMF6Mq0EVzw",
    MODELE: "gemini-2.0-flash"
  },
  MISTRAL:   { 
    API_KEY: "REMPLACEZ_PAR_VOTRE_CLE_API", 
    MODELE: "mistral-small-latest" }
};
