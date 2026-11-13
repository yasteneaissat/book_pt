/*
  Le livre : tourner les pages, sommaire, son, plein écran, mode sombre.

  Les pages tournent avec la bibliothèque StPageFlip (page-flip, sans dépendance) :
  pliage souple en diagonale et page qui suit la souris / le doigt depuis les coins.

  - Sur ordinateur, on avance d'une double page à la fois (orientation "landscape").
  - Sur téléphone, on avance d'une page à la fois (orientation "portrait").

  Dans index.html, le livre est une simple liste de <section class="page">.
  StPageFlip les déplace dans ses propres conteneurs (.stf__wrapper > .stf__block)
  et leur ajoute les classes .stf__item, .--left / .--right, .--soft / .--hard.
  Pour ajouter des pages, ajouter des <section> (toujours un nombre pair).
*/

// Même condition que dans book.css
const DESKTOP = window.matchMedia('(min-width: 900px) and (min-height: 560px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

// Durée d'une page qui tourne (ms) : garder la même valeur que --turn-time dans book.css
const FLIP_TIME = 800;
// Coin depuis lequel les boutons / le clavier font tourner la page ('top' ou 'bottom')
const FLIP_CORNER = 'bottom';
// Copie locale de la bibliothèque, utilisée si le CDN ne répond pas
const PAGE_FLIP_LOCAL = 'assets/js/vendor/page-flip.browser.js';

const book = document.getElementById('book');
const bookWrapper = document.querySelector('.book-wrapper');
const pages = [...book.querySelectorAll('.page')];
const lastPage = pages.length - 1;

const pageLabel = document.getElementById('page-label');
const dots = document.getElementById('dots');
const summary = document.getElementById('summary');
const summaryList = document.getElementById('summary-list');
const overlay = document.querySelector('.overlay');

let pageFlip = null;   // le moteur StPageFlip (créé au démarrage)
let currentPage = 0;   // page affichée (sur ordinateur : page de gauche de la double page)
let soundOn = true;
let edgeSettleTimer = 0;


/* ---------- Petits calculs ---------- */

// Ajoute un zéro devant : 3 -> "03"
function twoDigits(number) {
  return String(number).padStart(2, '0');
}

// Double page qui contient une page donnée.
// 0 = couverture, 1 = pages 1-2, 2 = pages 3-4... dernière = 4e de couverture
// (même découpage que StPageFlip avec l'option showCover)
function spreadOf(page) {
  return Math.ceil(page / 2);
}

// Numéro de la dernière double page (la 4e de couverture)
const lastSpread = spreadOf(lastPage);

// Page de gauche d'une double page
function firstPageOf(spread) {
  if (spread >= lastSpread) return lastPage;
  return Math.max(0, spread * 2 - 1);
}

function isEdgeSpread(page) {
  const spread = spreadOf(page);
  return spread === 0 || spread === lastSpread;
}

function spreadName(spread) {
  if (spread === 0) return 'Couverture';
  if (spread === lastSpread) return '4e de couverture';
  return 'Pages ' + twoDigits(spread * 2 - 1) + ' — ' + twoDigits(spread * 2);
}

function pageName(page) {
  if (page === 0) return 'Couverture';
  if (page === lastPage) return '4e de couverture';
  return 'Page ' + twoDigits(page) + ' / ' + twoDigits(lastPage - 1);
}


/* ---------- Affichage (barre du bas, points, sommaire, flèches, adresse) ---------- */

// Livre fermé (ordinateur) : il glisse pour rester centré, et les grandes flèches le suivent
function setClosedLook(page) {
  const spread = DESKTOP.matches ? spreadOf(page) : -1;
  [book, bookWrapper].forEach(element => {
    element.classList.toggle('is-closed-front', spread === 0);
    element.classList.toggle('is-closed-back', spread === lastSpread);
  });
}

function updateInterface() {
  const spread = spreadOf(currentPage);

  pageLabel.textContent = DESKTOP.matches ? spreadName(spread) : pageName(currentPage);
  setClosedLook(currentPage);

  // Point et lien du sommaire de la double page en cours
  [...dots.children, ...summaryList.children].forEach(item => {
    if (Number(item.dataset.goto) === firstPageOf(spread)) {
      item.setAttribute('aria-current', 'true');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  // Boutons "précédent" / "suivant" (barre du bas et grandes flèches)
  document.querySelectorAll('[data-action="prev"]').forEach(button => {
    button.disabled = currentPage === 0;
  });
  document.querySelectorAll('[data-action="next"]').forEach(button => {
    button.disabled = currentPage === lastPage;
  });

  // Adresse partageable : index.html#page-5
  // (pas avant le démarrage du moteur : il doit d'abord lire la page demandée)
  if (!pageFlip) return;
  try {
    history.replaceState(null, '', currentPage === 0 ? location.pathname + location.search : '#page-' + currentPage);
  } catch (error) {
    // Certains navigateurs l'interdisent en local : sans importance
  }
}


/* ---------- Tourner les pages ---------- */

// État du moteur : 'read' (au repos), 'fold_corner' (coin soulevé au survol),
// 'user_fold' (page tenue à la souris / au doigt), 'flipping' (page en train de tourner)
function flipState() {
  return pageFlip ? pageFlip.getState() : 'read';
}

// Si une page est encore en train de tourner, on termine son mouvement tout de suite
// (permet d'enchaîner les clics rapides sans perdre le compte des pages)
function finishTurn() {
  if (flipState() === 'flipping') pageFlip.getRender().finishAnimation();
}

function goToPage(page) {
  // Pas de moteur, ou le lecteur tient une page en main : on ne la lui arrache pas
  if (!pageFlip || flipState() === 'user_fold') return;
  finishTurn();

  page = Math.max(0, Math.min(lastPage, page));
  // Sur ordinateur, on vise la page de gauche de la double page
  const target = DESKTOP.matches ? firstPageOf(spreadOf(page)) : page;
  if (target === currentPage) return;

  // Aux couvertures, on laisse d'abord tourner la feuille seule.
  const edgeTurn = DESKTOP.matches && (isEdgeSpread(currentPage) || isEdgeSpread(target));
  if (!edgeTurn) setClosedLook(target);

  // Une seule page tourne, même pour un saut lointain (comme sur Issuu)
  pageFlip.flip(target, FLIP_CORNER);

  // Si le moteur a refusé de tourner, on remet le livre comme il était
  if (flipState() === 'read') setClosedLook(currentPage);
}

// step = +1 (suivant) ou -1 (précédent)
function turn(step) {
  if (!pageFlip || flipState() === 'user_fold') return;
  finishTurn();

  if (DESKTOP.matches) {
    goToPage(firstPageOf(spreadOf(currentPage) + step));
  } else {
    goToPage(currentPage + step);
  }
}

function nextPage() {
  turn(1);
}

function previousPage() {
  turn(-1);
}


/* ---------- Points et sommaire ---------- */

function buildNavigation() {
  for (let spread = 0; spread <= lastSpread; spread++) {
    const name = spreadName(spread);
    const target = firstPageOf(spread);

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dot';
    dot.dataset.goto = target;
    dot.title = name;
    dot.setAttribute('aria-label', name);
    dots.append(dot);

    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'summary__link';
    link.dataset.goto = target;
    link.textContent = name.replace('Pages ', 'P. ');
    summaryList.append(link);
  }
}

function openSummary(open) {
  summary.classList.toggle('is-open', open);
  overlay.classList.toggle('is-visible', open);

  document.querySelectorAll('[data-action="summary"]').forEach(button => {
    button.setAttribute('aria-expanded', open);
  });

  if (open) summaryList.querySelector('button').focus();
}


/* ---------- Son de page ---------- */

let audio = null;

function playPageSound() {
  if (!soundOn) return;

  audio = audio || new Audio('assets/audio/page-turn.mp3');
  audio.volume = 0.25;
  audio.currentTime = 0;
  audio.play().catch(error => {
    console.warn('Le son de page n’a pas pu être lu.', error);
  });
}

function toggleSound(button) {
  soundOn = !soundOn;
  button.setAttribute('aria-pressed', soundOn);
  button.querySelector('use').setAttribute('href', soundOn ? '#icon-volume' : '#icon-volume-off');
  showMessage(soundOn ? 'Son activé' : 'Son désactivé');
}


/* ---------- Plein écran ---------- */

// La classe "is-fullscreen" masque l'en-tête et agrandit le livre.
// Sur les navigateurs qui le permettent, on passe aussi en vrai plein écran.
// (Le livre change de taille : StPageFlip est recalé par le ResizeObserver plus bas.)
function toggleFullscreen() {
  const enable = !document.documentElement.classList.contains('is-fullscreen');

  if (enable && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  if (!enable && document.fullscreenElement) {
    document.exitFullscreen();
  }

  setFullscreenLook(enable);
}

function setFullscreenLook(enable) {
  document.documentElement.classList.toggle('is-fullscreen', enable);

  const button = document.querySelector('[data-action="fullscreen"]');
  button.setAttribute('aria-pressed', enable);
  button.querySelector('use').setAttribute('href', enable ? '#icon-shrink' : '#icon-expand');
}

// Si on quitte le plein écran avec la touche Échap, on remet l'affichage normal
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) setFullscreenLook(false);
});


/* ---------- Mode sombre ---------- */

function toggleTheme() {
  const html = document.documentElement;
  const newTheme = html.dataset.theme === 'dark' ? 'light' : 'dark';

  html.dataset.theme = newTheme;
  try {
    localStorage.setItem('theme', newTheme);
  } catch (error) {
    // Pas de mémoire disponible : le choix vaut pour cette visite
  }

  showMessage(newTheme === 'dark' ? 'Mode sombre' : 'Mode clair');
}


/* ---------- Bulle d'aide "comment tourner les pages" ---------- */
// Affichée à la première visite. Elle disparaît dès que le lecteur touche le livre,
// tourne une page ou appuie sur une flèche, et ne revient plus ensuite.
// (Si elle s'efface seule sans avoir servi, elle reviendra à la prochaine visite.)

const tip = document.getElementById('book-tip');
const TIP_SEEN = 'book-tip-seen';
let tipTimer = 0;

function showTip() {
  try {
    if (localStorage.getItem(TIP_SEEN)) return;
  } catch (error) {
    // Pas de mémoire disponible : on montre la bulle
  }

  tip.hidden = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => tip.classList.add('is-visible'));
  });

  bookWrapper.addEventListener('pointerdown', tipUsed, { once: true });
  document.addEventListener('keydown', tipUsedByKey);
  tipTimer = setTimeout(hideTip, 9000);
}

function tipUsedByKey(event) {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) tipUsed();
}

function tipUsed() {
  try {
    localStorage.setItem(TIP_SEEN, 'true');
  } catch (error) {
    // Pas de mémoire disponible : sans importance
  }
  hideTip();
}

function hideTip() {
  clearTimeout(tipTimer);
  bookWrapper.removeEventListener('pointerdown', tipUsed);
  document.removeEventListener('keydown', tipUsedByKey);
  if (tip.hidden || !tip.classList.contains('is-visible')) {
    tip.hidden = true;
    return;
  }
  tip.classList.remove('is-visible');
  // Fin du fondu, puis on la retire de l'affichage (l'animation de la main s'arrête)
  setTimeout(() => {
    tip.hidden = true;
  }, 400);
}


/* ---------- Message en bas de l'écran ---------- */

let messageTimer = null;

function showMessage(text) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-text').textContent = text;
  toast.classList.add('is-visible');

  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
}


/* ---------- Clics ---------- */
// (Les clics et glissés SUR les pages sont gérés par StPageFlip.)

document.addEventListener('click', event => {
  // Liens vers une page (points, sommaire, "Début")
  const link = event.target.closest('[data-goto]');
  if (link) {
    goToPage(Number(link.dataset.goto));
    openSummary(false);
    return;
  }

  // Boutons d'action
  const button = event.target.closest('[data-action]');
  if (button) {
    const action = button.dataset.action;
    if (action === 'next') nextPage();
    if (action === 'prev') previousPage();
    if (action === 'summary') openSummary(!summary.classList.contains('is-open'));
    if (action === 'close-summary') openSummary(false);
    if (action === 'sound') toggleSound(button);
    if (action === 'theme') toggleTheme();
    if (action === 'fullscreen') toggleFullscreen();
  }
});

/* StPageFlip n'ignore un clic que si l'élément touché est lui-même un <a> ou un <button>.
   Un clic sur l'icône SVG du bouton "Début" ou sur le texte d'un lien ferait donc
   aussi tourner la page. On arrête ces événements avant qu'ils n'atteignent le moteur :
   le "click" normal du bouton / lien, lui, fonctionne toujours. */
['mousedown', 'touchstart'].forEach(type => {
  book.addEventListener(type, event => {
    if (event.target.closest('a, button')) event.stopPropagation();
  }, { capture: true, passive: true });
});


/* ---------- Clavier ---------- */

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  if (event.key === 'Escape') openSummary(false);
  if (event.key === 'ArrowRight') nextPage();
  if (event.key === 'ArrowLeft') previousPage();
  if (event.key === 'Home') goToPage(0);
  if (event.key === 'End') goToPage(lastPage);
});


/* ---------- Pages prêtes avant d'être tournées ---------- */

/*
  La première fois qu'une page s'affiche, le navigateur doit la préparer (polices,
  textes, photos) : jusqu'à 1/4 de seconde sur un appareil moyen. Comme StPageFlip
  n'affiche une page qu'au moment où elle tourne, ce travail tombait pendant
  l'animation et la page de droite semblait "se recharger" (2e passage : fluide).

  Solution : pendant que le lecteur regarde une page, on prépare les suivantes en
  arrière-plan, une par une, avec une copie invisible de chaque page.
  (Garder les vraies pages affichées mais cachées a été testé : 2 à 3 fois plus
  lent, car le moteur réécrit le style de chaque page à chaque image.)
*/

const warmUpQueue = [];
let warmUpBox = null;
let warmUpScheduled = false;

// Ordre de préparation : d'abord les pages qui suivent la page en cours, puis les précédentes
function queueWarmUp(fromPage) {
  warmUpQueue.length = 0;
  for (let index = fromPage + 1; index <= lastPage; index++) warmUpQueue.push(index);
  for (let index = fromPage - 1; index >= 0; index--) warmUpQueue.push(index);
  scheduleWarmUp();
}

function scheduleWarmUp() {
  if (warmUpScheduled) return;
  warmUpScheduled = true;
  const later = window.requestIdleCallback || (callback => setTimeout(callback, 200));
  later(warmUpNextPage, { timeout: 1500 });
}

function warmUpNextPage() {
  warmUpScheduled = false;

  // Une page est en train de tourner : on attend qu'elle soit posée
  if (flipState() !== 'read') {
    scheduleWarmUp();
    return;
  }

  let index;
  do {
    index = warmUpQueue.shift();
  } while (index !== undefined && pages[index].dataset.warm);
  if (index === undefined) return;
  pages[index].dataset.warm = 'true';

  // Boîte invisible, à la taille d'une page, derrière tout le reste
  if (!warmUpBox) {
    warmUpBox = document.createElement('div');
    warmUpBox.className = 'warm-up'; // masquée à l'impression (print.css)
    warmUpBox.setAttribute('aria-hidden', 'true');
    warmUpBox.inert = true;
    warmUpBox.style.cssText = 'position: fixed; left: 0; top: 0; z-index: -1; overflow: hidden; opacity: .001; pointer-events: none; contain: strict;';
    document.body.append(warmUpBox);
  }
  const rect = pageFlip.getRender().getRect();
  warmUpBox.style.width = rect.pageWidth + 'px';
  warmUpBox.style.height = rect.height + 'px';

  const copy = pages[index].cloneNode(true);
  copy.removeAttribute('aria-label');
  copy.style.cssText = `display: block; position: absolute; left: 0; top: 0; width: ${rect.pageWidth}px; height: ${rect.height}px;`;
  warmUpBox.append(copy);
  copy.querySelectorAll('img').forEach(image => {
    if (image.decode) image.decode().catch(() => {});
  });

  // On laisse le navigateur la dessiner une fois, puis on la retire et on passe à la suivante
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      copy.remove();
      scheduleWarmUp();
    });
  });
}


/* ---------- Taille et orientation du livre ---------- */

let layoutPending = false;

// Recale StPageFlip sur la taille actuelle de .book (fixée par book.css)
// et choisit simple page (téléphone) ou double page (ordinateur).
function refreshLayout() {
  if (!pageFlip) return;

  // usePortrait = false : toujours en double page.
  // usePortrait = true + minWidth très grand (voir réglages) : toujours en simple page.
  pageFlip.getSettings().usePortrait = !DESKTOP.matches;

  // Le lecteur tient une page : on attendra qu'il la lâche
  if (flipState() === 'user_fold') {
    layoutPending = true;
    return;
  }

  finishTurn();
  pageFlip.update();
  currentPage = pageFlip.getCurrentPageIndex();
  updateInterface();
}


/* ---------- Démarrage de StPageFlip ---------- */

// Le CDN est chargé dans index.html. S'il ne répond pas, on charge la copie locale.
function loadPageFlip() {
  return new Promise((resolve, reject) => {
    if (window.St && window.St.PageFlip) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = PAGE_FLIP_LOCAL;
    script.onload = () => (window.St && window.St.PageFlip ? resolve() : reject());
    script.onerror = reject;
    document.head.append(script);
  });
}

function startBook() {
  // Ouvre directement la bonne page si l'adresse contient #page-5 (sans animation).
  // Sur ordinateur, la double page qui la contient s'affiche (l'adresse devient
  // celle de sa page de gauche, ex. #page-4 -> #page-3).
  const pageInAddress = location.hash.match(/^#page-(\d+)$/);
  const startPage = pageInAddress ? Math.min(lastPage, Number(pageInAddress[1])) : 0;

  // Pendant l'installation, le livre et les flèches se placent sans glisser
  bookWrapper.classList.add('no-animation');

  pageFlip = new St.PageFlip(book, {
    // Proportions d'UNE page (3/4). La taille réelle vient de .book dans book.css.
    width: 600,
    height: 800,
    size: 'stretch',
    autoSize: false,          // on garde le dimensionnement de book.css

    // Seuil simple / double page. En simple page, usePortrait = true et la largeur du
    // livre est toujours < 2 x minWidth : le moteur reste en portrait. En double page,
    // usePortrait = false. C'est donc DESKTOP (media query) qui décide, comme avant.
    minWidth: 1000,
    maxWidth: 3000,
    minHeight: 100,
    maxHeight: 4000,
    usePortrait: !DESKTOP.matches,

    // Couverture et 4e de couverture affichées seules (livre fermé).
    // Toutes les pages restent souples : voir setDensity('soft') plus bas.
    showCover: true,

    // Rendu "Issuu"
    drawShadow: false,
    showPageCorners: false,
    flippingTime: REDUCED_MOTION.matches ? FLIP_TIME / 2 : FLIP_TIME,

    // Gestes
    useMouseEvents: true,     // attraper la page à la souris / au doigt
    disableFlipByClick: false, // un clic sur une page la fait tourner
    clickEventForward: true,  // les liens et boutons dans les pages restent cliquables
    mobileScrollSupport: true, // le défilement vertical de la page reste possible sur téléphone
    swipeDistance: 30,

    startPage,
  });

  /* --- Événements du moteur, reliés au reste de l'interface --- */

  // Le son ne doit être joué qu'une fois par page tournée
  let soundPlayed = false;

  // Une page commence à tourner (bouton, clavier, clic, glissé rapide)
  pageFlip.on('changeState', event => {
    const state = event.data;

    if (state === 'flipping' && !soundPlayed) {
      soundPlayed = true;
      playPageSound();
    }

    // Curseur "main fermée" pendant qu'on tient une page
    book.classList.toggle('is-dragging', state === 'user_fold');

    if (state === 'read') {
      soundPlayed = false;
      // Le moteur enregistre son nouvel état juste après cet événement
      if (layoutPending) {
        layoutPending = false;
        setTimeout(refreshLayout);
      }
    }
  });

  // Nouvelle page affichée (à la fin d'un tour de page, ou après un redimensionnement)
  pageFlip.on('flip', event => {
    const page = Number(event.data);
    if (page === currentPage) return; // simple redessin : rien n'a changé

    const edgeTurn = DESKTOP.matches && (isEdgeSpread(currentPage) || isEdgeSpread(page));
    if (edgeTurn) {
      clearTimeout(edgeSettleTimer);
      bookWrapper.classList.add('is-edge-settling');
    }

    // Page lâchée au doigt / à la souris : le son n'a pas encore été joué
    const turnedByReader = flipState() !== 'read';
    // Une page a tourné (livre, boutons, sommaire...) : la bulle d'aide a servi
    if (!tip.hidden) tipUsed();
    currentPage = page;
    if (turnedByReader && !soundPlayed) {
      soundPlayed = true;
      playPageSound();
    }

    updateInterface();
    queueWarmUp(page);

    if (edgeTurn) {
      edgeSettleTimer = setTimeout(() => {
        bookWrapper.classList.remove('is-edge-settling');
      }, 350);
    }
  });

  pageFlip.loadFromHTML(pages);

  // showCover rend la couverture et la 4e de couverture rigides ("hard").
  // Ce mode tourne en 3D avec perspective : la page gonfle et déborde sur le titre
  // et la barre du bas, et son ombre sort du livre. On les repasse en souple
  // (pliage en diagonale, comme sur Issuu) tout en gardant la couverture seule.
  pageFlip.getPageCollection().getPages().forEach(page => page.setDensity('soft'));

  // StPageFlip impose une largeur minimale (minWidth) au livre : on la retire
  // pour garder les tailles de book.css, puis on recale le moteur.
  book.style.minWidth = '';
  book.style.minHeight = '';
  pageFlip.update();

  currentPage = pageFlip.getCurrentPageIndex();
  updateInterface();
  pages[currentPage].dataset.warm = 'true';
  queueWarmUp(currentPage);

  // Bulle d'aide, une fois le livre posé
  setTimeout(showTip, 700);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => bookWrapper.classList.remove('no-animation'));
  });

  // Passage ordinateur <-> téléphone (fenêtre redimensionnée, rotation)
  DESKTOP.addEventListener('change', refreshLayout);

  // Le livre change de taille (fenêtre, plein écran, polices chargées...)
  let resizeFrame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(refreshLayout);
  }).observe(book);
}


/* ---------- Démarrage ---------- */

buildNavigation();
updateInterface();

loadPageFlip()
  .then(startBook)
  .catch(() => {
    // Sans moteur, la couverture reste affichée (voir book.css)
    showMessage('Le book n\'a pas pu être chargé. Rechargez la page.');
  });
