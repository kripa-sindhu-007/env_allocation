# Environment Manager

Internal tool for reserving, releasing, and tracking shared development environments. Built as a Chrome extension backed by Vercel serverless functions and Supabase.

## Architecture

```
Chrome Extension (popup UI)
    ↕ HTTP
Vercel Serverless Functions (API)
    ↕
Supabase (PostgreSQL)
```

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Copy your **Project URL** and **service_role key** from **Settings → API**

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

1. Open `extension/popup.js` and update `API_BASE` on line 4 to your Vercel URL:
   ```js
   const API_BASE = 'https://your-app.vercel.app/api';
   ```

2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `extension/` folder
5. Click the extension icon in your toolbar

## API Endpoints

| Method | Path              | Description              |
|--------|-------------------|--------------------------|
| GET    | /api/environments | List all environments    |
| POST   | /api/reserve      | Reserve an environment   |
| POST   | /api/release      | Release an environment   |
| POST   | /api/update-note  | Update environment note  |
| GET    | /api/history      | Global or per-env history|

### Request bodies

**Reserve:** `{ "envId": "test-1", "user": "Kripa" }`

**Release:** `{ "envId": "test-1", "user": "Kripa" }`

**Update note:** `{ "envId": "test-1", "user": "Kripa", "note": "Testing login" }`

**History (per-env):** `GET /api/history?envId=test-1`

## Project Structure

```
├── api/
│   ├── _lib/
│   │   ├── cors.js          # CORS wrapper
│   │   └── supabase.js      # Supabase client
│   ├── environments.js      # GET all environments
│   ├── history.js           # GET history
│   ├── release.js           # POST release
│   ├── reserve.js           # POST reserve
│   └── update-note.js       # POST update note
├── extension/
│   ├── manifest.json        # Chrome MV3 manifest
│   ├── popup.css            # Popup styles
│   ├── popup.html           # Popup markup
│   └── popup.js             # Popup logic
├── supabase/
│   └── schema.sql           # DB schema + seed data
├── package.json
├── vercel.json
└── README.md
```

## Color Coding

- **Green** — environment is free
- **Red** — environment is in use
- **Amber** — in use for 4+ hours (stale)
# env_allocation
# env_allocation
