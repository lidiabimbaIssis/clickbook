"""Backend tests for premium-summary endpoint and regression checks.

Tests against the public backend URL (EXPO_PUBLIC_BACKEND_URL) with /api prefix.
"""
import os
import re
import sys
import json
import time
from pathlib import Path

import requests

# Load backend URL from frontend .env
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

    # 1. Guest auth
    r = s.post(f"{API}/auth/guest", timeout=30)
    if r.status_code != 200:
        record("auth/guest", False, f"status={r.status_code} body={r.text[:200]}")
        return
    body = r.json()
    token = body.get("session_token")
    user = body.get("user", {})
    if not token:
        record("auth/guest", False, f"no session_token in {body}")
        return
    record("auth/guest", True, f"user_id={user.get('user_id')}")

    auth_headers = {"Authorization": f"Bearer {token}"}

    # 2. Books feed
    r = s.get(f"{API}/books/feed?count=3", headers=auth_headers, timeout=120)
    if r.status_code != 200:
        record("books/feed", False, f"status={r.status_code} body={r.text[:300]}")
        return
    feed = r.json()
    books = feed.get("books", [])
    if len(books) == 0:
        record("books/feed", False, "empty books list")
        return
    record("books/feed", True, f"got {len(books)} books; first title={books[0].get('title')}")

    book_id = books[0]["book_id"]
    book_title = books[0]["title"]

    # 3. Premium summary ES (first call -> not cached)
    r = s.get(
        f"{API}/books/{book_id}/premium-summary",
        params={"lang": "es"},
        headers=auth_headers,
        timeout=120,
    )
    if r.status_code != 200:
        record("premium-summary ES first", False, f"status={r.status_code} body={r.text[:300]}")
        return
    data1 = r.json()
    summary_es = data1.get("summary", "")
    cached1 = data1.get("cached")
    lang1 = data1.get("lang")
    if cached1 is not False:
        record("premium-summary ES first cached=false", False, f"got cached={cached1}")
    else:
        record("premium-summary ES first cached=false", True, f"lang={lang1}")
    if not summary_es:
        record("premium-summary ES summary present", False, "empty")
        return
    record("premium-summary ES summary present", True, f"length={len(summary_es)} chars")

    # Validate plain text - no markdown, no quotes wrapping, no section labels
    label_patterns = [
        r"^El Gancho\s*[:\-]",
        r"^The Hook\s*[:\-]",
        r"\bEl Gancho \(", r"\bLa Trama", r"\bPor qué es para ti",
        r"\bThe Hook \(", r"\bThe Plot",
    ]
    issues = []
    if summary_es.startswith('"') or summary_es.startswith("'") or summary_es.startswith("«"):
        issues.append("starts with quote")
    if summary_es.endswith('"') or summary_es.endswith("'") or summary_es.endswith("»"):
        issues.append("ends with quote")
    if "```" in summary_es:
        issues.append("contains markdown fences")
    if re.search(r"^\s*#", summary_es, re.MULTILINE):
        issues.append("contains markdown headers")
    if re.search(r"\*\*[^*]+\*\*", summary_es):
        issues.append("contains bold markdown")
    for pat in label_patterns:
        if re.search(pat, summary_es, re.MULTILINE | re.IGNORECASE):
            issues.append(f"contains section label matching '{pat}'")
            break

    if issues:
        record("premium-summary ES plain text", False, f"issues={issues}; sample={summary_es[:200]}")
    else:
        record("premium-summary ES plain text", True, f"sample={summary_es[:120]}...")

    word_count = len(summary_es.split())
    if 120 <= word_count <= 260:
        record("premium-summary ES word count", True, f"{word_count} words (target ~150-220)")
    else:
        record("premium-summary ES word count", False, f"{word_count} words (out of 120-260)")

    # 4. Premium summary ES second call -> cached
    r = s.get(
        f"{API}/books/{book_id}/premium-summary",
        params={"lang": "es"},
        headers=auth_headers,
        timeout=30,
    )
    if r.status_code != 200:
        record("premium-summary ES cached", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        data2 = r.json()
        if data2.get("cached") is True and data2.get("summary") == summary_es:
            record("premium-summary ES cached", True, "cached=true and same summary")
        else:
            record(
                "premium-summary ES cached",
                False,
                f"cached={data2.get('cached')} same_summary={data2.get('summary') == summary_es}",
            )

    # 5. Premium summary EN -> not cached (different lang)
    r = s.get(
        f"{API}/books/{book_id}/premium-summary",
        params={"lang": "en"},
        headers=auth_headers,
        timeout=120,
    )
    if r.status_code != 200:
        record("premium-summary EN first", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        data3 = r.json()
        cached3 = data3.get("cached")
        summary_en = data3.get("summary", "")
        if cached3 is False and summary_en:
            record("premium-summary EN first cached=false", True, f"length={len(summary_en)}")
        else:
            record(
                "premium-summary EN first cached=false",
                False,
                f"cached={cached3} summary_present={bool(summary_en)}",
            )
        # quick sanity check
        if summary_en:
            wc_en = len(summary_en.split())
            if 120 <= wc_en <= 260:
                record("premium-summary EN word count", True, f"{wc_en} words")
            else:
                record("premium-summary EN word count", False, f"{wc_en} words (out of 120-260)")

    # 6. Invalid book_id -> 404
    r = s.get(
        f"{API}/books/invalid_id_xyz123/premium-summary",
        params={"lang": "es"},
        headers=auth_headers,
        timeout=30,
    )
    if r.status_code == 404:
        record("premium-summary invalid book_id 404", True, "")
    else:
        record(
            "premium-summary invalid book_id 404",
            False,
            f"status={r.status_code} body={r.text[:200]}",
        )

    # 7. No auth -> 401
    r = requests.get(
        f"{API}/books/{book_id}/premium-summary",
        params={"lang": "es"},
        timeout=30,
    )
    if r.status_code == 401:
        record("premium-summary no auth 401", True, "")
    else:
        record(
            "premium-summary no auth 401",
            False,
            f"status={r.status_code} body={r.text[:200]}",
        )

    # ---- Regression checks ----

    # Books interact
    r = s.post(
        f"{API}/books/interact",
        json={"book_id": book_id, "action": "like"},
        headers=auth_headers,
        timeout=30,
    )
    if r.status_code == 200 and r.json().get("ok") is True:
        record("books/interact like", True, "")
    else:
        record("books/interact like", False, f"status={r.status_code} body={r.text[:200]}")

    # TTS - small text to avoid long generation
    r = s.post(
        f"{API}/tts",
        json={"text": "Hola mundo, esto es una prueba.", "voice": "fable"},
        headers=auth_headers,
        timeout=120,
    )
    if r.status_code == 200:
        tts_body = r.json()
        if tts_body.get("audio_base64") and tts_body.get("mime"):
            record("tts", True, f"mime={tts_body.get('mime')} audio_len={len(tts_body['audio_base64'])}")
        else:
            record("tts", False, f"missing fields: {list(tts_body.keys())}")
    else:
        record("tts", False, f"status={r.status_code} body={r.text[:200]}")

    # auth/me regression
    r = s.get(f"{API}/auth/me", headers=auth_headers, timeout=20)
    if r.status_code == 200 and r.json().get("user_id") == user.get("user_id"):
        record("auth/me", True, "")
    else:
        record("auth/me", False, f"status={r.status_code} body={r.text[:200]}")

    # Summary
    print("\n=== RESULTS SUMMARY ===")
    fails = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'} - {name}: {detail}")
    print(f"\nTotal: {len(results)}  Pass: {len(results) - len(fails)}  Fail: {len(fails)}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
