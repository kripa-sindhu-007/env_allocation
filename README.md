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
2. Go to **SQL Editor** and run the schema below
3. Copy your **Project URL** and **service_role key** from **Settings → API**

#### Database Schema

```sql
-- Environments table (create manually or via schema.sql)

-- Users table
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('developer', 'qa')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  env_id BIGINT REFERENCES environments(id) ON DELETE CASCADE,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  note TEXT,
  env_name TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_to_user_unread
  ON notifications(to_user, is_read) WHERE is_read = FALSE;
```

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

**Register user:** `{ "name": "Kripa", "role": "developer" }`

**Mark notifications read:** `{ "notificationIds": [1, 2, 3] }`

**History (per-env):** `GET /api/history?envId=1`

**Users (QA only):** `GET /api/users?role=qa`

**Notifications:** `GET /api/notifications?user=qa_user1`

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
- **Amber** — in use for 4+ hours (stale)
