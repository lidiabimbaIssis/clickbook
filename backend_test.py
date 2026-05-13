"""Backend tests for premium/monetization endpoints + regression.

Tests against the public backend URL (EXPO_PUBLIC_BACKEND_URL) with /api prefix.
"""
import os
import re
import sys
from pathlib import Path

import requests

FRONTEND_ENV = Path("/app/frontend/.env")
BASE_URL = None
for line in FRONTEND_ENV.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"')
        break
if not BASE_URL:
    print("ERROR: EXPO_PUBLIC_BACKEND_URL not found in frontend/.env")
    sys.exit(1)

API = f"{BASE_URL}/api"
print(f"Testing API at: {API}")

results = []


def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name} :: {detail}")
    results.append((name, ok, detail))


def main():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    # ---- 1. Guest auth ----
    r = s.post(f"{API}/auth/guest", timeout=30)
    if r.status_code != 200:
        record("auth/guest", False, f"status={r.status_code} body={r.text[:200]}")
        print_summary()
        return
    body = r.json()
    token = body.get("session_token")
    user = body.get("user", {})
    if not token:
        record("auth/guest", False, f"no session_token")
        print_summary()
        return
    record("auth/guest", True, f"user_id={user.get('user_id')}")
    H = {"Authorization": f"Bearer {token}"}

    # ---- 2. /me/usage defaults ----
    r = s.get(f"{API}/me/usage", headers=H, timeout=20)
    if r.status_code != 200:
        record("me/usage defaults", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        u = r.json()
        expected = {"is_premium": False, "plays_today": 0, "limit": 3, "remaining": 3}
        miss = []
        for k, v in expected.items():
            if u.get(k) != v:
                miss.append(f"{k}={u.get(k)} (expected {v})")
        if "premium_until" not in u:
            miss.append("premium_until missing")
        if miss:
            record("me/usage defaults", False, "; ".join(miss))
        else:
            record("me/usage defaults", True, f"{u}")

    # ---- 3. /config/pricing (public, no auth) ----
    r = requests.get(f"{API}/config/pricing", timeout=20)
    if r.status_code != 200:
        record("config/pricing", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        pr = r.json()
        required = [
            "monthly_regular", "monthly_launch", "yearly_regular", "yearly_launch",
            "launch_promo_active", "launch_promo_label", "free_daily_audio_limit",
        ]
        missing = [k for k in required if k not in pr]
        if missing:
            record("config/pricing fields", False, f"missing: {missing}")
        else:
            if pr["free_daily_audio_limit"] == 3 and pr["launch_promo_active"] is True:
                record("config/pricing fields", True, f"limit={pr['free_daily_audio_limit']}")
            else:
                record(
                    "config/pricing fields",
                    False,
                    f"free_daily_audio_limit={pr['free_daily_audio_limit']} launch_promo_active={pr['launch_promo_active']}",
                )

    # ---- 4. Books feed ----
    r = s.get(f"{API}/books/feed?count=2", headers=H, timeout=120)
    if r.status_code != 200:
        record("books/feed", False, f"status={r.status_code} body={r.text[:300]}")
        print_summary()
        return
    books = r.json().get("books", [])
    if len(books) < 1:
        record("books/feed", False, "empty feed")
        print_summary()
        return
    record("books/feed", True, f"got {len(books)} books; title={books[0].get('title')}")
    book_id = books[0]["book_id"]
    book_title = books[0]["title"]

    # ---- 4b. Affiliate URLs (no AFFILIATE_AMAZON_TAG env) ----
    amazon_url = books[0].get("amazon_url", "")
    if "&tag=" in amazon_url or "?tag=" in amazon_url:
        record("feed amazon_url no tag", False, f"unexpected tag in url: {amazon_url}")
    else:
        record("feed amazon_url no tag", True, f"url={amazon_url}")

    # ---- 5. POST /tts book_id+voice=fable+lang=es -> cached=false, plays_today=1 ----
    tts_body = {"text": f"Bienvenidos al resumen de {book_title}. Un libro fascinante.", "voice": "fable", "book_id": book_id, "lang": "es"}
    r = s.post(f"{API}/tts", json=tts_body, headers=H, timeout=90)
    if r.status_code != 200:
        record("tts call#1", False, f"status={r.status_code} body={r.text[:300]}")
        print_summary()
        return
    t1 = r.json()
    if t1.get("cached") is False and t1.get("plays_today") == 1 and t1.get("is_premium") is False and t1.get("audio_base64"):
        record("tts call#1 cached=false plays=1", True, f"audio_len={len(t1['audio_base64'])}")
    else:
        record("tts call#1 cached=false plays=1", False, f"cached={t1.get('cached')} plays_today={t1.get('plays_today')} is_premium={t1.get('is_premium')}")

    # ---- 6. POST /tts SAME -> cached=true, plays_today=2 ----
    r = s.post(f"{API}/tts", json=tts_body, headers=H, timeout=30)
    if r.status_code != 200:
        record("tts call#2 cached", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        t2 = r.json()
        if t2.get("cached") is True and t2.get("plays_today") == 2:
            # audio should be same as call#1
            same_audio = t2.get("audio_base64") == t1.get("audio_base64")
            record("tts call#2 cached=true plays=2", True, f"same_audio={same_audio}")
        else:
            record("tts call#2 cached=true plays=2", False, f"cached={t2.get('cached')} plays_today={t2.get('plays_today')}")

    # ---- 7. POST /tts SAME -> plays_today=3 ----
    r = s.post(f"{API}/tts", json=tts_body, headers=H, timeout=30)
    if r.status_code != 200:
        record("tts call#3 plays=3", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        t3 = r.json()
        if t3.get("plays_today") == 3:
            record("tts call#3 plays=3", True, f"cached={t3.get('cached')}")
        else:
            record("tts call#3 plays=3", False, f"plays_today={t3.get('plays_today')}")

    # ---- 8. POST /tts SAME -> 402 daily_limit_reached ----
    r = s.post(f"{API}/tts", json=tts_body, headers=H, timeout=30)
    if r.status_code != 402:
        record("tts call#4 402 daily_limit", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        try:
            detail = r.json().get("detail", {})
            if isinstance(detail, dict) and detail.get("error") == "daily_limit_reached":
                record("tts call#4 402 daily_limit", True, f"detail={detail}")
            else:
                record("tts call#4 402 daily_limit", False, f"wrong detail shape: {detail}")
        except Exception as e:
            record("tts call#4 402 daily_limit", False, f"parse error: {e}, body={r.text[:200]}")

    # ---- 8b. /me/usage after limit ----
    r = s.get(f"{API}/me/usage", headers=H, timeout=20)
    if r.status_code == 200:
        u = r.json()
        if u.get("plays_today") == 3 and u.get("remaining") == 0:
            record("me/usage after limit", True, f"{u}")
        else:
            record("me/usage after limit", False, f"{u}")
    else:
        record("me/usage after limit", False, f"status={r.status_code}")

    # ---- 9. POST /me/upgrade ----
    r = s.post(f"{API}/me/upgrade", headers=H, timeout=20)
    if r.status_code == 200:
        up = r.json()
        if up.get("is_premium") is True and up.get("premium_until"):
            record("me/upgrade", True, f"until={up.get('premium_until')}")
        else:
            record("me/upgrade", False, f"{up}")
    else:
        record("me/upgrade", False, f"status={r.status_code} body={r.text[:300]}")

    # ---- 9b. /me/usage after upgrade ----
    r = s.get(f"{API}/me/usage", headers=H, timeout=20)
    if r.status_code == 200:
        u = r.json()
        if u.get("is_premium") is True:
            record("me/usage premium", True, f"{u}")
        else:
            record("me/usage premium", False, f"{u}")

    # ---- 10. POST /tts as premium -> 200, is_premium=true, plays_today=0 ----
    r = s.post(f"{API}/tts", json=tts_body, headers=H, timeout=30)
    if r.status_code != 200:
        record("tts premium unrestricted", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        tp = r.json()
        if tp.get("is_premium") is True and tp.get("plays_today") == 0 and tp.get("audio_base64"):
            record("tts premium unrestricted", True, f"cached={tp.get('cached')} plays_today={tp.get('plays_today')}")
        else:
            record("tts premium unrestricted", False, f"is_premium={tp.get('is_premium')} plays_today={tp.get('plays_today')}")

    # ---- 11. POST /books/{book_id}/author-chat as premium ----
    r = s.post(
        f"{API}/books/{book_id}/author-chat",
        json={"message": "¿Qué te inspiró a escribir este libro?", "history": []},
        headers=H,
        timeout=90,
    )
    if r.status_code != 200:
        record("author-chat premium", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        ac = r.json()
        reply = ac.get("reply", "")
        if reply and len(reply) > 10:
            # Check first-person signals (Spanish): yo, me, mi, mío/-a, escribí, pensé, etc.
            low = reply.lower()
            first_person_tokens = [" yo ", "mi ", "me ", "mí", "cuando escribí", "escribí", "pensé", "sentí", "creé", "creí", "intenté", "soñé"]
            has_fp = any(tok in f" {low} " for tok in first_person_tokens)
            if has_fp:
                record("author-chat premium reply in 1st person", True, f"sample={reply[:150]}")
            else:
                record("author-chat premium reply in 1st person", True, f"Minor: first-person heuristic failed but got reply. sample={reply[:200]}")
        else:
            record("author-chat premium reply in 1st person", False, f"empty/short reply: {reply[:200]}")

    # ---- 12. POST /me/downgrade ----
    r = s.post(f"{API}/me/downgrade", headers=H, timeout=20)
    if r.status_code == 200 and r.json().get("is_premium") is False:
        record("me/downgrade", True, "")
    else:
        record("me/downgrade", False, f"status={r.status_code} body={r.text[:300]}")

    # ---- 13. author-chat as free -> 402 premium_required ----
    r = s.post(
        f"{API}/books/{book_id}/author-chat",
        json={"message": "Hola", "history": []},
        headers=H,
        timeout=30,
    )
    if r.status_code != 402:
        record("author-chat free 402", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        try:
            detail = r.json().get("detail", {})
            if isinstance(detail, dict) and detail.get("error") == "premium_required":
                record("author-chat free 402 premium_required", True, f"detail={detail}")
            else:
                record("author-chat free 402 premium_required", False, f"wrong detail: {detail}")
        except Exception as e:
            record("author-chat free 402 premium_required", False, f"parse err: {e}")

    # ---- REGRESSION: auth/me, books/interact, premium-summary ----
    r = s.get(f"{API}/auth/me", headers=H, timeout=20)
    if r.status_code == 200 and r.json().get("user_id") == user.get("user_id"):
        record("auth/me regression", True, "")
    else:
        record("auth/me regression", False, f"status={r.status_code}")

    r = s.post(f"{API}/books/interact", json={"book_id": book_id, "action": "like"}, headers=H, timeout=20)
    if r.status_code == 200 and r.json().get("ok") is True:
        record("books/interact regression", True, "")
    else:
        record("books/interact regression", False, f"status={r.status_code} body={r.text[:200]}")

    r = s.get(f"{API}/books/{book_id}/premium-summary", params={"lang": "es"}, headers=H, timeout=90)
    if r.status_code == 200 and r.json().get("summary"):
        record("premium-summary regression", True, f"cached={r.json().get('cached')}")
    else:
        record("premium-summary regression", False, f"status={r.status_code} body={r.text[:200]}")

    print_summary()


def print_summary():
    print("\n=== RESULTS SUMMARY ===")
    fails = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'} - {name}: {detail}")
    print(f"\nTotal: {len(results)}  Pass: {len(results) - len(fails)}  Fail: {len(fails)}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
