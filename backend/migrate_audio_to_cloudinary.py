"""
Script de migración: audios en base64 (dentro de Mongo) -> Cloudinary.

QUÉ HACE:
  Recorre los libros de la colección `books` que todavía tengan algún
  campo de audio en base64 (legacy: audio_es_ES_Neural2_*, hook_audio),
  sube cada audio a Cloudinary, y guarda la URL resultante en el campo
  nuevo correspondiente (audio_url_..., hook_audio_url) -- EXACTAMENTE
  igual que ya hace el backend para audios generados de nuevo.

SEGURIDAD / DISEÑO:
  - Por defecto NO BORRA el campo base64 viejo, solo añade el nuevo
    campo _url. Así, si algo sale mal, el audio original sigue intacto
    en Mongo y no se pierde nada.
  - Hay un --limit para probar primero con pocos libros (recomendado:
    5-10) antes de lanzarlo sobre todo el catálogo.
  - Si un libro YA tiene el campo _url (ya migrado, p.ej. porque alguien
    lo pidió y se generó solo), ese campo se salta sin tocarlo.
  - Usa --unset-old SOLO en una segunda pasada, una vez confirmado en la
    app que los audios migrados suenan bien -- eso sí borra los campos
    base64 viejos de Mongo (libera el espacio de verdad).

CÓMO EJECUTARLO (desde la consola de Railway del servicio backend, que
ya tiene las variables de entorno MONGO_URL, DB_NAME, CLOUDINARY_*):

  Prueba con 5 libros primero (no borra nada, solo añade los nuevos):
    python migrate_audio_to_cloudinary.py --limit 5

  Si en la app suenan bien, lanza el resto (sin límite = todos):
    python migrate_audio_to_cloudinary.py

  Pasada de limpieza (solo cuando estés segura de que todo migró bien):
    python migrate_audio_to_cloudinary.py --unset-old
"""

import os
import base64
import argparse
from pymongo import MongoClient
import cloudinary
import cloudinary.uploader

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

cloudinary.config(
    cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
    api_key=os.environ["CLOUDINARY_API_KEY"],
    api_secret=os.environ["CLOUDINARY_API_SECRET"],
)

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

FIELD_MAP = {
    "audio_es_ES_Neural2_C_es": "audio_url_es_ES_Neural2_C_es",
    "audio_es_ES_Neural2_C_en": "audio_url_es_ES_Neural2_C_en",
    "audio_es_ES_Neural2_B_es": "audio_url_es_ES_Neural2_B_es",
    "audio_es_ES_Neural2_B_en": "audio_url_es_ES_Neural2_B_en",
    "hook_audio": "hook_audio_url",
}

def upload_audio(audio_b64, public_id):
    audio_bytes = base64.b64decode(audio_b64)
    result = cloudinary.uploader.upload(
        audio_bytes,
        resource_type="video",
        public_id=public_id,
        folder="clickbook_audio",
        overwrite=True,
    )
    return result["secure_url"]

def migrate(limit, unset_old):
    old_fields = list(FIELD_MAP.keys())
    query = {"$or": [{f: {"$exists": True, "$ne": None}} for f in old_fields]}
    projection = {"_id": 0, "book_id": 1, **{f: 1 for f in old_fields}, **{u: 1 for u in FIELD_MAP.values()}}

    cursor = db.books.find(query, projection)
    if limit:
        cursor = cursor.limit(limit)

    total_books = 0
    total_uploaded = 0
    total_skipped = 0
    total_errors = 0

    for book in cursor:
        book_id = book["book_id"]
        total_books += 1
        print(f"\n--- Libro {book_id} ---")

        for old_field, url_field in FIELD_MAP.items():
            old_value = book.get(old_field)
            if not old_value:
                continue

            if book.get(url_field):
                print(f"  [{old_field}] ya migrado, se salta.")
                total_skipped += 1
                if unset_old:
                    db.books.update_one({"book_id": book_id}, {"$unset": {old_field: ""}})
                continue

            try:
                print(f"  [{old_field}] subiendo a Cloudinary...")
                audio_url = upload_audio(old_value, public_id=f"{book_id}_{url_field}")
                update = {"$set": {url_field: audio_url}}
                if unset_old:
                    update["$unset"] = {old_field: ""}
                db.books.update_one({"book_id": book_id}, update)
                print(f"  [{old_field}] OK -> {audio_url}")
                total_uploaded += 1
            except Exception as e:
                print(f"  [{old_field}] ERROR: {e}")
                total_errors += 1

    print("\n========== RESUMEN ==========")
    print(f"Libros procesados:           {total_books}")
    print(f"Audios subidos a Cloudinary: {total_uploaded}")
    print(f"Ya estaban migrados:         {total_skipped}")
    print(f"Errores:                     {total_errors}")
    print("==============================")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--unset-old", action="store_true")
    args = parser.parse_args()

    if args.unset_old:
        print("MODO --unset-old: borrara los campos base64 antiguos de Mongo.")
    if args.limit:
        print(f"Modo prueba: procesando {args.limit} libro(s).")
    else:
        print("Procesando TODOS los libros pendientes.")

    migrate(args.limit, args.unset_old)