/*
  Choisit le thème (clair ou sombre) avant l'affichage de la page,
  pour éviter un flash blanc. Chargé dans le <head>.

  Ordre de priorité :
  1. le choix fait avec le bouton lune/soleil (mémorisé)
  2. sinon, le réglage de l'ordinateur ou du téléphone
*/

(function () {
  let savedTheme = null;

  try {
    savedTheme = localStorage.getItem('theme');
  } catch (error) {
    // Navigation privée : pas de mémoire, ce n'est pas grave
  }

  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

  document.documentElement.setAttribute('data-theme', theme);
})();
