import os
import json
import uuid
import base64
import logging
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional

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

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user_doc)


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

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"book-gen-{uuid.uuid4().hex[:8]}",
        system_message=BOOK_SYSTEM_PROMPT,
    ).with_model("gemini", "gemini-3-flash-preview")

    response_text = await chat.send_message(UserMessage(text=user_prompt))
    # Strip potential markdown fences
    cleaned = response_text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    # Try to locate JSON array
    m = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if m:
        cleaned = m.group(0)
    try:
        data = json.loads(cleaned)
    except Exception as e:
        logger.error(f"Failed to parse LLM JSON: {e}\nRaw: {response_text[:500]}")
        raise HTTPException(500, "Error parsing book recommendations")

    if not isinstance(data, list):
        raise HTTPException(500, "Malformed LLM output")
    return data


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
    return {
        "amazon_url": f"https://www.amazon.com/s?k={qe}&i=stripbooks",
        "casa_del_libro_url": f"https://www.casadellibro.com/busqueda-generica.php?busqueda={qe}",
        "google_books_url": f"https://www.google.com/search?tbm=bks&q={qe}",
    }


async def persist_books(raw_books: List[dict]) -> List[Book]:
    saved: List[Book] = []
    for rb in raw_books:
        try:
            title = str(rb["title"]).strip()
            author = str(rb["author"]).strip()
        except Exception:
            continue
        existing = await db.books.find_one({"title": title, "author": author}, {"_id": 0})
        if existing:
            saved.append(Book(**existing))
            continue
        cover = await lookup_cover(title, author)
        if not cover:
            cover = f"https://placehold.co/600x900/221A13/C48B47/png?text={title.replace(' ', '+')[:40]}"
        store_urls = build_store_urls(title, author)
        book = {
            "book_id": f"bk_{uuid.uuid4().hex[:12]}",
            "title": title,
            "author": author,
            "year": int(rb.get("year", 2000)),
            "genre": str(rb.get("genre", "Ficción")),
            "pages": int(rb.get("pages", 300)),
            "rating": float(rb.get("rating", 4.2)),
            "synopsis_es": str(rb.get("synopsis_es", "")),
            "synopsis_en": str(rb.get("synopsis_en", "")),
            "summary_es": str(rb.get("summary_es", "")),
            "summary_en": str(rb.get("summary_en", "")),
            "cover_url": cover,
            **store_urls,
            "created_at": datetime.now(timezone.utc),
        }
        await db.books.insert_one(dict(book))
        book.pop("_id", None)
        saved.append(Book(**book))
    return saved


# ----------------- Book routes -----------------
@api_router.get("/books/feed")
async def books_feed(count: int = 5, genre: Optional[str] = None, query: Optional[str] = None, user: User = Depends(get_current_user)):
    # Books user has interacted with
    interactions = await db.user_interactions.find({"user_id": user.user_id}, {"_id": 0, "book_id": 1}).to_list(10000)
    seen_ids = {i["book_id"] for i in interactions}

    # If query is provided, try existing matches first
    mongo_query: dict = {"book_id": {"$nin": list(seen_ids)}}
    if query:
        q = {"$regex": query, "$options": "i"}
        mongo_query["$or"] = [{"title": q}, {"author": q}, {"genre": q}]
    elif genre:
        mongo_query["genre"] = {"$regex": genre, "$options": "i"}
    existing = await db.books.find(mongo_query, {"_id": 0}).to_list(count)

    if len(existing) >= count:
        return {"books": existing[:count]}

    # Generate more
    need = count - len(existing)
    all_titles_docs = await db.books.find({}, {"_id": 0, "title": 1}).to_list(500)
    exclude_titles = [d["title"] for d in all_titles_docs]
    try:
        raw = await generate_books_via_llm(count=max(need + 2, 5), exclude_titles=exclude_titles, genre=genre, query=query)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Generation failed")
        if existing:
            return {"books": existing}
        raise HTTPException(500, f"Generation failed: {e}")

    new_books = await persist_books(raw)
    combined = existing + [b.dict() for b in new_books if b.book_id not in seen_ids]
    return {"books": combined[:count]}


@api_router.post("/books/interact")
async def interact(body: dict, user: User = Depends(get_current_user)):
    book_id = body.get("book_id")
    action = body.get("action")  # 'like', 'dislike'
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
    books = await db.books.find({"book_id": {"$in": book_ids}}, {"_id": 0}).to_list(1000)
    # Preserve order
    order = {bid: i for i, bid in enumerate(book_ids)}
    books.sort(key=lambda b: order.get(b["book_id"], 9999))
    return {"books": books}


@api_router.delete("/favorites/{book_id}")
async def remove_favorite(book_id: str, user: User = Depends(get_current_user)):
    await db.user_interactions.delete_one({"user_id": user.user_id, "book_id": book_id, "action": "like"})
    return {"ok": True}


@api_router.post("/books/reset")
async def reset_history(user: User = Depends(get_current_user)):
    """Clear discard history (keeps favorites)."""
    await db.user_interactions.delete_many({"user_id": user.user_id, "action": "dislike"})
    return {"ok": True}


# ----------------- TTS -----------------
@api_router.post("/tts")
async def tts_generate(req: TTSRequest, user: User = Depends(get_current_user)):
    text = req.text[:4000]
    try:
        tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio_b64 = await tts.generate_speech_base64(text=text, model="tts-1", voice=req.voice)
        return {"audio_base64": audio_b64, "mime": "audio/mp3"}
    except Exception as e:
        logger.exception("TTS failed")
        raise HTTPException(500, f"TTS failed: {e}")


# ----------------- Health -----------------
@api_router.get("/")
async def root():
    return {"status": "ok", "app": "Steampunk Books"}


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
