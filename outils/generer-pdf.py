"""
Fabrique le PDF téléchargeable du book : assets/pdf/book-paris-terrasse.pdf

À relancer après chaque modification du book (textes, photos, pages) :
    python outils/generer-pdf.py

Comment ça marche :
  1. Chrome (ou Edge) ouvre index.html sans fenêtre et l'« imprime » en PDF.
     La mise en page vient de assets/css/print.css (une page du book par feuille).
  2. Les photos du PDF sont recompressées en JPEG pour alléger le fichier
     (environ 35 Mo -> 5 Mo). Le texte et les liens (mail, téléphone, site)
     restent cliquables.

Besoin : Google Chrome ou Microsoft Edge, et PyMuPDF (pip install --user pymupdf).
"""

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pymupdf

PROJET = Path(__file__).resolve().parent.parent
PAGE = PROJET / "index.html"
SORTIE = PROJET / "assets" / "pdf" / "book-paris-terrasse.pdf"

# Qualité des photos (0-100) : 80 est net à l'écran pour un fichier léger
QUALITE_JPEG = 80

NAVIGATEURS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "google-chrome",
    "chromium",
]


def trouver_navigateur():
    for chemin in NAVIGATEURS:
        if Path(chemin).exists() or shutil.which(chemin):
            return chemin
    sys.exit("Chrome ou Edge introuvable : installez l'un des deux.")


def imprimer(navigateur, destination):
    subprocess.run(
        [
            navigateur,
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            # Laisse le temps au moteur de pages et aux images de se charger
            "--virtual-time-budget=10000",
            f"--print-to-pdf={destination}",
            PAGE.as_uri(),
        ],
        check=True,
        capture_output=True,
    )


def compresser(source, destination):
    """
    Chrome enregistre les photos sans perte (très lourd). On réencode chaque
    grande photo en JPEG, directement à sa place dans le fichier : le reste
    (textes, liens, fonds) n'est pas touché.
    (doc.rewrite_images de PyMuPDF est évité : il casse les fonds de Chrome.)
    """
    doc = pymupdf.open(source)
    # Masques de transparence (bords fondus des images WebP) : à laisser intacts,
    # sinon ils sont convertis en couleur et l'image s'affiche rayée.
    masques = set()
    for xref in range(1, doc.xref_length()):
        kind, value = doc.xref_get_key(xref, "SMask")
        if kind == "xref":
            masques.add(int(value.split()[0]))

    for xref in range(1, doc.xref_length()):
        if doc.xref_get_key(xref, "Subtype")[1] != "/Image":
            continue
        if xref in masques:
            # Masque : compressé en JPEG, mais en niveaux de gris (jamais en couleur)
            masque = pymupdf.Pixmap(doc, xref)
            if masque.n != 1 or masque.width * masque.height < 40000:
                continue
            jpeg = masque.tobytes("jpeg", jpg_quality=QUALITE_JPEG)
            if len(jpeg) < len(doc.xref_stream_raw(xref)):
                doc.update_stream(xref, jpeg, compress=False)
                doc.xref_set_key(xref, "Filter", "/DCTDecode")
                doc.xref_set_key(xref, "DecodeParms", "null")
                doc.xref_set_key(xref, "ColorSpace", "/DeviceGray")
                doc.xref_set_key(xref, "BitsPerComponent", "8")
            continue
        if doc.xref_get_key(xref, "Filter")[1] == "/DCTDecode":  # déjà en JPEG
            continue
        if doc.xref_get_key(xref, "ImageMask")[1] == "true":
            continue

        image = pymupdf.Pixmap(doc, xref)
        if image.width * image.height < 40000:  # petites images : inutile
            continue
        if image.alpha:
            image = pymupdf.Pixmap(image, 0)
        if image.colorspace is None or image.colorspace.n != 3:
            image = pymupdf.Pixmap(pymupdf.csRGB, image)

        jpeg = image.tobytes("jpeg", jpg_quality=QUALITE_JPEG)
        if len(jpeg) >= len(doc.xref_stream_raw(xref)):
            continue

        doc.update_stream(xref, jpeg, compress=False)
        doc.xref_set_key(xref, "Filter", "/DCTDecode")
        doc.xref_set_key(xref, "DecodeParms", "null")
        doc.xref_set_key(xref, "ColorSpace", "/DeviceRGB")
        doc.xref_set_key(xref, "BitsPerComponent", "8")

    doc.save(destination, garbage=3, deflate=True)
    return doc.page_count


def main():
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as dossier:
        brut = Path(dossier) / "brut.pdf"
        print("Impression du book en PDF...")
        imprimer(trouver_navigateur(), brut)
        print("Compression des photos...")
        pages = compresser(brut, SORTIE)

    taille = os.path.getsize(SORTIE) / 1024 / 1024
    print(f"OK : {SORTIE.relative_to(PROJET)} ({pages} pages, {taille:.1f} Mo)")


if __name__ == "__main__":
    main()
