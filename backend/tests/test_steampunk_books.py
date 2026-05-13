"""Backend tests for Steampunk/Vapor & Tinta book discovery API."""
import os
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://book-swipe-1.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

REQUIRED_BOOK_FIELDS = [
    "book_id", "title", "author", "year", "genre", "pages", "rating",
    "synopsis_es", "synopsis_en", "summary_es", "summary_en",
    "cover_url", "amazon_url", "casa_del_libro_url", "google_books_url",
]


@pytest.fixture(scope="module")
def mongo_db():
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


@pytest.fixture(scope="module")
def session(mongo_db):
    """Create a TEST session directly in Mongo and yield headers."""
    ts = int(time.time() * 1000)
    user_id = f"TEST_user_{ts}"
    token = f"TEST_session_{ts}"
    mongo_db.users.insert_one({
        "user_id": user_id,
        "email": f"TEST_{ts}@example.com",
        "name": "TEST User",
        "picture": None,
        "lang": "es",
        "created_at": datetime.now(timezone.utc),
    })
    mongo_db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    yield {"headers": headers, "user_id": user_id, "token": token}
    # Cleanup
    mongo_db.user_sessions.delete_many({"user_id": user_id})
    mongo_db.users.delete_many({"user_id": user_id})
    mongo_db.user_interactions.delete_many({"user_id": user_id})


# --- Health ---
def test_healthcheck():
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"
    assert body.get("app") == "Steampunk Books"


# --- Auth ---
def test_auth_me_no_token_returns_401():
    r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 401


def test_auth_me_invalid_token_returns_401():
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": "Bearer bogus_token_xyz"}, timeout=15)
    assert r.status_code == 401


def test_auth_me_with_valid_token(session):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=session["headers"], timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["user_id"] == session["user_id"]
    assert data["email"].startswith("TEST_")
    assert data["lang"] in ("es", "en")


def test_auth_lang_update(session):
    r = requests.patch(f"{BASE_URL}/api/auth/lang",
                       headers=session["headers"], json={"lang": "en"}, timeout=15)
    assert r.status_code == 200
    assert r.json() == {"ok": True, "lang": "en"}
    # verify via /auth/me
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=session["headers"], timeout=15).json()
    assert me["lang"] == "en"
    # restore
    r2 = requests.patch(f"{BASE_URL}/api/auth/lang",
                        headers=session["headers"], json={"lang": "es"}, timeout=15)
    assert r2.status_code == 200


def test_auth_lang_invalid_value(session):
    r = requests.patch(f"{BASE_URL}/api/auth/lang",
                       headers=session["headers"], json={"lang": "fr"}, timeout=15)
    assert r.status_code == 400


# --- Feed (Gemini) - ordered ---
def test_books_feed_returns_3_books(session):
    r = requests.get(f"{BASE_URL}/api/books/feed?count=3",
                     headers=session["headers"], timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    books = data.get("books", [])
    assert len(books) == 3, f"Expected 3 books, got {len(books)}"
    for b in books:
        for f in REQUIRED_BOOK_FIELDS:
            assert f in b and b[f] not in (None, ""), f"Missing/empty field {f} in {b.get('title')}"
        assert isinstance(b["year"], int)
        assert isinstance(b["pages"], int)
        assert isinstance(b["rating"], (int, float))
        assert b["amazon_url"].startswith("https://www.amazon.com/")
        assert "casadellibro.com" in b["casa_del_libro_url"]
        assert "google.com" in b["google_books_url"]
    # Stash for next tests
    pytest.first_feed_books = books


def test_books_interact_like_and_dislike(session):
    books = getattr(pytest, "first_feed_books", [])
    assert len(books) >= 2
    like_book = books[0]
    dislike_book = books[1]
    r1 = requests.post(f"{BASE_URL}/api/books/interact",
                       headers=session["headers"],
                       json={"book_id": like_book["book_id"], "action": "like"}, timeout=15)
    assert r1.status_code == 200
    r2 = requests.post(f"{BASE_URL}/api/books/interact",
                       headers=session["headers"],
                       json={"book_id": dislike_book["book_id"], "action": "dislike"}, timeout=15)
    assert r2.status_code == 200
    pytest.liked_book_id = like_book["book_id"]
    pytest.disliked_book_id = dislike_book["book_id"]


def test_books_interact_invalid_action(session):
    r = requests.post(f"{BASE_URL}/api/books/interact",
                      headers=session["headers"],
                      json={"book_id": "x", "action": "maybe"}, timeout=15)
    assert r.status_code == 400


def test_get_favorites_returns_liked(session):
    r = requests.get(f"{BASE_URL}/api/favorites", headers=session["headers"], timeout=15)
    assert r.status_code == 200
    fav_ids = [b["book_id"] for b in r.json()["books"]]
    assert pytest.liked_book_id in fav_ids
    assert pytest.disliked_book_id not in fav_ids


def test_feed_pagination_excludes_interacted(session):
    # Mark the third book as disliked so all 3 from first feed are interacted
    third = pytest.first_feed_books[2]
    requests.post(f"{BASE_URL}/api/books/interact", headers=session["headers"],
                  json={"book_id": third["book_id"], "action": "dislike"}, timeout=15)
    pytest.disliked_book_id_2 = third["book_id"]
    r = requests.get(f"{BASE_URL}/api/books/feed?count=3",
                     headers=session["headers"], timeout=120)
    assert r.status_code == 200
    new_books = r.json()["books"]
    seen_ids = {b["book_id"] for b in pytest.first_feed_books}
    new_ids = {b["book_id"] for b in new_books}
    overlap = seen_ids & new_ids
    assert not overlap, f"Feed returned already-interacted books: {overlap}"
    assert len(new_books) == 3


def test_delete_favorite(session):
    r = requests.delete(f"{BASE_URL}/api/favorites/{pytest.liked_book_id}",
                        headers=session["headers"], timeout=15)
    assert r.status_code == 200
    favs = requests.get(f"{BASE_URL}/api/favorites", headers=session["headers"], timeout=15).json()
    assert pytest.liked_book_id not in [b["book_id"] for b in favs["books"]]


def test_books_reset_clears_dislikes(session, mongo_db):
    # confirm dislike exists
    d = mongo_db.user_interactions.find_one(
        {"user_id": session["user_id"], "action": "dislike"})
    assert d is not None
    r = requests.post(f"{BASE_URL}/api/books/reset", headers=session["headers"], timeout=15)
    assert r.status_code == 200
    d2 = mongo_db.user_interactions.find_one(
        {"user_id": session["user_id"], "action": "dislike"})
    assert d2 is None


# --- TTS ---
def test_tts_returns_base64(session):
    r = requests.post(f"{BASE_URL}/api/tts", headers=session["headers"],
                      json={"text": "Hola, esto es una prueba de audio.", "voice": "fable"},
                      timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "audio_base64" in body
    assert body.get("mime") == "audio/mp3"
    assert len(body["audio_base64"]) > 500  # non-trivial payload


# --- Logout (last) ---
def test_logout_clears_session(mongo_db):
    ts = int(time.time() * 1000)
    user_id = f"TEST_logout_user_{ts}"
    token = f"TEST_logout_session_{ts}"
    mongo_db.users.insert_one({
        "user_id": user_id, "email": f"TEST_logout_{ts}@example.com",
        "name": "TEST", "picture": None, "lang": "es",
        "created_at": datetime.now(timezone.utc),
    })
    mongo_db.user_sessions.insert_one({
        "user_id": user_id, "session_token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{BASE_URL}/api/auth/logout", headers=headers, timeout=15)
    assert r.status_code == 200
    # session should be gone
    assert mongo_db.user_sessions.find_one({"session_token": token}) is None
    # auth/me should now 401
    r2 = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=15)
    assert r2.status_code == 401
    mongo_db.users.delete_one({"user_id": user_id})
