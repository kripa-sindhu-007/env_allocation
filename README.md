# Environment Manager

Internal tool for reserving, releasing, and tracking shared development environments. Built as a Chrome extension backed by Vercel serverless functions and Supabase.

## Architecture

```
Chrome Extension (popup UI + background service worker)
    ↕ HTTP
Vercel Serverless Functions (API)
    ↕
Supabase (PostgreSQL)
```

## Features

- Reserve and release shared environments with a single click
- Two user roles: **Developer** and **QA**
- Developers can optionally notify QA users when reserving an environment
- QA users receive **native Chrome OS notifications** (even without opening the extension)
- In-app notification bell with last 20 notifications and read/unread status
- Notes on reservations to communicate intent
- Real-time activity feed per environment category
- Stale environment detection (4+ hours)
- Search and filter by Backend/Frontend groups and sub-tabs

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run [`supabase/schema.sql`](./supabase/schema.sql) — it creates all four tables (`environments`, `history`, `users`, `notifications`), constraints, indexes, and seeds the environment list.
3. Copy your **Project URL** and **service_role key** from **Settings → API**

#### Tables

| Table           | Purpose                                                          |
|-----------------|------------------------------------------------------------------|
| `environments`  | The reservable envs across 4 categories (Backend/Frontend × API/Portal/PWA) |
| `history`       | Append-only log of `reserve` / `release` / `note-update` actions |
| `users`         | Registered developers and QA, with a 4-digit PIN for restore     |
| `notifications` | QA pings created when a developer reserves an env                |

The four categories are `Backend-APIs`, `Backend-Portal`, `Frontend-PWA`, `Frontend-Portal`. Seeded env names cover `test-1..20`, `alpha-1..3`, `main-alpha`, and `uat-beatroute` / `uat-sandbox` (with PWA receiving a reduced subset).

### 2. Vercel Backend

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Vercel CLI if you haven't:
   ```bash
   npm i -g vercel
   ```

3. Link and deploy:
   ```bash
   vercel
   ```

4. Set environment variables in Vercel dashboard (or via CLI):
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your-service-role-key
   ```

5. Redeploy after setting env vars:
   ```bash
   vercel --prod
   ```

Your API is now live at `https://your-app.vercel.app/api`.

### 3. Chrome Extension

1. Open `extension/popup.js` and `extension/background.js` — update `API_BASE` to your Vercel URL:
   ```js
   const API_BASE = 'https://your-app.vercel.app/api';
   ```

2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `extension/` folder
5. Click the extension icon in your toolbar
6. On first launch, enter your name and select your role (Developer or QA)

## API Endpoints

| Method | Path               | Description                          |
|--------|--------------------|--------------------------------------|
| GET    | /api/environments  | List all environments                |
| POST   | /api/reserve       | Reserve an environment               |
| POST   | /api/release       | Release an environment               |
| POST   | /api/update-note   | Update environment note              |
| GET    | /api/history       | Global or per-env history            |
| GET    | /api/users         | List users (filterable by `?role=qa`)|
| POST   | /api/users         | Register a user with name and role   |
| GET    | /api/notifications | Get notifications for a user         |
| POST   | /api/notifications | Mark notifications as read           |

### Request Bodies

**Reserve:**
```json
{ "envId": 1, "user": "Kripa", "note": "Testing login", "notifyQA": ["qa_user1", "qa_user2"] }
```

**Release:** `{ "envId": 1, "user": "Kripa" }`

**Update note:** `{ "envId": 1, "user": "Kripa", "note": "Testing login" }`

**Register / restore user:** `{ "name": "Kripa", "role": "developer", "pin": "1234" }` — `pin` must be exactly 4 digits. If `name` already exists, the matching `pin` restores the user (`restored: true`); a wrong `pin` returns `409`.

**Mark notifications read:** `{ "notificationIds": [1, 2, 3] }`

**History (per-env):** `GET /api/history?envId=1`

**History (per-category):** `GET /api/history?category=Backend-APIs`

**Users (QA only):** `GET /api/users?role=qa`

**Notifications:** `GET /api/notifications?userId=<user_name>`

## Project Structure

```
├── api/
│   ├── _lib/
│   │   ├── cors.js              # CORS wrapper
│   │   └── supabase.js          # Supabase client
│   ├── environments.js          # GET all environments
│   ├── history.js               # GET history
│   ├── notifications.js         # GET/POST notifications
│   ├── release.js               # POST release
│   ├── reserve.js               # POST reserve (with QA notify)
│   ├── update-note.js           # POST update note
│   └── users.js                 # GET/POST users
├── extension/
│   ├── background.js            # Service worker (notification polling)
│   ├── manifest.json            # Chrome MV3 manifest
│   ├── popup.css                # Popup styles
│   ├── popup.html               # Popup markup
│   └── popup.js                 # Popup logic
├── package.json
├── vercel.json
└── README.md
```

## User Roles

| Role      | Capabilities                                                       |
|-----------|--------------------------------------------------------------------|
| Developer | Reserve/release environments, add notes, notify QA on reserve      |
| QA        | Reserve/release environments, receive native Chrome notifications  |

## Notification Flow

1. Developer clicks **Reserve** on a free environment
2. A modal appears with a note input and a multi-select list of QA users
3. Developer selects QA users (optional) and confirms
4. Selected QA users receive a **native Chrome OS notification** within ~60 seconds
5. QA users also see a badge count on the extension icon and an in-app notification dropdown
6. Last 20 notifications are retained in the dropdown (read ones appear dimmed)

## Color Coding

- **Green** — environment is free
- **Red** — environment is in use
- **Amber** — in use for 7+ days (stale)
