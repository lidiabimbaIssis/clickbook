# Vapor & Tinta — PRD

## Overview
Mobile-first Tinder-style book discovery app with a steampunk aesthetic. Users swipe through AI-curated book recommendations, save favorites, listen to 1-minute summaries with TTS, and jump to Amazon / Casa del Libro / Google Books to buy.

## Tech
- Frontend: Expo SDK 54 + expo-router, React Native gestures (PanResponder + Animated), expo-audio, AsyncStorage
- Backend: FastAPI + Motor + MongoDB
- AI: Gemini 3 Flash (book generation) via emergentintegrations + Emergent LLM Key
- TTS: OpenAI TTS (`tts-1`, voice `fable`) via emergentintegrations
- Auth: Emergent-managed Google OAuth (hash session_id exchange, Bearer/cookie tokens)
- Covers: Open Library Search API with placeholder fallback

## Key flows
1. Google login (Emergent) → session_token stored in AsyncStorage + httpOnly cookie
2. Discover stack: swipe left → discard, right → like, up → "ficha técnica" (parchment overlay), down → 1-minute summary with TTS play/pause
3. Favorites tab: list of saved books with Amazon buy + remove
4. Settings: language toggle (ES/EN), reset dislike history, logout

## Endpoints
- `POST /api/auth/session` exchange session_id → user+token
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `PATCH /api/auth/lang`
- `GET /api/books/feed?count=N&genre=...`
- `POST /api/books/interact` (like/dislike)
- `POST /api/books/reset`
- `GET /api/favorites`
- `DELETE /api/favorites/{book_id}`
- `POST /api/tts`

## Collections
- `users { user_id, email, name, picture, lang, created_at }`
- `user_sessions { user_id, session_token, expires_at, created_at }`
- `books { book_id, title, author, year, genre, pages, rating, synopsis_es/en, summary_es/en, cover_url, amazon_url, casa_del_libro_url, google_books_url }`
- `user_interactions { user_id, book_id, action, updated_at }`

## Smart business lever
Affiliate-ready buy links (Amazon/Casa del Libro/Google Books) — swap the search URL for a tagged affiliate URL to monetize every purchase triggered by a saved favorite.
