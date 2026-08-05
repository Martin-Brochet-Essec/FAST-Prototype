// ============================================================
// PAGE 2 — affichage du résultat
// Relit ce que la page 1 a stocké (sessionStorage) et l'affiche.
// ============================================================

const donneesBrutes = sessionStorage.getItem("dernier_resultat");

if (!donneesBrutes) {
  document.getElementById("reponse-ia").textContent =
    "Aucun résultat trouvé. Retournez à la page 1 pour poser une réponse.";
} else {
  const resultat = JSON.parse(donneesBrutes);

  document.getElementById("recap-question").textContent = resultat.question;
  document.getElementById("recap-reponse-utilisateur").textContent = resultat.reponse;
  document.getElementById("reponse-ia").textContent = resultat.reponseIA;
}
