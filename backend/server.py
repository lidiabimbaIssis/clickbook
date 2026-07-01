import os
import json
import uuid
import base64
import logging
import asyncio
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Set

import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Cookie, Header
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAITextToSpeech

import cloudinary
import cloudinary.uploader

# ----------------- Setup -----------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
GOOGLE_TTS_API_KEY = os.environ.get("GOOGLE_TTS_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

AFFILIATE_AMAZON_TAG = os.environ.get("AFFILIATE_AMAZON_TAG", "")
AFFILIATE_CASA_LIBRO = os.environ.get("AFFILIATE_CASA_LIBRO", "")

FREE_DAILY_AUDIO_LIMIT = int(os.environ.get("FREE_DAILY_AUDIO_LIMIT", "3"))
PRICING = {
    "monthly_regular": "4,99€/mes",
    "monthly_launch":  "2,99€/mes",
    "yearly_regular":  "29,99€/año",
    "yearly_launch":   "19,99€/año",
    "launch_promo_active": True,
    "launch_promo_label":  "🔥 OFERTA DE LANZAMIENTO",
    "free_daily_audio_limit": FREE_DAILY_AUDIO_LIMIT,
}

# Cloudinary: usado para almacenar audios (resúmenes y hooks) fuera de
# Mongo, ya que guardarlos en base64 dentro de cada documento de libro
# era la causa principal de la lentitud de Mongo Atlas (tier M0).
cloudinary.config(
    cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
    api_key=os.environ["CLOUDINARY_API_KEY"],
    api_secret=os.environ["CLOUDINARY_API_SECRET"],
)

async def upload_audio_to_cloudinary(audio_b64: str, public_id: str) -> str:
    """Sube un audio (en base64) a Cloudinary y devuelve su URL pública.
    Cloudinary trata el audio como resource_type='video'. Se ejecuta en un
    thread aparte porque el SDK de cloudinary no es async."""
    audio_bytes = base64.b64decode(audio_b64)
    result = await asyncio.to_thread(
        cloudinary.uploader.upload,
        audio_bytes,
        resource_type="video",
        public_id=public_id,
        folder="clickbook_audio",
        overwrite=True,
    )
    return result["secure_url"]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("steampunk-books")

# ----------------- Models -----------------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    lang: str = "es"
    is_premium: bool = False
    premium_until: Optional[datetime] = None
    created_at: datetime

class Book(BaseModel):
    book_id: str
    title: str
    author: str
    year: int
    genre: str
    pages: int
    rating: float
    synopsis_es: Optional[str] = ""
    synopsis_en: Optional[str] = ""
    summary_es: Optional[str] = ""
    summary_en: Optional[str] = ""
    cover_url: Optional[str] = ""
    amazon_url: Optional[str] = ""
    casa_del_libro_url: Optional[str] = ""
    google_books_url: Optional[str] = ""
    created_at: Optional[datetime] = None

class SessionExchangeRequest(BaseModel):
    session_id: str

class FavoriteCreate(BaseModel):
    book_id: str

class TTSRequest(BaseModel):
    text: str
    voice: str = "fable"
    book_id: Optional[str] = None
    lang: Optional[str] = "es"

class LangUpdate(BaseModel):
    lang: str

# ----------------- Auth helpers -----------------
async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None),
) -> User:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif session_token:
        token = session_token

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session_doc = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session_doc.get("expires_at")
    if expires_at and expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")

    return User(**user_doc)


# ----------------- Auth routes -----------------
@api_router.post("/auth/session")
async def exchange_session(req: SessionExchangeRequest, response: Response):
    async with httpx.AsyncClient(timeout=15.0) as http_client:
        resp = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")

    data = resp.json()
    email = data["email"]
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data["session_token"]

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "lang": "es", "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(dict(user_doc))
        user_doc.pop("_id", None)

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {"user_id": user_id, "session_token": session_token, "expires_at": expires_at, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    response.set_cookie(key="session_token", value=session_token, max_age=7*24*60*60, path="/", httponly=True, secure=True, samesite="none")
    return {"user": User(**user_doc).dict(), "session_token": session_token}


@api_router.get("/auth/me")
async def auth_me(user: User = Depends(get_current_user)):
    return user.dict()


@api_router.post("/auth/guest")
async def guest_login():
    user_id = f"guest_{uuid.uuid4().hex[:12]}"
    session_token = f"guest_{uuid.uuid4().hex}"
    user_doc = {
        "user_id": user_id, "email": f"{user_id}@guest.local", "name": "Invitado",
        "picture": None, "lang": "es", "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(dict(user_doc))
    user_doc.pop("_id", None)
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
        "created_at": datetime.now(timezone.utc),
    })
    return {"user": User(**user_doc).dict(), "session_token": session_token}


@api_router.post("/auth/logout")
async def logout(response: Response, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif session_token:
        token = session_token
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


@api_router.patch("/auth/lang")
async def update_lang(body: LangUpdate, user: User = Depends(get_current_user)):
    if body.lang not in ("es", "en"):
        raise HTTPException(400, "lang must be 'es' or 'en'")
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"lang": body.lang}})
    return {"ok": True, "lang": body.lang}


# ----------------- Premium / Usage -----------------
def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

async def _get_today_audio_count(user_id: str) -> int:
    doc = await db.daily_audio_usage.find_one({"user_id": user_id, "date": _today_key()})
    return int(doc["count"]) if doc else 0

async def _increment_audio_count(user_id: str) -> int:
    res = await db.daily_audio_usage.find_one_and_update(
        {"user_id": user_id, "date": _today_key()},
        {"$inc": {"count": 1}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        upsert=True, return_document=True,
    )
    return int(res.get("count", 1)) if res else 1

# Contador de hooks: misma lógica que el de audio de resúmenes, pero en su
# propia colección para que sea un límite diario totalmente independiente
# (un usuario free puede gastar 3 resúmenes + 3 hooks = 6 audios/día en total).
FREE_DAILY_HOOK_LIMIT = int(os.environ.get("FREE_DAILY_HOOK_LIMIT", "3"))

async def _get_today_hook_count(user_id: str) -> int:
    doc = await db.daily_hook_usage.find_one({"user_id": user_id, "date": _today_key()})
    return int(doc["count"]) if doc else 0

async def _increment_hook_count(user_id: str) -> int:
    res = await db.daily_hook_usage.find_one_and_update(
        {"user_id": user_id, "date": _today_key()},
        {"$inc": {"count": 1}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        upsert=True, return_document=True,
    )
    return int(res.get("count", 1)) if res else 1

def _is_premium_active(user: User) -> bool:
    if not user.is_premium:
        return False
    if user.premium_until and user.premium_until.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        return False
    return True

@api_router.get("/me/usage")
async def get_my_usage(user: User = Depends(get_current_user)):
    plays_today = await _get_today_audio_count(user.user_id)
    is_premium = _is_premium_active(user)
    return {
        "is_premium": is_premium, "plays_today": plays_today, "limit": FREE_DAILY_AUDIO_LIMIT,
        "remaining": max(0, FREE_DAILY_AUDIO_LIMIT - plays_today) if not is_premium else None,
        "premium_until": user.premium_until.isoformat() if user.premium_until else None,
    }

@api_router.get("/me/hook-usage")
async def get_my_hook_usage(user: User = Depends(get_current_user)):
    # Igual que /me/usage pero para el contador de hooks automáticos del
    # botón en discover.tsx — permite pintar el numerito (3, 2, 1) en la
    # portada SIN tener que pedir el audio primero para saberlo.
    plays_today = await _get_today_hook_count(user.user_id)
    is_premium = _is_premium_active(user)
    return {
        "is_premium": is_premium, "plays_today": plays_today, "limit": FREE_DAILY_HOOK_LIMIT,
        "remaining": max(0, FREE_DAILY_HOOK_LIMIT - plays_today) if not is_premium else None,
    }

@api_router.get("/config/pricing")
async def get_pricing():
    return PRICING

@api_router.post("/me/upgrade")
async def upgrade_to_premium(user: User = Depends(get_current_user)):
    until = datetime.now(timezone.utc) + timedelta(days=30)
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"is_premium": True, "premium_until": until}})
    return {"ok": True, "is_premium": True, "premium_until": until.isoformat()}

@api_router.post("/me/downgrade")
async def downgrade_from_premium(user: User = Depends(get_current_user)):
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"is_premium": False, "premium_until": None}})
    return {"ok": True, "is_premium": False}


# ----------------- Book routes -----------------

# Campos "pesados" (audio en base64) que NUNCA deben viajar en listados de
# varios libros (feed, search, favorites). Solo se piden cuando se consulta
# UN libro en concreto (get_book, premium_summary, tts).
# Nota: resumen_audio NO se excluye porque es solo TEXTO (el guion del audio),
# no el audio en sí, y se muestra siempre a todo el mundo, sea o no premium.
# Se añaden también characters_cache y questions_cache_narrador (chat de
# personajes) para que esos campos tampoco viajen en los listados — solo
# hacen falta cuando se abre el chat de un libro concreto.
# Los campos _url (Cloudinary) SÍ pueden viajar en listados si hace falta en
# el futuro (son solo texto corto), pero de momento se excluyen igual que
# los antiguos en base64 para mantener los listados ligeros.
BOOK_LIST_EXCLUDE_FIELDS = {
    "_id": 0,
    "premium_summary_es": 0,
    "premium_summary_en": 0,
    "audio_es_ES_Neural2_C_es": 0,
    "audio_es_ES_Neural2_C_en": 0,
    "audio_es_ES_Neural2_B_es": 0,
    "audio_es_ES_Neural2_B_en": 0,
    "audio_url_es_ES_Neural2_C_es": 0,
    "audio_url_es_ES_Neural2_C_en": 0,
    "audio_url_es_ES_Neural2_B_es": 0,
    "audio_url_es_ES_Neural2_B_en": 0,
    "hook_audio": 0,
    "hook_audio_url": 0,
    "characters_cache": 0,
    "questions_cache_narrador": 0,
}

def _strip_dynamic_cache_fields(book: dict) -> dict:
    """questions_cache_{personaje} tiene un nombre de campo distinto por
    cada personaje del libro, así que no se puede excluir por nombre fijo
    en BOOK_LIST_EXCLUDE_FIELDS. Se limpia aquí a mano tras traer el
    documento, para que estos campos nunca viajen en los listados."""
    for k in list(book.keys()):
        if k.startswith("questions_cache_"):
            book.pop(k, None)
    return book


@api_router.get("/books/feed")
async def books_feed(skip: int = 0, count: int = 150):
    # Paginado real: el frontend pide tandas pequeñas (skip/count) en vez de
    # cargar todo el catálogo de golpe. Usamos $sample para que el orden sea
    # aleatorio de verdad (antes siempre salía el mismo orden natural de
    # Mongo), combinado con skip/limit para poder seguir pidiendo más tandas
    # sin repetir según el usuario hace scroll.
    pipeline = [
        {"$sample": {"size": skip + count}},
        {"$skip": skip},
        {"$limit": count},
        {"$project": BOOK_LIST_EXCLUDE_FIELDS},
    ]
    books = await db.books.aggregate(pipeline).to_list(length=count)
    books = [_strip_dynamic_cache_fields(b) for b in books]
    print(f"DEBUG: El servidor ha encontrado {len(books)} libros (skip={skip}, count={count}).")
    return {"books": books}


# Ventana de vigencia de una "novedad": un libro con fecha_novedad deja de
# aparecer en /books/novedades pasados estos días, SIN que haga falta tocar
# nada manualmente — el libro sigue existiendo igual en /books/feed para
# siempre, solo deja de mostrarse en esta lista filtrada.
NOVEDADES_WINDOW_DAYS = int(os.environ.get("NOVEDADES_WINDOW_DAYS", "14"))

@api_router.get("/books/novedades")
async def books_novedades(count: int = 50):
    # fecha_novedad se guarda como texto "YYYY-MM-DD" (ver Guía Maestra
    # JSON), así que comparar como string funciona correctamente: ese
    # formato ordena igual alfabéticamente que cronológicamente.
    cutoff = (datetime.now(timezone.utc) - timedelta(days=NOVEDADES_WINDOW_DAYS)).strftime("%Y-%m-%d")
    query = {"fecha_novedad": {"$gte": cutoff}}
    books = await db.books.find(query, BOOK_LIST_EXCLUDE_FIELDS) \
        .sort("fecha_novedad", -1) \
        .limit(count) \
        .to_list(length=count)
    books = [_strip_dynamic_cache_fields(b) for b in books]
    return {"books": books}


@api_router.get("/books/search")
async def search_books(query: str, user: User = Depends(get_current_user)):
    search_exclude_fields = dict(BOOK_LIST_EXCLUDE_FIELDS)
    search_exclude_fields["score"] = {"$meta": "textScore"}
    books = await db.books.find(
        {"$text": {"$search": query}},
        search_exclude_fields
    ).sort([("score", {"$meta": "textScore"})]).to_list(length=100)
    books = [_strip_dynamic_cache_fields(b) for b in books]

    return {"books": books}


@api_router.post("/books/interact")
async def interact(body: dict, user: User = Depends(get_current_user)):
    book_id = body.get("book_id")
    action = body.get("action")
    if not book_id or action not in ("like", "dislike"):
        raise HTTPException(400, "book_id and action (like|dislike) required")
    await db.user_interactions.update_one(
        {"user_id": user.user_id, "book_id": book_id},
        {"$set": {"user_id": user.user_id, "book_id": book_id, "action": action, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/favorites")
async def get_favorites(user: User = Depends(get_current_user)):
    favs = await db.user_interactions.find({"user_id": user.user_id, "action": "like"}, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    book_ids = [f["book_id"] for f in favs]
    if not book_ids:
        return {"books": []}
    books = await db.books.find({"book_id": {"$in": book_ids}}, BOOK_LIST_EXCLUDE_FIELDS).to_list(1000)
    books = [_strip_dynamic_cache_fields(b) for b in books]
    order = {bid: i for i, bid in enumerate(book_ids)}
    books.sort(key=lambda b: order.get(b["book_id"], 9999))
    return {"books": books}

@api_router.get("/books/random")
async def get_random_book(user: User = Depends(get_current_user)):
    pipeline = [{"$sample": {"size": 1}}]
    books = await db.books.aggregate(pipeline).to_list(1)
    if not books:
        raise HTTPException(status_code=404, detail="No hay libros")
    books[0]["_id"] = str(books[0]["_id"])
    return {"books": [books[0]]}

@api_router.get("/books/{book_id}")
async def get_book(book_id: str, user: User = Depends(get_current_user)):
    book = await db.books.find_one({"book_id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(status_code=404, detail=f"Libro con ID {book_id} no encontrado")
    return book


@api_router.delete("/favorites/{book_id}")
async def remove_favorite(book_id: str, user: User = Depends(get_current_user)):
    await db.user_interactions.delete_one({"user_id": user.user_id, "book_id": book_id, "action": "like"})
    return {"ok": True}


@api_router.post("/favorites/clear")
async def clear_favorites(user: User = Depends(get_current_user)):
    result = await db.user_interactions.delete_many({"user_id": user.user_id, "action": "like"})
    return {"ok": True, "deleted_count": result.deleted_count}


@api_router.post("/books/reset")
async def reset_history(user: User = Depends(get_current_user)):
    await db.user_interactions.delete_many({"user_id": user.user_id, "action": "dislike"})
    return {"ok": True}


# ----------------- TTS -----------------
GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
VOICE_FEMENINA = "es-ES-Neural2-C"
VOICE_MASCULINA = "es-ES-Neural2-B"

def select_voice_for_genre(genre: str | None) -> str:
    g = (genre or "").lower()
    fiction_keywords = ["ficción", "ficcion", "novela", "fantas", "thriller", "misterio", "romance", "poes", "drama", "literatura"]
    female_keywords = ["autoayuda", "crecimiento personal", "salud", "bienestar", "biograf", "memorias", "espiritual", "psicolog"]
    male_keywords = ["negocio", "finanz", "histor", "cienc", "tecnolog", "econom", "invers", "emprend", "lider", "ensayo", "polít", "polit"]
    if any(k in g for k in fiction_keywords) or any(k in g for k in female_keywords):
        return VOICE_FEMENINA
    if any(k in g for k in male_keywords):
        if "ficción" in g or "ficcion" in g:
            return VOICE_FEMENINA
        return VOICE_MASCULINA
    return VOICE_FEMENINA

async def google_tts_synthesize(text: str, voice_name: str, lang: str = "es-ES") -> str:
    if not GOOGLE_TTS_API_KEY:
        raise HTTPException(500, "GOOGLE_TTS_API_KEY not configured")
    payload = {
        "input": {"text": text},
        "voice": {"languageCode": lang, "name": voice_name},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": 1.05, "pitch": 0.0},
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{GOOGLE_TTS_URL}?key={GOOGLE_TTS_API_KEY}", json=payload, headers={"Content-Type": "application/json"})
    if r.status_code != 200:
        raise HTTPException(500, f"Google TTS failed: HTTP {r.status_code}")
    data = r.json()
    audio_b64 = data.get("audioContent")
    if not audio_b64:
        raise HTTPException(500, "Google TTS returned no audio")
    return audio_b64

def _safe_voice_field(voice: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "_", voice)

@api_router.post("/tts")
async def tts_generate(req: TTSRequest, user: User = Depends(get_current_user)):
    is_premium = _is_premium_active(user)
    if not is_premium:
        plays_today = await _get_today_audio_count(user.user_id)
        if plays_today >= FREE_DAILY_AUDIO_LIMIT:
            raise HTTPException(status_code=402, detail={
                "error": "daily_limit_reached",
                "message": f"Has alcanzado tu límite diario de {FREE_DAILY_AUDIO_LIMIT} audios.",
                "plays_today": plays_today, "limit": FREE_DAILY_AUDIO_LIMIT,
            })

    book_genre = None
    if req.book_id:
        book_doc = await db.books.find_one({"book_id": req.book_id}, {"genre": 1})
        if book_doc:
            book_genre = book_doc.get("genre")

    explicit_voice = req.voice and req.voice not in ("fable", "alloy", "echo", "onyx", "nova", "shimmer")
    voice_name = req.voice if explicit_voice else select_voice_for_genre(book_genre)

    # cache_field = nombre del campo antiguo en base64 (legacy, solo lectura
    # de fallback si todavía no se ha migrado este libro/voz/idioma).
    # url_field = nombre del campo nuevo, donde se guarda la URL de
    # Cloudinary. Es el único campo que se ESCRIBE a partir de ahora.
    cache_field = None
    url_field = None
    cached_audio = None
    cached_audio_url = None
    if req.book_id:
        cache_field = f"audio_{_safe_voice_field(voice_name)}_{req.lang or 'es'}"
        url_field = f"audio_url_{_safe_voice_field(voice_name)}_{req.lang or 'es'}"
        book_doc2 = await db.books.find_one({"book_id": req.book_id}, {cache_field: 1, url_field: 1})
        if book_doc2 and book_doc2.get(url_field):
            cached_audio_url = book_doc2[url_field]
        elif book_doc2 and book_doc2.get(cache_field):
            cached_audio = book_doc2[cache_field]

    if cached_audio_url:
        # Ya migrado o ya generado tras el cambio a Cloudinary: devolvemos
        # directamente la URL, sin tocar Google TTS ni el base64.
        new_count = 0
        if not is_premium:
            new_count = await _increment_audio_count(user.user_id)
        return {
            "audio_url": cached_audio_url, "mime": "audio/mp3", "plays_today": new_count,
            "limit": FREE_DAILY_AUDIO_LIMIT, "is_premium": is_premium, "cached": True, "voice": voice_name,
        }

    if cached_audio:
        # Legacy: el libro todavía tiene el audio en base64 (no migrado
        # aún por el script de migración). Lo servimos tal cual, sin
        # volver a generarlo, pero SIN re-guardarlo en base64 otra vez.
        audio_b64 = cached_audio
        was_cached = True
    else:
        text = (req.text or "")[:4500]
        if not text:
            raise HTTPException(400, "Empty text")
        audio_b64 = await google_tts_synthesize(text=text, voice_name=voice_name)
        was_cached = False
        if url_field and req.book_id:
            try:
                audio_url = await upload_audio_to_cloudinary(audio_b64, public_id=f"{req.book_id}_{url_field}")
                await db.books.update_one({"book_id": req.book_id}, {"$set": {url_field: audio_url, "voice_used": voice_name}})
            except Exception:
                logger.exception("audio cloudinary upload/cache write failed")

    new_count = 0
    if not is_premium:
        new_count = await _increment_audio_count(user.user_id)

    return {
        "audio_base64": audio_b64, "mime": "audio/mp3", "plays_today": new_count,
        "limit": FREE_DAILY_AUDIO_LIMIT, "is_premium": is_premium, "cached": was_cached, "voice": voice_name,
    }


# ----------------- Hook Audio (autoplay al pararse en discover) -----------------
# El texto de "hook" ya existe en el JSON de cada libro (se usa en ShareCard y
# FlashCardModal). Aquí solo generamos y cacheamos su audio. A diferencia de
# /tts, este audio NO depende de idioma/voz seleccionable por el usuario: se
# genera siempre con la misma voz por género (select_voice_for_genre), igual
# que el resto del catálogo.
# Desde la migración a Cloudinary, el audio se guarda en "hook_audio_url"
# (URL). El campo antiguo "hook_audio" (base64) solo se lee como fallback
# legacy para libros que aún no se han migrado.
@api_router.get("/books/{book_id}/hook-audio")
async def get_hook_audio(book_id: str, user: User = Depends(get_current_user)):
    is_premium = _is_premium_active(user)

    if not is_premium:
        plays_today = await _get_today_hook_count(user.user_id)
        if plays_today >= FREE_DAILY_HOOK_LIMIT:
            # Silencio total: sin error 402, sin modal. El frontend debe
            # comprobar "available" y, si es False, no reproducir nada.
            return {"available": False}

    book = await db.books.find_one({"book_id": book_id}, {"_id": 0, "hook": 1, "hook_audio": 1, "hook_audio_url": 1, "genre": 1})
    if not book:
        raise HTTPException(404, "Book not found")

    hook_text = (book.get("hook") or "").strip()
    if not hook_text:
        # Libro sin hook definido: no hay nada que reproducir, pero esto no
        # cuenta como "agotaste tus hooks", así que no incrementamos contador.
        return {"available": False}

    audio_url = book.get("hook_audio_url")
    audio_b64 = book.get("hook_audio")
    was_cached = bool(audio_url or audio_b64)

    if audio_url:
        # Ya migrado o ya generado tras el cambio a Cloudinary.
        if not is_premium:
            await _increment_hook_count(user.user_id)
        return {"available": True, "audio_url": audio_url, "mime": "audio/mp3", "cached": True}

    if not audio_b64:
        voice_name = select_voice_for_genre(book.get("genre"))
        audio_b64 = await google_tts_synthesize(text=hook_text[:1000], voice_name=voice_name)
        try:
            new_audio_url = await upload_audio_to_cloudinary(audio_b64, public_id=f"{book_id}_hook_audio")
            await db.books.update_one({"book_id": book_id}, {"$set": {"hook_audio_url": new_audio_url}})
            if not is_premium:
                await _increment_hook_count(user.user_id)
            return {"available": True, "audio_url": new_audio_url, "mime": "audio/mp3", "cached": False}
        except Exception:
            logger.exception("hook_audio cloudinary upload/cache write failed")

    # Legacy: el libro ya tenía hook_audio en base64 (no migrado aún por
    # el script de migración). Lo servimos tal cual, sin volver a
    # generarlo ni re-guardarlo en base64.
    if not is_premium:
        await _increment_hook_count(user.user_id)

    return {"available": True, "audio_base64": audio_b64, "mime": "audio/mp3", "cached": was_cached}


# ----------------- Character Chat (Premium only) -----------------
# Rediseño del antiguo "Author Chat": en vez de simular ser el autor real
# (riesgo de derecho de imagen/personalidad de una persona viva), la IA
# encarna a un PERSONAJE DE FICCIÓN del propio libro (sin ese riesgo legal
# directo), o, si el libro es de no ficción (sin personajes en la
# sinopsis), una voz de "narrador/guía" genérica que comenta las ideas del
# libro sin fingir ser el autor ni nadie real.
#
# Flujo:
#   1. GET /books/{book_id}/characters -> identifica personajes (o lista
#      vacía si es no ficción), cacheado en el propio documento del libro.
#   2. GET /books/{book_id}/character-questions?character=... -> las 4
#      preguntas sugeridas para ese personaje (o el narrador), cacheadas.
#   3. POST /books/{book_id}/character-chat -> el chat en sí.
#
# Todos los prompts siguen el principio acordado: INMERSIÓN sí, INVENCIÓN
# de hechos de trama NO. Ver documentos de diseño:
# resumen_chat_personajes.md, prompt_identificar_personajes.md,
# prompt_identidad_personaje.md, prompt_chat_personajes.md,
# prompt_narrador_generico.md, prompt_preguntas_sugeridas.md

class CharacterChatMessage(BaseModel):
    role: str
    content: str

class CharacterChatRequest(BaseModel):
    message: str
    history: List[CharacterChatMessage] = []
    # Nombre del personaje elegido por el usuario en el modal de
    # selección. Si es None o "narrador", se usa el modo Narrador
    # Genérico (no ficción) en vez del modo Personaje.
    character: Optional[str] = None


def _vibe_tags_to_text(vibe_tags: list) -> str:
    """Convierte la lista de vibe_tags (objetos {label, icon}) a una
    frase simple legible para la IA, en vez de pasarle el JSON crudo."""
    if not vibe_tags:
        return ""
    labels = [t.get("label", "") for t in vibe_tags if isinstance(t, dict) and t.get("label")]
    return ", ".join(labels)


CHARACTER_BEHAVIOR_PROMPT = (
    "ESTILO DE RESPUESTA — MUY IMPORTANTE: "
    "Responde siempre de forma corta y directa: máximo 3-4 líneas en total. "
    "Nada de párrafos largos ni explicaciones extensas — eres un personaje en una "
    "conversación real, no un narrador. Ve al grano y con personalidad.\n\n"
    "Adapta tu energía al tono del usuario: si te desafían o te preguntan con "
    "brusquedad, sé más breve y cortante; si te preguntan con curiosidad o calidez, "
    "ábrете más y sé más detallista. La conversación debe sentirse viva y real.\n\n"
    "Memoria de la conversación: si el usuario pregunta algo que ya se ha mencionado "
    "antes en este chat, no lo repitas tal cual — haz referencia natural a lo que ya "
    "saben ('como ya te conté...', 'eso ya lo sabes...') para dar continuidad.\n\n"
    "Sobre hacer preguntas al usuario: no las hagas de forma automática en cada "
    "mensaje — eso resulta forzado y repetitivo. Hazlas solo cuando surja de forma "
    "natural, cuando tengas genuina curiosidad por algo que dijo el usuario o cuando "
    "quieras invitarle a reflexionar sobre algo concreto. Nunca repitas una pregunta "
    "que ya hayas hecho antes en esta conversación. A veces la mejor respuesta es "
    "simplemente responder y dejar que el usuario lleve el hilo.\n\n"
    "Cuando te preguntan algo que va más allá de lo que sabes (según la sinopsis), "
    "no lo inventes nunca. Si la pregunta te obliga a especular sobre un vacío en la "
    "sinopsis, prioriza siempre el misterio antes que el dato falso: desvía la "
    "atención hacia lo que sí conoces, con la personalidad y el tono de tu personaje. "
    "Reacciona con humor, picardía, evasión juguetona, intriga — lo que toque según "
    "tu carácter. Trata al usuario de tú a tú, como si estuvierais charlando de verdad.\n\n"
    "Puedes, según lo que tenga más sentido en cada momento: negarte con complicidad "
    "reconociendo que eso es spoiler (\"eso es spoiler, no te lo voy a decir\", o "
    "variantes propias con tu personalidad), o reconocer con naturalidad que tú mismo "
    "todavía no lo sabes (porque no ha pasado aún en tu historia). Usa lo que mejor "
    "encaje según la pregunta y tu carácter — no te limites siempre a la misma fórmula.\n\n"
    "Si la pregunta es sobre algo del pasado o presente de la historia que tampoco "
    "está en la sinopsis, responde con evasión natural — cambiando de tema con "
    "intriga, insinuando que es un recuerdo confuso, o devolviendo la pregunta — "
    "sin inventar nunca el detalle que falta.\n\n"
    "La única regla fija: no puedes inventar ni revelar ningún hecho, objeto, suceso "
    "o detalle de trama que no esté en la sinopsis. La única salida válida siempre es "
    "remitir a la lectura del libro. La FORMA de decirlo es libre y debe sonar "
    "natural, variada y con personalidad — nunca como una frase de plantilla repetida."
)

import os
import json
import uuid
import base64
import logging
import asyncio
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Set

import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Cookie, Header
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAITextToSpeech

import cloudinary
import cloudinary.uploader

# ----------------- Setup -----------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
GOOGLE_TTS_API_KEY = os.environ.get("GOOGLE_TTS_API_KEY", "")
AFFILIATE_AMAZON_TAG = os.environ.get("AFFILIATE_AMAZON_TAG", "")
AFFILIATE_CASA_LIBRO = os.environ.get("AFFILIATE_CASA_LIBRO", "")

FREE_DAILY_AUDIO_LIMIT = int(os.environ.get("FREE_DAILY_AUDIO_LIMIT", "3"))
PRICING = {
    "monthly_regular": "4,99€/mes",
    "monthly_launch":  "2,99€/mes",
    "yearly_regular":  "29,99€/año",
    "yearly_launch":   "19,99€/año",
    "launch_promo_active": True,
    "launch_promo_label":  "🔥 OFERTA DE LANZAMIENTO",
    "free_daily_audio_limit": FREE_DAILY_AUDIO_LIMIT,
}

# Cloudinary: usado para almacenar audios (resúmenes y hooks) fuera de
# Mongo, ya que guardarlos en base64 dentro de cada documento de libro
# era la causa principal de la lentitud de Mongo Atlas (tier M0).
cloudinary.config(
    cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
    api_key=os.environ["CLOUDINARY_API_KEY"],
    api_secret=os.environ["CLOUDINARY_API_SECRET"],
)

async def upload_audio_to_cloudinary(audio_b64: str, public_id: str) -> str:
    """Sube un audio (en base64) a Cloudinary y devuelve su URL pública.
    Cloudinary trata el audio como resource_type='video'. Se ejecuta en un
    thread aparte porque el SDK de cloudinary no es async."""
    audio_bytes = base64.b64decode(audio_b64)
    result = await asyncio.to_thread(
        cloudinary.uploader.upload,
        audio_bytes,
        resource_type="video",
        public_id=public_id,
        folder="clickbook_audio",
        overwrite=True,
    )
    return result["secure_url"]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("steampunk-books")

# ----------------- Models -----------------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    lang: str = "es"
    is_premium: bool = False
    premium_until: Optional[datetime] = None
    created_at: datetime

class Book(BaseModel):
    book_id: str
    title: str
    author: str
    year: int
    genre: str
    pages: int
    rating: float
    synopsis_es: Optional[str] = ""
    synopsis_en: Optional[str] = ""
    summary_es: Optional[str] = ""
    summary_en: Optional[str] = ""
    cover_url: Optional[str] = ""
    amazon_url: Optional[str] = ""
    casa_del_libro_url: Optional[str] = ""
    google_books_url: Optional[str] = ""
    created_at: Optional[datetime] = None

class SessionExchangeRequest(BaseModel):
    session_id: str

class FavoriteCreate(BaseModel):
    book_id: str

class TTSRequest(BaseModel):
    text: str
    voice: str = "fable"
    book_id: Optional[str] = None
    lang: Optional[str] = "es"

class LangUpdate(BaseModel):
    lang: str

# ----------------- Auth helpers -----------------
async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None),
) -> User:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif session_token:
        token = session_token

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session_doc = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session_doc.get("expires_at")
    if expires_at and expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")

    return User(**user_doc)


# ----------------- Auth routes -----------------
@api_router.post("/auth/session")
async def exchange_session(req: SessionExchangeRequest, response: Response):
    async with httpx.AsyncClient(timeout=15.0) as http_client:
        resp = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")

    data = resp.json()
    email = data["email"]
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data["session_token"]

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "lang": "es", "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(dict(user_doc))
        user_doc.pop("_id", None)

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {"user_id": user_id, "session_token": session_token, "expires_at": expires_at, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    response.set_cookie(key="session_token", value=session_token, max_age=7*24*60*60, path="/", httponly=True, secure=True, samesite="none")
    return {"user": User(**user_doc).dict(), "session_token": session_token}


@api_router.get("/auth/me")
async def auth_me(user: User = Depends(get_current_user)):
    return user.dict()


@api_router.post("/auth/guest")
async def guest_login():
    user_id = f"guest_{uuid.uuid4().hex[:12]}"
    session_token = f"guest_{uuid.uuid4().hex}"
    user_doc = {
        "user_id": user_id, "email": f"{user_id}@guest.local", "name": "Invitado",
        "picture": None, "lang": "es", "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(dict(user_doc))
    user_doc.pop("_id", None)
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
        "created_at": datetime.now(timezone.utc),
    })
    return {"user": User(**user_doc).dict(), "session_token": session_token}


@api_router.post("/auth/logout")
async def logout(response: Response, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif session_token:
        token = session_token
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


@api_router.patch("/auth/lang")
async def update_lang(body: LangUpdate, user: User = Depends(get_current_user)):
    if body.lang not in ("es", "en"):
        raise HTTPException(400, "lang must be 'es' or 'en'")
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"lang": body.lang}})
    return {"ok": True, "lang": body.lang}


# ----------------- Premium / Usage -----------------
def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

async def _get_today_audio_count(user_id: str) -> int:
    doc = await db.daily_audio_usage.find_one({"user_id": user_id, "date": _today_key()})
    return int(doc["count"]) if doc else 0

async def _increment_audio_count(user_id: str) -> int:
    res = await db.daily_audio_usage.find_one_and_update(
        {"user_id": user_id, "date": _today_key()},
        {"$inc": {"count": 1}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        upsert=True, return_document=True,
    )
    return int(res.get("count", 1)) if res else 1

# Contador de hooks: misma lógica que el de audio de resúmenes, pero en su
# propia colección para que sea un límite diario totalmente independiente
# (un usuario free puede gastar 3 resúmenes + 3 hooks = 6 audios/día en total).
FREE_DAILY_HOOK_LIMIT = int(os.environ.get("FREE_DAILY_HOOK_LIMIT", "3"))

async def _get_today_hook_count(user_id: str) -> int:
    doc = await db.daily_hook_usage.find_one({"user_id": user_id, "date": _today_key()})
    return int(doc["count"]) if doc else 0

async def _increment_hook_count(user_id: str) -> int:
    res = await db.daily_hook_usage.find_one_and_update(
        {"user_id": user_id, "date": _today_key()},
        {"$inc": {"count": 1}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        upsert=True, return_document=True,
    )
    return int(res.get("count", 1)) if res else 1

def _is_premium_active(user: User) -> bool:
    if not user.is_premium:
        return False
    if user.premium_until and user.premium_until.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        return False
    return True

@api_router.get("/me/usage")
async def get_my_usage(user: User = Depends(get_current_user)):
    plays_today = await _get_today_audio_count(user.user_id)
    is_premium = _is_premium_active(user)
    return {
        "is_premium": is_premium, "plays_today": plays_today, "limit": FREE_DAILY_AUDIO_LIMIT,
        "remaining": max(0, FREE_DAILY_AUDIO_LIMIT - plays_today) if not is_premium else None,
        "premium_until": user.premium_until.isoformat() if user.premium_until else None,
    }

@api_router.get("/me/hook-usage")
async def get_my_hook_usage(user: User = Depends(get_current_user)):
    # Igual que /me/usage pero para el contador de hooks automáticos del
    # botón en discover.tsx — permite pintar el numerito (3, 2, 1) en la
    # portada SIN tener que pedir el audio primero para saberlo.
    plays_today = await _get_today_hook_count(user.user_id)
    is_premium = _is_premium_active(user)
    return {
        "is_premium": is_premium, "plays_today": plays_today, "limit": FREE_DAILY_HOOK_LIMIT,
        "remaining": max(0, FREE_DAILY_HOOK_LIMIT - plays_today) if not is_premium else None,
    }

@api_router.get("/config/pricing")
async def get_pricing():
    return PRICING

@api_router.post("/me/upgrade")
async def upgrade_to_premium(user: User = Depends(get_current_user)):
    until = datetime.now(timezone.utc) + timedelta(days=30)
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"is_premium": True, "premium_until": until}})
    return {"ok": True, "is_premium": True, "premium_until": until.isoformat()}

@api_router.post("/me/downgrade")
async def downgrade_from_premium(user: User = Depends(get_current_user)):
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"is_premium": False, "premium_until": None}})
    return {"ok": True, "is_premium": False}


# ----------------- Book routes -----------------

# Campos "pesados" (audio en base64) que NUNCA deben viajar en listados de
# varios libros (feed, search, favorites). Solo se piden cuando se consulta
# UN libro en concreto (get_book, premium_summary, tts).
# Nota: resumen_audio NO se excluye porque es solo TEXTO (el guion del audio),
# no el audio en sí, y se muestra siempre a todo el mundo, sea o no premium.
# Se añaden también characters_cache y questions_cache_narrador (chat de
# personajes) para que esos campos tampoco viajen en los listados — solo
# hacen falta cuando se abre el chat de un libro concreto.
# Los campos _url (Cloudinary) SÍ pueden viajar en listados si hace falta en
# el futuro (son solo texto corto), pero de momento se excluyen igual que
# los antiguos en base64 para mantener los listados ligeros.
BOOK_LIST_EXCLUDE_FIELDS = {
    "_id": 0,
    "premium_summary_es": 0,
    "premium_summary_en": 0,
    "audio_es_ES_Neural2_C_es": 0,
    "audio_es_ES_Neural2_C_en": 0,
    "audio_es_ES_Neural2_B_es": 0,
    "audio_es_ES_Neural2_B_en": 0,
    "audio_url_es_ES_Neural2_C_es": 0,
    "audio_url_es_ES_Neural2_C_en": 0,
    "audio_url_es_ES_Neural2_B_es": 0,
    "audio_url_es_ES_Neural2_B_en": 0,
    "hook_audio": 0,
    "hook_audio_url": 0,
    "characters_cache": 0,
    "questions_cache_narrador": 0,
}

def _strip_dynamic_cache_fields(book: dict) -> dict:
    """questions_cache_{personaje} tiene un nombre de campo distinto por
    cada personaje del libro, así que no se puede excluir por nombre fijo
    en BOOK_LIST_EXCLUDE_FIELDS. Se limpia aquí a mano tras traer el
    documento, para que estos campos nunca viajen en los listados."""
    for k in list(book.keys()):
        if k.startswith("questions_cache_"):
            book.pop(k, None)
    return book


@api_router.get("/books/feed")
async def books_feed(skip: int = 0, count: int = 150):
    # Paginado real: el frontend pide tandas pequeñas (skip/count) en vez de
    # cargar todo el catálogo de golpe. Usamos $sample para que el orden sea
    # aleatorio de verdad (antes siempre salía el mismo orden natural de
    # Mongo), combinado con skip/limit para poder seguir pidiendo más tandas
    # sin repetir según el usuario hace scroll.
    pipeline = [
        {"$sample": {"size": skip + count}},
        {"$skip": skip},
        {"$limit": count},
        {"$project": BOOK_LIST_EXCLUDE_FIELDS},
    ]
    books = await db.books.aggregate(pipeline).to_list(length=count)
    books = [_strip_dynamic_cache_fields(b) for b in books]
    print(f"DEBUG: El servidor ha encontrado {len(books)} libros (skip={skip}, count={count}).")
    return {"books": books}


# Ventana de vigencia de una "novedad": un libro con fecha_novedad deja de
# aparecer en /books/novedades pasados estos días, SIN que haga falta tocar
# nada manualmente — el libro sigue existiendo igual en /books/feed para
# siempre, solo deja de mostrarse en esta lista filtrada.
NOVEDADES_WINDOW_DAYS = int(os.environ.get("NOVEDADES_WINDOW_DAYS", "14"))

@api_router.get("/books/novedades")
async def books_novedades(count: int = 50):
    # fecha_novedad se guarda como texto "YYYY-MM-DD" (ver Guía Maestra
    # JSON), así que comparar como string funciona correctamente: ese
    # formato ordena igual alfabéticamente que cronológicamente.
    cutoff = (datetime.now(timezone.utc) - timedelta(days=NOVEDADES_WINDOW_DAYS)).strftime("%Y-%m-%d")
    query = {"fecha_novedad": {"$gte": cutoff}}
    books = await db.books.find(query, BOOK_LIST_EXCLUDE_FIELDS) \
        .sort("fecha_novedad", -1) \
        .limit(count) \
        .to_list(length=count)
    books = [_strip_dynamic_cache_fields(b) for b in books]
    return {"books": books}


@api_router.get("/books/search")
async def search_books(query: str, user: User = Depends(get_current_user)):
    search_exclude_fields = dict(BOOK_LIST_EXCLUDE_FIELDS)
    search_exclude_fields["score"] = {"$meta": "textScore"}
    books = await db.books.find(
        {"$text": {"$search": query}},
        search_exclude_fields
    ).sort([("score", {"$meta": "textScore"})]).to_list(length=100)
    books = [_strip_dynamic_cache_fields(b) for b in books]

    return {"books": books}


@api_router.post("/books/interact")
async def interact(body: dict, user: User = Depends(get_current_user)):
    book_id = body.get("book_id")
    action = body.get("action")
    if not book_id or action not in ("like", "dislike"):
        raise HTTPException(400, "book_id and action (like|dislike) required")
    await db.user_interactions.update_one(
        {"user_id": user.user_id, "book_id": book_id},
        {"$set": {"user_id": user.user_id, "book_id": book_id, "action": action, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/favorites")
async def get_favorites(user: User = Depends(get_current_user)):
    favs = await db.user_interactions.find({"user_id": user.user_id, "action": "like"}, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    book_ids = [f["book_id"] for f in favs]
    if not book_ids:
        return {"books": []}
    books = await db.books.find({"book_id": {"$in": book_ids}}, BOOK_LIST_EXCLUDE_FIELDS).to_list(1000)
    books = [_strip_dynamic_cache_fields(b) for b in books]
    order = {bid: i for i, bid in enumerate(book_ids)}
    books.sort(key=lambda b: order.get(b["book_id"], 9999))
    return {"books": books}

@api_router.get("/books/random")
async def get_random_book(user: User = Depends(get_current_user)):
    pipeline = [{"$sample": {"size": 1}}]
    books = await db.books.aggregate(pipeline).to_list(1)
    if not books:
        raise HTTPException(status_code=404, detail="No hay libros")
    books[0]["_id"] = str(books[0]["_id"])
    return {"books": [books[0]]}

@api_router.get("/books/{book_id}")
async def get_book(book_id: str, user: User = Depends(get_current_user)):
    book = await db.books.find_one({"book_id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(status_code=404, detail=f"Libro con ID {book_id} no encontrado")
    return book


@api_router.delete("/favorites/{book_id}")
async def remove_favorite(book_id: str, user: User = Depends(get_current_user)):
    await db.user_interactions.delete_one({"user_id": user.user_id, "book_id": book_id, "action": "like"})
    return {"ok": True}


@api_router.post("/favorites/clear")
async def clear_favorites(user: User = Depends(get_current_user)):
    result = await db.user_interactions.delete_many({"user_id": user.user_id, "action": "like"})
    return {"ok": True, "deleted_count": result.deleted_count}


@api_router.post("/books/reset")
async def reset_history(user: User = Depends(get_current_user)):
    await db.user_interactions.delete_many({"user_id": user.user_id, "action": "dislike"})
    return {"ok": True}


# ----------------- TTS -----------------
GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
VOICE_FEMENINA = "es-ES-Neural2-C"
VOICE_MASCULINA = "es-ES-Neural2-B"

def select_voice_for_genre(genre: str | None) -> str:
    g = (genre or "").lower()
    fiction_keywords = ["ficción", "ficcion", "novela", "fantas", "thriller", "misterio", "romance", "poes", "drama", "literatura"]
    female_keywords = ["autoayuda", "crecimiento personal", "salud", "bienestar", "biograf", "memorias", "espiritual", "psicolog"]
    male_keywords = ["negocio", "finanz", "histor", "cienc", "tecnolog", "econom", "invers", "emprend", "lider", "ensayo", "polít", "polit"]
    if any(k in g for k in fiction_keywords) or any(k in g for k in female_keywords):
        return VOICE_FEMENINA
    if any(k in g for k in male_keywords):
        if "ficción" in g or "ficcion" in g:
            return VOICE_FEMENINA
        return VOICE_MASCULINA
    return VOICE_FEMENINA

async def google_tts_synthesize(text: str, voice_name: str, lang: str = "es-ES") -> str:
    if not GOOGLE_TTS_API_KEY:
        raise HTTPException(500, "GOOGLE_TTS_API_KEY not configured")
    payload = {
        "input": {"text": text},
        "voice": {"languageCode": lang, "name": voice_name},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": 1.05, "pitch": 0.0},
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{GOOGLE_TTS_URL}?key={GOOGLE_TTS_API_KEY}", json=payload, headers={"Content-Type": "application/json"})
    if r.status_code != 200:
        raise HTTPException(500, f"Google TTS failed: HTTP {r.status_code}")
    data = r.json()
    audio_b64 = data.get("audioContent")
    if not audio_b64:
        raise HTTPException(500, "Google TTS returned no audio")
    return audio_b64

def _safe_voice_field(voice: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "_", voice)

@api_router.post("/tts")
async def tts_generate(req: TTSRequest, user: User = Depends(get_current_user)):
    is_premium = _is_premium_active(user)
    if not is_premium:
        plays_today = await _get_today_audio_count(user.user_id)
        if plays_today >= FREE_DAILY_AUDIO_LIMIT:
            raise HTTPException(status_code=402, detail={
                "error": "daily_limit_reached",
                "message": f"Has alcanzado tu límite diario de {FREE_DAILY_AUDIO_LIMIT} audios.",
                "plays_today": plays_today, "limit": FREE_DAILY_AUDIO_LIMIT,
            })

    book_genre = None
    if req.book_id:
        book_doc = await db.books.find_one({"book_id": req.book_id}, {"genre": 1})
        if book_doc:
            book_genre = book_doc.get("genre")

    explicit_voice = req.voice and req.voice not in ("fable", "alloy", "echo", "onyx", "nova", "shimmer")
    voice_name = req.voice if explicit_voice else select_voice_for_genre(book_genre)

    # cache_field = nombre del campo antiguo en base64 (legacy, solo lectura
    # de fallback si todavía no se ha migrado este libro/voz/idioma).
    # url_field = nombre del campo nuevo, donde se guarda la URL de
    # Cloudinary. Es el único campo que se ESCRIBE a partir de ahora.
    cache_field = None
    url_field = None
    cached_audio = None
    cached_audio_url = None
    if req.book_id:
        cache_field = f"audio_{_safe_voice_field(voice_name)}_{req.lang or 'es'}"
        url_field = f"audio_url_{_safe_voice_field(voice_name)}_{req.lang or 'es'}"
        book_doc2 = await db.books.find_one({"book_id": req.book_id}, {cache_field: 1, url_field: 1})
        if book_doc2 and book_doc2.get(url_field):
            cached_audio_url = book_doc2[url_field]
        elif book_doc2 and book_doc2.get(cache_field):
            cached_audio = book_doc2[cache_field]

    if cached_audio_url:
        # Ya migrado o ya generado tras el cambio a Cloudinary: devolvemos
        # directamente la URL, sin tocar Google TTS ni el base64.
        new_count = 0
        if not is_premium:
            new_count = await _increment_audio_count(user.user_id)
        return {
            "audio_url": cached_audio_url, "mime": "audio/mp3", "plays_today": new_count,
            "limit": FREE_DAILY_AUDIO_LIMIT, "is_premium": is_premium, "cached": True, "voice": voice_name,
        }

    if cached_audio:
        # Legacy: el libro todavía tiene el audio en base64 (no migrado
        # aún por el script de migración). Lo servimos tal cual, sin
        # volver a generarlo, pero SIN re-guardarlo en base64 otra vez.
        audio_b64 = cached_audio
        was_cached = True
    else:
        text = (req.text or "")[:4500]
        if not text:
            raise HTTPException(400, "Empty text")
        audio_b64 = await google_tts_synthesize(text=text, voice_name=voice_name)
        was_cached = False
        if url_field and req.book_id:
            try:
                audio_url = await upload_audio_to_cloudinary(audio_b64, public_id=f"{req.book_id}_{url_field}")
                await db.books.update_one({"book_id": req.book_id}, {"$set": {url_field: audio_url, "voice_used": voice_name}})
            except Exception:
                logger.exception("audio cloudinary upload/cache write failed")

    new_count = 0
    if not is_premium:
        new_count = await _increment_audio_count(user.user_id)

    return {
        "audio_base64": audio_b64, "mime": "audio/mp3", "plays_today": new_count,
        "limit": FREE_DAILY_AUDIO_LIMIT, "is_premium": is_premium, "cached": was_cached, "voice": voice_name,
    }


# ----------------- Hook Audio (autoplay al pararse en discover) -----------------
# El texto de "hook" ya existe en el JSON de cada libro (se usa en ShareCard y
# FlashCardModal). Aquí solo generamos y cacheamos su audio. A diferencia de
# /tts, este audio NO depende de idioma/voz seleccionable por el usuario: se
# genera siempre con la misma voz por género (select_voice_for_genre), igual
# que el resto del catálogo.
# Desde la migración a Cloudinary, el audio se guarda en "hook_audio_url"
# (URL). El campo antiguo "hook_audio" (base64) solo se lee como fallback
# legacy para libros que aún no se han migrado.
@api_router.get("/books/{book_id}/hook-audio")
async def get_hook_audio(book_id: str, user: User = Depends(get_current_user)):
    is_premium = _is_premium_active(user)

    if not is_premium:
        plays_today = await _get_today_hook_count(user.user_id)
        if plays_today >= FREE_DAILY_HOOK_LIMIT:
            # Silencio total: sin error 402, sin modal. El frontend debe
            # comprobar "available" y, si es False, no reproducir nada.
            return {"available": False}

    book = await db.books.find_one({"book_id": book_id}, {"_id": 0, "hook": 1, "hook_audio": 1, "hook_audio_url": 1, "genre": 1})
    if not book:
        raise HTTPException(404, "Book not found")

    hook_text = (book.get("hook") or "").strip()
    if not hook_text:
        # Libro sin hook definido: no hay nada que reproducir, pero esto no
        # cuenta como "agotaste tus hooks", así que no incrementamos contador.
        return {"available": False}

    audio_url = book.get("hook_audio_url")
    audio_b64 = book.get("hook_audio")
    was_cached = bool(audio_url or audio_b64)

    if audio_url:
        # Ya migrado o ya generado tras el cambio a Cloudinary.
        if not is_premium:
            await _increment_hook_count(user.user_id)
        return {"available": True, "audio_url": audio_url, "mime": "audio/mp3", "cached": True}

    if not audio_b64:
        voice_name = select_voice_for_genre(book.get("genre"))
        audio_b64 = await google_tts_synthesize(text=hook_text[:1000], voice_name=voice_name)
        try:
            new_audio_url = await upload_audio_to_cloudinary(audio_b64, public_id=f"{book_id}_hook_audio")
            await db.books.update_one({"book_id": book_id}, {"$set": {"hook_audio_url": new_audio_url}})
            if not is_premium:
                await _increment_hook_count(user.user_id)
            return {"available": True, "audio_url": new_audio_url, "mime": "audio/mp3", "cached": False}
        except Exception:
            logger.exception("hook_audio cloudinary upload/cache write failed")

    # Legacy: el libro ya tenía hook_audio en base64 (no migrado aún por
    # el script de migración). Lo servimos tal cual, sin volver a
    # generarlo ni re-guardarlo en base64.
    if not is_premium:
        await _increment_hook_count(user.user_id)

    return {"available": True, "audio_base64": audio_b64, "mime": "audio/mp3", "cached": was_cached}


# ----------------- Character Chat (Premium only) -----------------
# Rediseño del antiguo "Author Chat": en vez de simular ser el autor real
# (riesgo de derecho de imagen/personalidad de una persona viva), la IA
# encarna a un PERSONAJE DE FICCIÓN del propio libro (sin ese riesgo legal
# directo), o, si el libro es de no ficción (sin personajes en la
# sinopsis), una voz de "narrador/guía" genérica que comenta las ideas del
# libro sin fingir ser el autor ni nadie real.
#
# Flujo:
#   1. GET /books/{book_id}/characters -> identifica personajes (o lista
#      vacía si es no ficción), cacheado en el propio documento del libro.
#   2. GET /books/{book_id}/character-questions?character=... -> las 4
#      preguntas sugeridas para ese personaje (o el narrador), cacheadas.
#   3. POST /books/{book_id}/character-chat -> el chat en sí.
#
# Todos los prompts siguen el principio acordado: INMERSIÓN sí, INVENCIÓN
# de hechos de trama NO. Ver documentos de diseño:
# resumen_chat_personajes.md, prompt_identificar_personajes.md,
# prompt_identidad_personaje.md, prompt_chat_personajes.md,
# prompt_narrador_generico.md, prompt_preguntas_sugeridas.md

class CharacterChatMessage(BaseModel):
    role: str
    content: str

class CharacterChatRequest(BaseModel):
    message: str
    history: List[CharacterChatMessage] = []
    # Nombre del personaje elegido por el usuario en el modal de
    # selección. Si es None o "narrador", se usa el modo Narrador
    # Genérico (no ficción) en vez del modo Personaje.
    character: Optional[str] = None


def _vibe_tags_to_text(vibe_tags: list) -> str:
    """Convierte la lista de vibe_tags (objetos {label, icon}) a una
    frase simple legible para la IA, en vez de pasarle el JSON crudo."""
    if not vibe_tags:
        return ""
    labels = [t.get("label", "") for t in vibe_tags if isinstance(t, dict) and t.get("label")]
    return ", ".join(labels)


CHARACTER_BEHAVIOR_PROMPT = (
    "ESTILO DE RESPUESTA — MUY IMPORTANTE: "
    "Responde siempre de forma corta y directa: máximo 3-4 líneas en total. "
    "Nada de párrafos largos ni explicaciones extensas — eres un personaje en una "
    "conversación real, no un narrador. Ve al grano, con personalidad, y acaba "
    "SIEMPRE tu respuesta con una pregunta al usuario para mantener la conversación "
    "viva — como cuando chateas con alguien de verdad que te devuelve la pelota.\n\n"
    "Cuando te preguntan algo que va más allá de lo que sabes (según la sinopsis), "
    "no lo inventes nunca — pero tampoco respondas de forma robótica o repetitiva. "
    "Reacciona como lo haría realmente tu personaje: con su propia personalidad, "
    "con humor, picardía, evasión juguetona, intriga, lo que toque según su carácter "
    "y el tono del libro. Trata al usuario de tú a tú, como si estuvierais charlando "
    "de verdad.\n\n"
    "Puedes, según lo que tenga más sentido en cada momento: negarte con complicidad "
    "reconociendo que eso es spoiler (\"eso es spoiler, no te lo voy a decir\", o "
    "variantes propias con tu personalidad), o reconocer con naturalidad que tú mismo "
    "todavía no lo sabes (porque no ha pasado aún en tu historia). Usa lo que mejor "
    "encaje según la pregunta y tu carácter — no te limites siempre a la misma fórmula.\n\n"
    "Si la pregunta es sobre algo del pasado o presente de la historia que tampoco "
    "está en la sinopsis, puedes responder con evasión natural propia de tu personaje "
    "— por ejemplo cambiando de tema con intriga, insinuando que es un recuerdo "
    "confuso o doloroso, o devolviendo la pregunta con otra pregunta — sin nunca "
    "inventar el detalle que falta.\n\n"
    "La única regla fija es de contenido: no puedes inventar ni revelar ningún hecho, "
    "objeto, suceso o detalle de trama que no esté en la sinopsis. La única salida "
    "válida siempre es remitir a la lectura del libro para descubrirlo. La FORMA de "
    "decir esto es libre y debe sonar natural, variada y con personalidad — nunca "
    "como una frase de plantilla repetida."
)

def _build_character_system_prompt(book: dict, character_name: str, character_desc: str) -> str:
    vibes_text = _vibe_tags_to_text(book.get("vibe_tags") or [])
    return (
        f"Eres {character_name}, un personaje de la novela \"{book.get('title','')}\" "
        f"de {book.get('author','')}.\n\n"
        f"Contexto de la obra que debes conocer y respetar siempre:\n"
        f"- Género: {book.get('genre','')}\n"
        f"- Tema central: {book.get('tema','')}\n"
        f"- Tono: {book.get('tono','')}\n"
        f"- Sinopsis completa: {book.get('sinopsis','')}\n"
        f"- Frase clave de la historia: {book.get('hook','')}\n"
        f"- Ambiente/sensaciones de la obra: {vibes_text}\n\n"
        f"Tu papel dentro de esta historia: {character_desc}\n\n"
        f"Hablas en primera persona, como si realmente fueras {character_name}, con una "
        f"personalidad coherente con el tono de la obra ({book.get('tono','')}) y tu papel "
        f"en ella. Vives dentro de la historia — no sabes nada de lo que le pasará a tu "
        f"personaje más adelante, ni el final, solo lo que ya ha ocurrido hasta donde "
        f"llega la sinopsis.\n\n"
        f"Nunca rompas el personaje. Nunca digas que eres una IA, ni que esto es una "
        f"novela, ni que tu existencia depende de un libro — para ti, esto es tu vida real.\n\n"
        f"{CHARACTER_BEHAVIOR_PROMPT}"
    )


def _build_narrator_system_prompt(book: dict) -> str:
    vibes_text = _vibe_tags_to_text(book.get("vibe_tags") or [])
    return (
        f"Eres un guía entusiasta que ha leído a fondo \"{book.get('title','')}\" de "
        f"{book.get('author','')} y le encanta comentarlo con la gente. Hablas en "
        f"primera persona, pero no eres el autor ni ningún personaje — eres simplemente "
        f"alguien apasionado por las ideas de este libro en concreto, con ganas de "
        f"compartirlas.\n\n"
        f"Contexto del libro que debes conocer y respetar siempre:\n"
        f"- Género: {book.get('genre','')}\n"
        f"- Tema central: {book.get('tema','')}\n"
        f"- Tono: {book.get('tono','')}\n"
        f"- Sinopsis completa: {book.get('sinopsis','')}\n"
        f"- Frase clave del libro: {book.get('hook','')}\n"
        f"- Ambiente/sensaciones del libro: {vibes_text}\n\n"
        f"Tu tono es cercano, cálido y entusiasta. Responde siempre de forma corta y "
        f"directa: máximo 3-4 líneas. Nada de párrafos largos. Ve al grano con personalidad.\n\n"
        f"Adapta tu energía al tono del usuario: si te preguntan con curiosidad y calidez, "
        f"ábrете más; si son más directos o escuetos, sé tú también más conciso.\n\n"
        f"Memoria de la conversación: si el usuario pregunta algo que ya se ha mencionado "
        f"antes en este chat, no lo repitas tal cual — haz referencia natural a lo que ya "
        f"saben para dar continuidad a la conversación.\n\n"
        f"Sobre hacer preguntas al usuario: hazlas solo cuando surja de forma natural, "
        f"no en cada mensaje — eso resulta forzado. Nunca repitas una pregunta que ya "
        f"hayas hecho antes en esta conversación.\n\n"
        f"Deja que las sensaciones del libro ({vibes_text}) impregnen tu forma de hablar.\n\n"
        f"No inventes datos, cifras, estudios, anécdotas o afirmaciones del libro que no "
        f"estén respaldadas por la sinopsis que tienes. Si te preguntan un detalle muy "
        f"específico que no está en la sinopsis, prioriza el misterio antes que el dato "
        f"falso: redirige hacia lo que sí sabes con honestidad y cercanía, reconociendo "
        f"que ese detalle se explica mejor leyendo el libro directamente.\n\n"
        f"Nunca digas que eres una IA. Mantén siempre este tono de \"lector apasionado\" "
        f"durante toda la conversación."
    )


@api_router.get("/books/{book_id}/characters")
async def get_book_characters(book_id: str, user: User = Depends(get_current_user)):
    book = await db.books.find_one(
        {"book_id": book_id},
        {"_id": 0, "title": 1, "genre": 1, "tema": 1, "tono": 1, "sinopsis": 1, "characters_cache": 1},
    )
    if not book:
        raise HTTPException(404, "Book not found")

    cached = book.get("characters_cache")
    if cached is not None:
        return {"characters": cached}

    sinopsis = (book.get("sinopsis") or "").strip()
    if not sinopsis:
        # Sin sinopsis no hay nada fiable de lo que extraer — narrador genérico.
        await db.books.update_one({"book_id": book_id}, {"$set": {"characters_cache": []}})
        return {"characters": []}

    prompt = (
        "Eres un analista literario. A partir de la siguiente sinopsis de un libro, "
        "identifica los personajes DE FICCIÓN principales que aparecen mencionados o "
        "claramente implicados en el texto.\n\n"
        "Regla crítica, sin excepciones: solo cuentan como \"personaje\" aquellas "
        "personas inventadas por el autor dentro de la trama de ficción. NUNCA trates "
        "como personaje a una persona que existe o existió de verdad fuera de las "
        "páginas de este libro — esto incluye: el propio autor del libro, personas "
        "biografiadas (deportistas, actores, directores, fotógrafos, músicos, figuras "
        "históricas), o cualquier persona real mencionada en libros de no ficción "
        "(deporte, cine, fotografía, ensayo, memorias, biografía). Esta regla se aplica "
        "sin importar el género o tema del libro. Si todos los nombres que aparecen en "
        "la sinopsis son de personas reales (no inventadas), trata el libro como si no "
        "tuviera personajes — devuelve una lista vacía.\n\n"
        f"Libro: {book.get('title','')}\n"
        f"Género: {book.get('genre','')}\n"
        f"Tema: {book.get('tema','')}\n"
        f"Tono: {book.get('tono','')}\n"
        f"Sinopsis: {sinopsis}\n\n"
        "Devuelve ÚNICAMENTE los personajes DE FICCIÓN que estén explícitamente "
        "nombrados o descritos en la sinopsis — no inventes personajes que no aparezcan "
        "en este texto, aunque el género o tono sugieran que \"deberían\" existir.\n\n"
        "Para cada personaje, indica:\n"
        "- Su nombre exactamente como aparece en la sinopsis.\n"
        "- Una frase corta (máximo 12 palabras) que lo describa, basada únicamente en "
        "lo que dice la sinopsis sobre él/ella.\n"
        "- Su género (\"masculino\" o \"femenino\"), deducido del propio texto de la "
        "sinopsis. Si no hay pista clara, indica \"desconocido\".\n\n"
        "REGLA CRÍTICA DE NOMBRE PROPIO: solo incluye personajes que tengan un nombre "
        "propio real (ej: Elena, Kelsier, Ragna). NUNCA incluyas personajes "
        "identificados solo por su rol o descripción (ej: \"la asistenta\", "
        "\"la doncella\", \"el detective\", \"la mujer de enfrente\"). Si un "
        "personaje no tiene nombre propio en la sinopsis, no lo incluyas aunque "
        "sea importante en la trama.\n\n"
        "Si la sinopsis solo nombra a un personaje de ficción claramente, devuelve solo "
        "ese uno — no inventes un reparto más amplio para \"rellenar\".\n\n"
        "Si la sinopsis no menciona a ningún personaje DE FICCIÓN con nombre propio "
        "(libros de no ficción: autoayuda, ensayo, historia, divulgación, biografía, "
        "deporte, cine, fotografía — incluso si mencionan nombres de personas reales), "
        "devuelve una lista vacía. Esto es un resultado válido y esperado.\n\n"
        "Responde solo en este formato JSON, sin texto adicional:\n"
        '{"personajes": [{"nombre": "...", "descripcion": "...", "genero": "masculino|femenino|desconocido"}]}'
    )

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"characters-{book_id}", system_message="Eres un analista literario preciso, que nunca inventa información fuera del texto dado.").with_model("gemini", GEMINI_MODEL)

    try:
        response_text = await chat.send_message(UserMessage(text=prompt))
        cleaned = re.sub(r"^```(?:json)?\s*", "", response_text.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)
        parsed = json.loads(cleaned)
        characters = parsed.get("personajes", [])
        await db.books.update_one({"book_id": book_id}, {"$set": {"characters_cache": characters}})
        return {"characters": characters}
    except Exception as e:
        logger.exception("Character identification failed")
        # Fallo de la IA o del parseo: no bloqueamos al usuario, caemos a
        # modo narrador genérico (lista vacía) en vez de dar error 500.
        return {"characters": []}


@api_router.get("/books/{book_id}/character-questions")
async def get_character_questions(book_id: str, character: Optional[str] = None, user: User = Depends(get_current_user)):
    book = await db.books.find_one({"book_id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(404, "Book not found")

    cache_field = f"questions_cache_{character}" if character else "questions_cache_narrador"
    cached = book.get(cache_field)
    if cached is not None:
        return {"questions": cached}

    sinopsis = (book.get("sinopsis") or "").strip()
    vibes_text = _vibe_tags_to_text(book.get("vibe_tags") or [])

    if character:
        characters_cache = book.get("characters_cache") or []
        char_desc = next((c.get("descripcion", "") for c in characters_cache if c.get("nombre") == character), "")
        prompt = (
            "A partir de esta sinopsis y este personaje, genera 3 preguntas cortas que "
            f"un lector le haría a {character} en una conversación.\n\n"
            f"Libro: {book.get('title','')}\n"
            f"Sinopsis: {sinopsis}\n"
            f"Personaje: {character} — {char_desc}\n"
            f"Tono del libro: {book.get('tono','')}\n\n"
            "Mezcla dos tipos de preguntas: 1 sobre la TRAMA o sus decisiones (sin "
            "revelar spoiler en la propia pregunta), y 2 más EMOCIONALES o personales.\n\n"
            "Reglas: cada pregunta debe poder responderse sin que el personaje necesite "
            "inventar nada que no esté en la sinopsis. Máximo 6-7 palabras por pregunta. "
            "No repitas la misma estructura tres veces. Nunca preguntes algo que solo "
            "tendría sentido si el personaje supiera el final de su propia historia.\n\n"
            'Responde solo en JSON: {"preguntas": ["...", "...", "..."]}'
        )
    else:
        prompt = (
            "A partir de esta sinopsis, genera 3 preguntas cortas que un lector le "
            "haría a alguien apasionado por este libro, en una conversación sobre sus "
            "ideas.\n\n"
            f"Libro: {book.get('title','')}\n"
            f"Sinopsis: {sinopsis}\n"
            f"Tema: {book.get('tema','')}\n"
            f"Vibe del libro: {vibes_text}\n\n"
            "Las preguntas deben invitar a conversar sobre las IDEAS y el contenido "
            "real del libro (no hay trama ni personajes). Máximo 6-7 palabras por "
            "pregunta. Varía la estructura entre las cuatro.\n\n"
            'Responde solo en JSON: {"preguntas": ["...", "...", "..."]}'
        )

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"questions-{book_id}-{character or 'narrador'}", system_message="Generas preguntas breves y fieles al texto dado, sin inventar detalles de trama.").with_model("gemini", GEMINI_MODEL)

    try:
        response_text = await chat.send_message(UserMessage(text=prompt))
        cleaned = re.sub(r"^```(?:json)?\s*", "", response_text.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)
        parsed = json.loads(cleaned)
        questions = parsed.get("preguntas", [])
        await db.books.update_one({"book_id": book_id}, {"$set": {cache_field: questions}})
        return {"questions": questions}
    except Exception as e:
        logger.exception("Question generation failed")
        return {"questions": []}


@api_router.post("/books/{book_id}/character-chat")
async def character_chat(book_id: str, req: CharacterChatRequest, user: User = Depends(get_current_user)):
    if not _is_premium_active(user):
        raise HTTPException(status_code=402, detail={"error": "premium_required", "message": "Este chat está disponible solo para usuarios Premium."})
    book = await db.books.find_one({"book_id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(404, "Book not found")

    is_narrator = not req.character or req.character.lower() == "narrador"

    if is_narrator:
        system_msg = _build_narrator_system_prompt(book)
        session_suffix = "narrador"
    else:
        characters_cache = book.get("characters_cache") or []
        char_desc = next((c.get("descripcion", "") for c in characters_cache if c.get("nombre") == req.character), "")
        system_msg = _build_character_system_prompt(book, req.character, char_desc)
        session_suffix = req.character

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"character-chat-{user.user_id}-{book_id}-{session_suffix}", system_message=system_msg).with_model("gemini", "gemini-2.5-flash")

    for h in req.history[-10:]:
        if h.role == "user":
            await chat.send_message(UserMessage(text=h.content))

    try:
        reply = await chat.send_message(UserMessage(text=req.message))
        reply_text = reply.strip()
        await db.character_chats.insert_one({
            "user_id": user.user_id, "book_id": book_id, "character": req.character or "narrador",
            "user_message": req.message, "assistant_reply": reply_text, "created_at": datetime.now(timezone.utc),
        })
        return {"reply": reply_text}
    except Exception as e:
        logger.error(f"Character chat failed — book={book_id} character={req.character} error={type(e).__name__}: {e}")
        raise HTTPException(500, f"Character chat failed: {e}")


# ----------------- Premium Summary -----------------
@api_router.get("/books/{book_id}/premium-summary")
async def premium_summary(book_id: str, lang: str = "es", user: User = Depends(get_current_user)):
    book = await db.books.find_one({"book_id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(404, "Book not found")

    # Lee directamente el resumen escrito por nosotros
    resumen = book.get("resumen_audio")
    if resumen:
        return {"summary": resumen, "lang": lang, "cached": True}

    # Si no tiene resumen_audio, usa la caché antigua
    cache_field = f"premium_summary_{lang}"
    cached = book.get(cache_field)
    if cached:
        return {"summary": cached, "lang": lang, "cached": True}

    # Solo si no hay nada, genera con IA
    title = book.get("title", "")
    author = book.get("author", "")
    prompt = f"""Eres un crítico literario. Escribe un resumen emotivo de 170-180 palabras para "{title}" de {author}.
Empieza con una pregunta en segunda persona que implique al lector.
Tono BookTok, directo, sin spoilers. Solo el texto, sin títulos."""

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"premium-{book_id}-{lang}", system_message="Eres un crítico literario experto.").with_model("gemini", GEMINI_MODEL)

    try:
        response_text = await chat.send_message(UserMessage(text=prompt))
        summary = response_text.strip()
        summary = re.sub(r"^```(?:\w+)?\s*", "", summary)
        summary = re.sub(r"\s*```$", "", summary)
        summary = summary.strip().strip('"').strip("'").strip()
        await db.books.update_one({"book_id": book_id}, {"$set": {cache_field: summary}})
        return {"summary": summary, "lang": lang, "cached": False}
    except Exception as e:
        logger.exception("Premium summary failed")
        raise HTTPException(500, f"Premium summary failed: {e}")


# ----------------- Health -----------------
@api_router.get("/")
async def root():
    return {"status": "ok", "app": "ClickBook"}

@api_router.get("/health")
async def health():
    return {"status": "ok", "service": "clickbook-backend"}


# ----------------- App wiring -----------------
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
@app.on_event("startup")
async def ensure_indexes():
    try:
        await db.books.create_index([
            ("title", "text"),
            ("author", "text"),
            ("genre", "text"),
            ("tema", "text"),
            ("tono", "text"),
            ("subgenero", "text"),
            ("mood", "text"),
        ], name="book_search_text_index")
        logger.info("Text index ensured on books collection")
    except Exception:
        logger.exception("Failed to create text index")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()