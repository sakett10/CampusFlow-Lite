# CampusFlow

A focused, production-grade student academic operating system and verified campus notice hub.

CampusFlow helps university students organize course schedules, monitor attendance thresholds, track assignment deadlines, and stay updated with verified campus notices—without chaotic group chats or unread email circulars.

---

## Architecture Overview

```
[ Student / Reviewer Browser ]
            │
            ▼
     React 19 + Vite (Tailwind CSS v4)
     Clerk Session Authentication
            │
    (Authenticated REST API)
            │
            ▼
    Node.js / Express Backend
    ├── Middleware (requireAuth, CORS allowlist)
    ├── Services
    │   ├── Courses Service (scoped to user_id)
    │   ├── Assignments Service (scoped to user_id + verifies course ownership)
    │   ├── Notices Service (verified bulletin items & dismissals)
    │   ├── Crypto Service (AES-256-GCM token encryption)
    │   └── Gmail Ingestion (Reviewer-only OAuth + Gemini AI parsing)
    └── Persistence
        └── PostgreSQL (Hosted on Neon Cloud / Local testDb)
```

---

## Key Capabilities

1. **Course & Attendance Management**
   - Track attended vs. total classes and syllabus credits.
   - Real-time calculation of consecutive classes needed to maintain or recover the 75% attendance threshold.
   - Low attendance risk alerts on the dashboard.

2. **Assignment & Deliverable Tracking**
   - Course-scoped assignment logging with statuses: `PENDING`, `IN_PROGRESS`, `COMPLETED`.
   - Automatic urgency classification (`OVERDUE`, `SOON`, `NORMAL`) with timezone-safe calendar parsing.
   - Foreign key ownership enforcement prevents cross-user course injection.

3. **Verified Campus Notice Board**
   - Single canonical bulletin (`/notices`) for announcements, hackathons, workshops, and deadlines.
   - Deep links and backward compatibility for legacy feeds.
   - Filter by category (`academic`, `exam`, `placement`, `event`, etc.) and priority.
   - Per-user notification dismissal persistence across polling cycles.

4. **Institutional Reviewer Ingestion**
   - Designated campus reviewers can link an institutional Gmail mailbox via OAuth.
   - Incoming circulars and forwards are parsed into structured candidates using Google Gemini API.
   - OAuth tokens are encrypted at rest using AES-256-GCM with envelope formatting (`enc:v1:<iv>:<tag>:<ciphertext>`).
   - Normal students do not run background sync and cannot perform destructive operations on official notices.

---

## Getting Started

### Prerequisites
- Node.js (v20+ recommended)
- npm or pnpm
- PostgreSQL connection string (e.g. Neon)
- Clerk account for authentication

### Environment Variables

Create a `.env` file in the project root:

```ini
# Frontend Environment
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Backend Environment
PORT=3000
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://user:pass@ep-host.neon.tech/neondb?sslmode=require

# Clerk Backend Authentication
CLERK_SECRET_KEY=sk_test_...

# Reviewer & Admin Role Allowlists (comma-separated Clerk User IDs)
REVIEWER_USER_IDS=user_reviewer1,user_reviewer2
ADMIN_USER_IDS=user_admin1

# Token Encryption (32-byte hex or base64 key)
GMAIL_TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
GMAIL_OAUTH_STATE_SECRET=state_secret_value

# Google OAuth & Gemini (Reviewer Mode Only)
GMAIL_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-google-client-secret
GMAIL_REDIRECT_URI=http://localhost:3000/api/gmail/callback
GEMINI_API_KEY=AIzaSy...
```

### Installation & Run

```bash
# Install dependencies
npm install

# Run database migrations for notification dismissals
node migrate-notification-dismissals.cjs

# Start development servers (frontend + backend)
npm run dev
```

---

## Verification & Quality Commands

```bash
# Run all automated tests (Vitest)
npm test

# Run ESLint validation
npm run lint

# Build production bundle with route-level code splitting
npm run build
```

---

## Security Architecture

- **Course Isolation:** `assignmentsService.add` verifies that `course_id` belongs to the requesting `user_id`, preventing foreign key tampering.
- **Backdoor Role Prevention:** Reviewer/Admin access is restricted strictly to verified Clerk session claims or explicit server allowlists (`REVIEWER_USER_IDS`, `ADMIN_USER_IDS`).
- **Encrypted Credentials:** Gmail tokens are encrypted via AES-256-GCM with authenticated tags before persistence. Plaintext tokens on legacy databases are transparently re-encrypted upon first read.
- **Restricted CORS:** Backend endpoints reject unauthorized origins, only permitting explicitly configured `FRONTEND_URL` and trusted local ports.
- **Scoped Student Actions:** Non-reviewer students cannot delete or alter official notices.
