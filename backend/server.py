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

# ----------------- Setup -----------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
GOOGLE_TTS_API_KEY = os.environ.get("GOOGLE_TTS_API_KEY", "")

# ----- Affiliate config (fill in .env when ready) -----
AFFILIATE_AMAZON_TAG = os.environ.get("AFFILIATE_AMAZON_TAG", "")
AFFILIATE_CASA_LIBRO = os.environ.get("AFFILIATE_CASA_LIBRO", "")

# ----- Premium / pricing config -----
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
    synopsis_es: str
    synopsis_en: str
    summary_es: str
    summary_en: str
    cover_url: str
    amazon_url: str
    casa_del_libro_url: str
    google_books_url: str
    created_at: datetime

class SessionExchangeRequest(BaseModel):
    session_id: str

class GenerateFeedRequest(BaseModel):
    lang: str = "es"
    genre: Optional[str] = None
    count: int = 5

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
async def get_current_user(request: Request) -> User:
    # --- MODO DESARROLLO: PASO LIBRE TOTAL ---
    # Ignoramos cualquier token o header, devolvemos este usuario siempre.
    return User(
        user_id="admin_dev",
        email="dev@clickbook.local",
        name="Desarrolladora",
        is_premium=True,
        created_at=datetime.now(timezone.utc)
    )
# ----------------- Auth routes -----------------
@api_router.post("/auth/session")
async def exchange_session(req: SessionExchangeRequest, response: Response):
    """Exchange Emergent session_id for a session_token stored in DB + cookie."""
    async with httpx.AsyncClient(timeout=15.0) as http_client:
        resp = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
    if resp.status_code != 200:
        logger.error(f"Emergent session-data failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=401, detail="Invalid session_id")

    data = resp.json()
    email = data["email"]
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data["session_token"]

    # Upsert user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}},
        )
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "lang": "es",
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(dict(user_doc))
        user_doc.pop("_id", None)

    # Persist session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {
            "$set": {
                "user_id": user_id,
                "session_token": session_token,
                "expires_at": expires_at,
                "created_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )

    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=7 * 24 * 60 * 60,
        path="/",
        httponly=True,
        secure=True,
        samesite="none",
    )
    return {"user": User(**user_doc).dict(), "session_token": session_token}


@api_router.get("/auth/me")
async def auth_me(user: User = Depends(get_current_user)):
    return user.dict()


@api_router.post("/auth/guest")
async def guest_login():
    """Create an anonymous guest account + session (no Google required)."""
    user_id = f"guest_{uuid.uuid4().hex[:12]}"
    session_token = f"guest_{uuid.uuid4().hex}"
    user_doc = {
        "user_id": user_id,
        "email": f"{user_id}@guest.local",
        "name": "Invitado",
        "picture": None,
        "lang": "es",
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(dict(user_doc))
    user_doc.pop("_id", None)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
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
        upsert=True,
        return_document=True,
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
        "is_premium": is_premium,
        "plays_today": plays_today,
        "limit": FREE_DAILY_AUDIO_LIMIT,
        "remaining": max(0, FREE_DAILY_AUDIO_LIMIT - plays_today) if not is_premium else None,
        "premium_until": user.premium_until.isoformat() if user.premium_until else None,
    }


@api_router.get("/config/pricing")
async def get_pricing():
    """Public pricing config — frontend uses this for paywall display."""
    return PRICING


@api_router.post("/me/upgrade")
async def upgrade_to_premium(user: User = Depends(get_current_user)):
    """DEV-MODE upgrade. Replace with real payment gateway integration later."""
    until = datetime.now(timezone.utc) + timedelta(days=30)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"is_premium": True, "premium_until": until}},
    )
    return {"ok": True, "is_premium": True, "premium_until": until.isoformat()}


@api_router.post("/me/downgrade")
async def downgrade_from_premium(user: User = Depends(get_current_user)):
    """DEV-MODE downgrade for testing the paywall."""
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"is_premium": False, "premium_until": None}},
    )
    return {"ok": True, "is_premium": False}


# ----------------- Book generation -----------------
BOOK_SYSTEM_PROMPT = (
    "Eres un experto bibliotecario con amplísimo conocimiento de literatura universal, "
    "clásicos, contemporánea, ciencia ficción, ensayo, desarrollo personal, historia y ciencia. "
    "Siempre respondes con JSON válido estricto, sin markdown, sin texto adicional."
)


async def generate_books_via_llm(count: int, exclude_titles: List[str], genre: Optional[str] = None, query: Optional[str] = None) -> List[dict]:
    if query:
        genre_hint = f"El usuario busca específicamente: '{query}' (puede ser título, autor, tema o género). Incluye libros que coincidan con esa búsqueda. "
    elif genre:
        genre_hint = f"Enfócate en el género: {genre}. "
    else:
        genre_hint = "Mezcla géneros diversos (ficción, ensayo, ciencia, historia, novela, filosofía). "
    exclude_str = "; ".join(exclude_titles[:80]) if exclude_titles else "ninguno"

    user_prompt = f"""Genera EXACTAMENTE {count} recomendaciones de libros REALES (que existen de verdad).
{genre_hint}No incluyas ninguno de estos títulos ya mostrados: {exclude_str}.

Devuelve un array JSON puro. Cada objeto debe tener EXACTAMENTE estos campos:
- title (string)
- author (string)
- year (integer, año de publicación)
- genre (string, en español)
- pages (integer, número aproximado)
- rating (float entre 3.5 y 4.9)
- synopsis_es (string, 80-120 palabras, sinopsis en español, natural y atractiva)
- synopsis_en (string, 80-120 words, synopsis in English)
- summary_es (string, 180-220 palabras, resumen real del contenido del libro en español que se pueda leer en ~1 minuto, con spoilers)
- summary_en (string, 180-220 words, actual summary of the book contents in English, ~1 minute read, with spoilers)

IMPORTANTE: Solo JSON array válido, sin backticks ni texto adicional."""
async def fetch_books_from_google(query: str, count: int = 20, exclude_titles: List[str] = None) -> List[dict]:
    """Fallback book source via Google Books API. Fast and reliable when Gemini is down."""
    exclude_titles = exclude_titles or []
    excl_lower = {t.lower() for t in exclude_titles}
    q = query or "novela bestseller"
    try:
        async with httpx.AsyncClient(timeout=6.0) as http_client:
            r = await http_client.get(
                "https://books.googleapis.com/books/v1/volumes",
                params={"q": q, "maxResults": min(40, count * 2), "langRestrict": "es", "printType": "books", "orderBy": "relevance"},
            )
        if r.status_code != 200:
            return []
        items = r.json().get("items", []) or []
        results: List[dict] = []
        for it in items:
            v = it.get("volumeInfo", {}) or {}
            title = (v.get("title") or "").strip()
            authors = v.get("authors") or []
            author = (authors[0] if authors else "Anónimo").strip()
            if not title or title.lower() in excl_lower:
                continue
            year = 2000
            pub = v.get("publishedDate", "")
            if pub:
                try: year = int(pub[:4])
                except Exception: pass
            cats = v.get("categories") or []
            genre = (cats[0] if cats else "Ficción")
            description = (v.get("description") or "").strip()
            if len(description) < 30:
                description = f"Un libro de {author} publicado en {year}."
            img_links = v.get("imageLinks") or {}
            cover = (img_links.get("thumbnail") or img_links.get("smallThumbnail") or "").replace("http://", "https://").replace("&edge=curl", "")
            rating = float(v.get("averageRating") or 4.2)
            pages = int(v.get("pageCount") or 280)
            results.append({
                "title": title, "author": author, "year": year, "genre": genre, "pages": pages, "rating": rating,
                "synopsis_es": description[:500], "synopsis_en": description[:500],
                "summary_es": description[:800] or f"Un libro fascinante de {author}.",
                "summary_en": description[:800] or f"A fascinating book by {author}.",
                "tema": "—", "tono": "—", "trope": "—", "complejidad": "Media", "es_saga": "No",
                "contenido_sensible": "—", "publico": "General", "edad": "+12",
                "_cover_from_google": cover,
            })
            if len(results) >= count:
                break
        return results
    except Exception as e:
        logger.warning(f"Google Books fallback failed: {e}")
        return []
        
async def get_books_feed(
    query: Optional[str] = None, 
    genre: Optional[str] = None, 
    count: int = 10, 
    existing: Optional[list] = None, 
    seen_ids: Optional[Set[str]] = None
):
    # Inicialización correcta de mutables para proteger el historial de tus usuarios
    existing = existing or []
    seen_ids = seen_ids or set()
    
    # Títulos que ya tenemos en el feed para no duplicar en esta misma llamada
    local_excluded_titles = {b.get("title", "").lower() for b in existing}

    # Intentos máximos para evitar bucles infinitos si las APIs fallan o van lentas
    max_attempts = 3  
    attempt = 0

    while len(existing) < count and attempt < max_attempts:
        attempt += 1
        need = count - len(existing)
        raw: List[dict] = []

        # 1. PRIMERA OPCIÓN (VÍA DIRECTA Y RÁPIDA): Google Books directo
        try:
            gb_query = query or genre or "novela bestseller en español"
            # Pedimos un exceso generoso para compensar filtros
            raw = await fetch_books_from_google(
                gb_query, 
                count=need + 5, 
                exclude_titles=list(local_excluded_titles)
            )
        except Exception as e:
            logger.warning(f"Google Books call failed on attempt {attempt}: {e}")
            raw = []

        # 2. PLAN B (RESPALDO): IA si Google no aportó lo suficiente
        if len(raw) < need:
            try:
                ai_count = max(need + 5, 5)
                ai_books = await generate_books_via_llm(
                    count=ai_count, 
                    exclude_titles=list(local_excluded_titles), 
                    genre=genre, 
                    query=query
                )
                # Combinar evitando duplicados internos de esta tanda
                current_raw_titles = {b.get("title", "").lower() for b in raw}
                for ab in ai_books:
                    if ab.get("title", "").lower() not in current_raw_titles:
                        raw.append(ab)
            except Exception as e:
                logger.warning(f"Backup AI generation failed on attempt {attempt}: {e}")

        # Si ninguna fuente dio libros en ESTE intento, pasamos al siguiente gracias al 'continue'
        if not raw:
            continue

        # 3. Guardar en base de datos y filtrar por historial del usuario (seen_ids)
        new_books = await persist_books(raw)
        
        for b in new_books:
            b_dict = b.dict()
            title_lower = b_dict.get("title", "").lower()
            
            # Filtramos: que no esté en seen_ids Y que no lo hayamos metido ya en este feed
            if b.book_id not in seen_ids and title_lower not in local_excluded_titles:
                existing.append(b_dict)
                local_excluded_titles.add(title_lower)
                
                # Si ya llenamos el feed con los 10 que queríamos, no procesamos más
                if len(existing) >= count:
                    break

    # Si después de los intentos no hay nada en absoluto en el feed
    if not existing:
        raise HTTPException(503, "No hay libros disponibles en este momento. Por favor, inténtalo de nuevo.")

    return {"books": existing[:count]}
    

async def lookup_cover(title: str, author: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=8.0) as http_client:
            r = await http_client.get(
                "https://openlibrary.org/search.json",
                params={"title": title, "author": author, "limit": 1},
            )
        if r.status_code == 200:
            docs = r.json().get("docs", [])
            if docs:
                cover_i = docs[0].get("cover_i")
                if cover_i:
                    return f"https://covers.openlibrary.org/b/id/{cover_i}-L.jpg"
    except Exception as e:
        logger.warning(f"Cover lookup failed for {title}: {e}")
    return None


def build_store_urls(title: str, author: str) -> dict:
    q = f"{title} {author}".strip()
    from urllib.parse import quote_plus
    qe = quote_plus(q)
    amazon = f"https://www.amazon.es/s?k={qe}&i=stripbooks"
    if AFFILIATE_AMAZON_TAG:
        amazon += f"&tag={AFFILIATE_AMAZON_TAG}"
    casa = f"https://www.google.com/search?q={qe}+site%3Acasadellibro.com"
    if AFFILIATE_CASA_LIBRO:
        casa += f"&aff={AFFILIATE_CASA_LIBRO}"
    return {
        "amazon_url": amazon,
        "casa_del_libro_url": casa,
        "google_books_url": f"https://www.google.com/search?tbm=bks&q={qe}",
    }


async def persist_books(raw_books: List[dict]) -> List[Book]:
    if not raw_books:
        return []
    # Step 1: Pre-process and filter existing
    candidates = []
    saved: List[Book] = []
    
    for rb in raw_books:
        title = str(rb.get("title", "")).strip()
        author = str(rb.get("author", "")).strip()
        if not title: continue
        
        existing = await db.books.find_one({"title": title, "author": author})
        if existing:
            saved.append(Book(**existing))
            continue
            
        rb["_title_clean"] = title
        rb["_author_clean"] = author
        candidates.append(rb)

    if not candidates:
        return saved

    # Step 2: Parallel cover lookup (asyncio.gather) for books WITHOUT a Google Books cover
    cover_tasks = [
        lookup_cover(c["_title_clean"], c["_author_clean"]) if not c.get("_cover_from_google") else asyncio.sleep(0, result=c["_cover_from_google"])
        for c in candidates
    ]
    covers = await asyncio.gather(*cover_tasks, return_exceptions=True)

    # Step 3: Create and save new books
    new_docs = []
    for i, rb in enumerate(candidates):
        cover = covers[i] if not isinstance(covers[i], Exception) else None
        if not cover:
            cover = f"https://placeholder.co/600x900/221A13/C48B47/png?text={rb['_title_clean']}"
            
        book_dict = {
            "book_id": f"bk_{uuid.uuid4().hex[:12]}",
            "title": rb["_title_clean"],
            "author": rb["_author_clean"],
            "year": int(rb.get("year", 2000)),
            "genre": str(rb.get("genre", "Ficción")),
            "pages": int(rb.get("pages", 280)),
            "rating": float(rb.get("rating", 4.2)),
            "synopsis_es": rb.get("synopsis_es", ""),
            "synopsis_en": rb.get("synopsis_en", ""),
            "summary_es": rb.get("summary_es", ""),
            "summary_en": rb.get("summary_en", ""),
            "cover_url": cover,
            "tema": rb.get("tema", "—"),
            "tono": rb.get("tono", "—"),
            "trope": rb.get("trope", "—"),
            "complejidad": rb.get("complejidad", "Media"),
            "es_saga": rb.get("es_saga", "No"),
            "contenido_sensible": rb.get("contenido_sensible", "—"),
            "publico": rb.get("publico", "General"),
            "edad": rb.get("edad", "+12"),
            **build_store_urls(rb["_title_clean"], rb["_author_clean"])
        }
        new_docs.append(book_dict)

    if new_docs:
        await db.books.insert_many(new_docs)
        for d in new_docs:
            saved.append(Book(**d))

    return saved


# ----------------- Book routes -----------------
# --- RUTA DE FEED (ESENCIAL QUE ESTÉ AQUÍ PARA QUE NO DÉ 404) ---
@api_router.get("/books/feed")
async def books_feed(count: int = 30):
    # Esto busca TODOS los libros, sin importar el título, género o nada.
    # Si hay libros ahí, el servidor los encontrará.
    books = await db.books.find({}, {"_id": 0}).limit(count).to_list(length=count)
    
    # Esto nos ayudará a saber si el servidor ve algo
    print(f"DEBUG: El servidor ha encontrado {len(books)} libros.")
    
    return {"books": books}

# --- RUTA DE BÚSQUEDA ---
@api_router.get("/books/search")
async def search_books(query: str):
    cursor = db.books.find({
        "$or": [
            {"title": {"$regex": query, "$options": "i"}},
            {"author": {"$regex": query, "$options": "i"}},
            {"genre": {"$regex": query, "$options": "i"}},
            {"tema": {"$regex": query, "$options": "i"}}
        ]
    }, {"_id": 0})
    
    books = await cursor.to_list(length=100)
    return {"books": books}
# --- RUTA DE INTERACCIÓN ---
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

# --- RUTA DE FAVORITOS ---
@api_router.get("/favorites")
async def get_favorites(user: User = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no autenticado")
    favs = await db.user_interactions.find({"user_id": user.user_id, "action": "like"}, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    book_ids = [f["book_id"] for f in favs]
    if not book_ids:
        return {"books": []}
    books = await db.books.find({"book_id": {"$in": book_ids}}, {"_id": 0}).to_list(1000)
    order = {bid: i for i, bid in enumerate(book_ids)}
    books.sort(key=lambda b: order.get(b["book_id"], 9999))
    return {"books": books}

# --- RUTA DE LIBRO ESPECÍFICO (VA DEBAJO DEL FEED) ---
@api_router.get("/books/{book_id}")
async def get_book(book_id: str, user: User = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no autenticado")
    book = await db.books.find_one({"book_id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(status_code=404, detail=f"Libro con ID {book_id} no encontrado")
    return book

# --- RUTAS DE UTILIDAD ---
@api_router.delete("/favorites/{book_id}")
async def remove_favorite(book_id: str, user: User = Depends(get_current_user)):
    await db.user_interactions.delete_one({"user_id": user.user_id, "book_id": book_id, "action": "like"})
    return {"ok": True}

@api_router.post("/books/reset")
async def reset_history(user: User = Depends(get_current_user)):
    await db.user_interactions.delete_many({"user_id": user.user_id, "action": "dislike"})
    return {"ok": True}

# ----------------- TTS -----------------
# Google Cloud TTS — voces es-ES Neural2 nativas peninsulares
GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
VOICE_FEMENINA = "es-ES-Neural2-C"
VOICE_MASCULINA = "es-ES-Neural2-B"


def select_voice_for_genre(genre: str | None) -> str:
    """Voz femenina por defecto (ficción, novela, autoayuda, salud, biografías).
    Voz masculina para negocios/finanzas/historia/ciencia/tecnología."""
    g = (genre or "").lower()
    fiction_keywords = [
        "ficción", "ficcion", "novela", "fantas", "thriller", "misterio",
        "romance", "poes", "drama", "literatura",
    ]
    female_keywords = [
        "autoayuda", "crecimiento personal", "salud", "bienestar",
        "biograf", "memorias", "espiritual", "psicolog",
    ]
    male_keywords = [
        "negocio", "finanz", "histor", "cienc", "tecnolog",
        "econom", "invers", "emprend", "lider", "ensayo", "polít", "polit",
    ]
    if any(k in g for k in fiction_keywords) or any(k in g for k in female_keywords):
        return VOICE_FEMENINA
    if any(k in g for k in male_keywords):
        # ciencia ficción siempre cuenta como femenina (ficción)
        if "ficción" in g or "ficcion" in g:
            return VOICE_FEMENINA
        return VOICE_MASCULINA
    return VOICE_FEMENINA  # default


async def google_tts_synthesize(text: str, voice_name: str, lang: str = "es-ES") -> str:
    """Calls Google Cloud TTS REST API. Returns base64 MP3 string."""
    if not GOOGLE_TTS_API_KEY:
        raise HTTPException(500, "GOOGLE_TTS_API_KEY not configured")
    payload = {
        "input": {"text": text},
        "voice": {"languageCode": lang, "name": voice_name},
        "audioConfig": {
            "audioEncoding": "MP3",
            "speakingRate": 1.05,
            "pitch": 0.0,
        },
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{GOOGLE_TTS_URL}?key={GOOGLE_TTS_API_KEY}",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
    if r.status_code != 200:
        logger.error(f"Google TTS error {r.status_code}: {r.text[:300]}")
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
    # Daily limit gating for non-premium users (always counts plays, even cached)
    is_premium = _is_premium_active(user)
    if not is_premium:
        plays_today = await _get_today_audio_count(user.user_id)
        if plays_today >= FREE_DAILY_AUDIO_LIMIT:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "daily_limit_reached",
                    "message": f"Has alcanzado tu límite diario de {FREE_DAILY_AUDIO_LIMIT} audios. Hazte Premium para escuchar ilimitados.",
                    "plays_today": plays_today,
                    "limit": FREE_DAILY_AUDIO_LIMIT,
                },
            )

    # Resolve voice: explicit > genre-based > default femenina
    book_genre = None
    if req.book_id:
        book_doc = await db.books.find_one({"book_id": req.book_id}, {"genre": 1, "title": 1})
        if book_doc:
            book_genre = book_doc.get("genre")

    explicit_voice = req.voice and req.voice not in ("fable", "alloy", "echo", "onyx", "nova", "shimmer")
    if explicit_voice:
        voice_name = req.voice
    else:
        voice_name = select_voice_for_genre(book_genre)

    # Cache key: book_id + sanitized voice + lang
    cache_field = None
    cached_audio = None
    if req.book_id:
        cache_field = f"audio_{_safe_voice_field(voice_name)}_{req.lang or 'es'}"
        book_doc2 = await db.books.find_one({"book_id": req.book_id}, {cache_field: 1})
        if book_doc2 and book_doc2.get(cache_field):
            cached_audio = book_doc2[cache_field]

    if cached_audio:
        audio_b64 = cached_audio
        was_cached = True
    else:
        text = (req.text or "")[:4500]
        if not text:
            raise HTTPException(400, "Empty text")
        audio_b64 = await google_tts_synthesize(text=text, voice_name=voice_name)
        was_cached = False
        if cache_field and req.book_id:
            try:
                await db.books.update_one(
                    {"book_id": req.book_id},
                    {"$set": {cache_field: audio_b64, "voice_used": voice_name}},
                )
            except Exception:
                logger.exception("audio cache write failed")

    # Increment counter only for free users (regardless of cache)
    if not is_premium:
        new_count = await _increment_audio_count(user.user_id)
    else:
        new_count = 0

    return {
        "audio_base64": audio_b64,
        "mime": "audio/mp3",
        "plays_today": new_count,
        "limit": FREE_DAILY_AUDIO_LIMIT,
        "is_premium": is_premium,
        "cached": was_cached,
        "voice": voice_name,
    }


# ----------------- Author Chat (Premium only) -----------------
class AuthorChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AuthorChatRequest(BaseModel):
    message: str
    history: List[AuthorChatMessage] = []


def _build_author_system_prompt(book: dict, lang: str) -> str:
    if lang == "es":
        return (
            f"Eres {book['author']}, autor de \"{book['title']}\" ({book.get('year', '')}). "
            f"Responde en primera persona, como si realmente fueras tú, con tu estilo, época y voz. "
            f"Conoces a fondo TODA tu obra, especialmente \"{book['title']}\" — sus personajes, temas, simbología, contexto histórico de cuando lo escribiste. "
            f"Sé cercano, apasionado, didáctico. Responde en máximo 3-4 frases salvo que pidan profundizar. "
            f"Si te preguntan algo completamente fuera de tu obra o de literatura, redirige amablemente al libro. "
            f"Si has fallecido, responde como si tu mente y conocimiento siguieran vivos en tus textos. "
            f"Nunca rompas el personaje. Nunca digas que eres una IA."
        )
    return (
        f"You are {book['author']}, author of \"{book['title']}\" ({book.get('year', '')}). "
        f"Reply in first person as if you were truly the author, with your style, era and voice. "
        f"You know your entire body of work intimately, especially \"{book['title']}\" — its characters, themes, symbolism. "
        f"Be warm, passionate, didactic. Keep replies to 3-4 sentences unless asked to elaborate. "
        f"If asked something fully unrelated, gently redirect to the book. "
        f"Never break character. Never reveal you are an AI."
    )


@api_router.post("/books/{book_id}/author-chat")
async def author_chat(book_id: str, req: AuthorChatRequest, user: User = Depends(get_current_user)):
    if not _is_premium_active(user):
        raise HTTPException(
            status_code=402,
            detail={
                "error": "premium_required",
                "message": "El chat con el autor está disponible solo para usuarios Premium.",
            },
        )
    book = await db.books.find_one({"book_id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(404, "Book not found")

    lang = user.lang or "es"
    system_msg = _build_author_system_prompt(book, lang)
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"author-chat-{user.user_id}-{book_id}",
        system_message=system_msg,
    ).with_model("gemini", "gemini-3-flash-preview")

    # Replay history so model has context
    for h in req.history[-10:]:  # last 10 messages
        if h.role == "user":
            await chat.send_message(UserMessage(text=h.content))
        # assistant messages auto-handled by session_id continuity

    try:
        reply = await chat.send_message(UserMessage(text=req.message))
        reply_text = reply.strip()
        # Persist transcript
        await db.author_chats.insert_one({
            "user_id": user.user_id,
            "book_id": book_id,
            "user_message": req.message,
            "assistant_reply": reply_text,
            "created_at": datetime.now(timezone.utc),
        })
        return {"reply": reply_text}
    except Exception as e:
        logger.exception("Author chat failed")
        raise HTTPException(500, f"Author chat failed: {e}")


# ----------------- Premium Summary (audio script) -----------------
PREMIUM_SUMMARY_PROMPT_ES = """Actúa como un crítico de libros experto en storytelling. 
Escribe un guion de 150-180 palabras (1 minuto de lectura) para el libro "{title}" de {author}.

DATOS REALES DEL LIBRO (úsalos, no inventes nada):
- Género: {genre}
- Tema principal: {tema}
- Tono: {tono}
- Público: {publico}
- Edad recomendada: {edad}
- Contenido sensible: {contenido_sensible}
- Emociones que genera: {emociones}
- Hook del libro: {hook}

Estructura:
1. Enganche (10 seg): Empieza con una pregunta provocadora basada en el tema real.
2. De qué va (30 seg): Explica sin spoilers, enfocándote en la emoción que genera.
3. Para quién es (20 seg): Define el lector ideal basándote en público y tono.

Reglas:
- Tono dinámico, directo, estilo TikTok
- Frases cortas, párrafo fluido (será voz sintética)
- NO empieces con "Este libro trata sobre..."
- Devuelve SOLO el texto, sin títulos ni etiquetas"""

@api_router.get("/books/{book_id}/premium-summary")
async def premium_summary(book_id: str, lang: str = "es", user: User = Depends(get_current_user)):
    book = await db.books.find_one({"book_id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(404, "Book not found")

    # Lee directamente el resumen escrito por nosotros
    resumen = book.get("resumen_audio")
    if resumen:
        return {"summary": resumen, "lang": lang, "cached": True}

    # Fallback si el libro aún no tiene resumen_audio
    fallback = book.get("hook", "Resumen no disponible aún.")
    return {"summary": fallback, "lang": lang, "cached": False}


# ----------------- Health -----------------
from fastapi.responses import FileResponse  # noqa: E402  (kept for potential future use)


# (Endpoint /api/dev/sample/* eliminado: era solo para audicionar voces durante el desarrollo)
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
