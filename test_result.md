#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Test premium/monetization endpoints (/api/me/usage, /api/config/pricing, /api/me/upgrade, /api/me/downgrade, new /api/tts with book_id/lang caching and daily free limit, /api/books/{id}/author-chat premium gate) and affiliate URL behavior, plus regression on pre-existing endpoints."

backend:
  - task: "Usage endpoint (GET /api/me/usage)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "New guest returns {is_premium:false, plays_today:0, limit:3, remaining:3, premium_until:null}. After 3 TTS calls returns plays_today=3, remaining=0. After /me/upgrade returns is_premium=true, remaining=null."
  - task: "Pricing config (GET /api/config/pricing)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "Public endpoint (no auth). Returns all required fields: monthly_regular, monthly_launch, yearly_regular, yearly_launch, launch_promo_active=true, launch_promo_label, free_daily_audio_limit=3."
  - task: "Upgrade/downgrade dev endpoints (POST /api/me/upgrade, /api/me/downgrade)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "upgrade sets is_premium=true with premium_until +30d; downgrade reverts to is_premium=false. Both require auth."
  - task: "TTS with caching + daily limit (POST /api/tts with book_id/lang)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "Flow verified end-to-end: call#1 cached=false plays_today=1 with OpenAI-generated audio (~114KB base64). call#2 same book_id+voice+lang returns cached=true plays_today=2, SAME audio (no new OpenAI call). call#3 plays_today=3. call#4 returns 402 with detail.error='daily_limit_reached', plays_today=3, limit=3. After upgrade, call returns 200 with is_premium=true, plays_today=0 (not tracked). Cache field pattern audio_{voice}_{lang} working correctly."
  - task: "Author chat premium endpoint (POST /api/books/{book_id}/author-chat)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "Free user receives 402 with detail.error='premium_required'. After /me/upgrade, returns 200 with {reply} in Spanish first person, clearly in character as the author (e.g. Arthur C. Clarke reply: 'La semilla de esta historia fue un relato temprano titulado Ángel Guardian, pero mi verdadera motivación fue explorar esa sensación de sobrecogimiento...'). Uses Gemini via emergentintegrations."
  - task: "Affiliate URLs in /api/books/feed"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "With no AFFILIATE_AMAZON_TAG in env, amazon_url is plain search URL: https://www.amazon.com/s?k=...&i=stripbooks with no &tag= parameter appended. build_store_urls conditional is working as specified."
  - task: "Premium Summary endpoint (GET /api/books/{book_id}/premium-summary)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "All 7 scenarios pass against https://book-swipe-1.preview.emergentagent.com/api: (1) ES first call returns cached=false with valid plain-text summary (188 words, no markdown, no quotes, no section labels). (2) ES second call returns cached=true with identical summary. (3) EN call returns cached=false (different lang cache field) with 171-word plain summary. (4) Invalid book_id returns 404. (5) Missing auth returns 401. Summary is plain prose, starts strong (no 'This book is about...'), no section headers leaked. Caching via premium_summary_es/premium_summary_en fields on books collection works correctly."
  - task: "Auth guest login (POST /api/auth/guest)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "Returns 200 with user object and session_token. Token works as Bearer auth on subsequent calls. /api/auth/me also verified."
  - task: "Books feed (GET /api/books/feed)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "Regression check: feed returns 3 books with valid metadata when count=3 is requested with Bearer auth."
  - task: "TTS (POST /api/tts)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "Regression check: returns base64 audio with mime=audio/mp3 (48k base64 chars) for short Spanish text."
  - task: "Books interact (POST /api/books/interact)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "Regression check: like action persisted, returns {ok: true}."

metadata:
  created_by: "testing_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "testing"
      message: "Ran /app/backend_test.py against the public backend URL. All 19 assertions pass (premium-summary ES/EN first+cached, 404, 401, plain-text/no-markdown/no-section-label validation, word count 150-220, plus regressions on auth/guest, auth/me, books/feed, books/interact, tts). No issues found. Premium summary endpoint is working as designed including the per-lang caching (premium_summary_es / premium_summary_en fields on book documents)."
    - agent: "testing"
      message: "Ran updated /app/backend_test.py covering premium/monetization flow end-to-end against https://book-swipe-1.preview.emergentagent.com/api. All 19 tests pass: /me/usage defaults + after limit + after upgrade, /config/pricing public (all required fields), /me/upgrade + /me/downgrade, /tts caching pattern (call#1 cached=false plays=1 with OpenAI gen, call#2+3 cached=true plays increments even when cached, call#4 -> 402 daily_limit_reached), premium bypasses limit and plays_today=0, author-chat 402 premium_required for free users and returns first-person Spanish reply in character for premium (verified via Arthur C. Clarke response). Affiliate: amazon_url contains no &tag= when AFFILIATE_AMAZON_TAG not set. Regression: auth/me, books/interact, premium-summary still working. No issues found."
