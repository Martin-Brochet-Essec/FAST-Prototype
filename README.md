# FAST — Prototype (site multi-pages)

## Comment l'ouvrir
Le plus fiable : servez ce dossier avec un petit serveur local, puis ouvrez http://localhost:8000
    python3 -m http.server 8000

Vous pouvez aussi double-cliquer sur `index.html` directement : le site fonctionne
quand même grâce à un mécanisme de secours (voir plus bas), mais certains navigateurs
(Chrome, Edge) bloquent la lecture des fichiers XML en local — Firefox est plus tolérant.

## Architecture
- Un fichier .html par écran (19 pages), tous stylés via `assets/style.css`.
- `assets/i18n/{fr,en,es,ro}.xml` : tous les textes de l'app, un fichier par langue.
- `assets/questions.xml` : les questions posées (profiling, clarifications, etc.),
  éditable indépendamment du code — c'est le fichier à modifier si une IA doit un jour
  regénérer ou ajuster les questions.
- `assets/app.js` : logique commune (chargement des traductions/questions, profil,
  export des réponses, navigation du menu).
- `assets/fallback.js` : copie miroir du contenu des XML, générée automatiquement,
  utilisée uniquement si la lecture des XML échoue (voir limite ci-dessous).

## Limites techniques assumées (à connaître avant de présenter ça à un développeur)
1. **Un navigateur ne peut pas écrire de fichier sur le disque tout seul.** La demande
   « stocker les réponses dans un fichier texte nommé avec la date/heure/nom » est donc
   implémentée comme un **téléchargement réel** : le bouton "Télécharger mes réponses"
   (écran Engagement) génère un fichier `.txt` nommé `FAST_reponses_{prenom}_{date}_{heure}.txt`
   et déclenche son téléchargement. C'est la version la plus proche de la demande qu'un
   simple site HTML peut faire sans serveur ni base de données.
2. **Un navigateur ne peut pas non plus lire un fichier XML voisin sans serveur**
   (restriction CORS sur `file://`). Le site essaie d'abord de lire les vrais fichiers
   XML (ça marche si vous servez le dossier), et si ça échoue, bascule sur
   `assets/fallback.js`, une copie du même contenu générée automatiquement — le
   prototype reste donc utilisable même ouvert directement, mais la vraie source à
   éditer reste les fichiers XML.
3. **Le profil, la configuration et les réponses sont stockés dans le navigateur**
   (localStorage), pas dans un vrai fichier XML ni une base de données — même limite
   que ci-dessus. C'est suffisant pour un prototype testé sur un poste, mais ne
   persiste pas entre appareils et sera à remplacer par un vrai backend.
4. **Aucune IA n'est réellement connectée.** Les résumés, les 5 questions de
   clarification, etc. sont des contenus fixes écrits pour la démo — l'endroit exact où
   brancher un appel à l'API Claude est le fichier `assets/app.js` (fonction
   `runStepper` et écran `q5.html` / `deepen-question.html`).

## Pages
index (Accueil) · describe-process · q10 · q5 (clarifications + résumé) · your-question ·
deepen-question (3 clarifications IA) · email-sent · email-backup · engagement ·
finalize-account · new-question (mode urgence) · coaching-hub · diagnostic · coaching-plan ·
marketplace · articles · profile · who-am-i · config · subscription
