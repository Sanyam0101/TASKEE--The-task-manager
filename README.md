# TaskFlow - Team Task Manager

TaskFlow is a premium, lightweight, and **explainable** full-stack task management application. It is designed to be usable and attractive while maintaining a simple codebase that is easy to understand and deploy.

## 🚀 Deployment Guide (Railway)

Railway is the easiest way to deploy this app. Follow these steps:

### 1. Prepare your Repository
- Ensure all files are in a GitHub repository.
- Make sure `Procfile`, `package.json`, and `server.js` are in the root directory.

### 2. Create a Railway Project
1. Go to [railway.app](https://railway.app) and sign in.
2. Click **+ New Project**.
3. Select **Deploy from GitHub repo**.
4. Choose your repository.

### 3. Configure Settings
Railway automatically detects the `Procfile` and starts the app using `npm start`.
- **Environment Variables**: Click on the **Variables** tab in Railway.
  - Add `JWT_SECRET`: (Any long random string).
  - The `PORT` is automatically handled by Railway.

### 4. Database Persistence (Important)
Since this app uses SQLite (`app.db`), the database will reset every time you redeploy *unless* you add a Volume.
1. In Railway, click **+ Add** -> **Volume**.
2. Mount the volume at `/app/data` (optional) or simply know that for a demo, the default ephemeral storage is fine.
3. If you want true persistence, update `server.js` to use a path inside the volume: `const db = new Database('/app/data/app.db');`.

## 💡 Creative Features
- **Live Activity Feed**: Tracks every action (signups, project creation, task updates) in real-time.
- **Visual Progress Bars**: Each project card shows a dynamic progress bar based on completed tasks.
- **Interactive Dashboard**: Modern stats cards for quick team overview.
- **Explainable Code**: Every function is commented and designed for interview walkthroughs.

## 🛠️ Technology Stack
- **Backend**: Node.js, Express
- **Database**: SQLite (better-sqlite3)
- **Auth**: JWT, BcryptJS
- **Frontend**: HTML5, CSS3 (Grid/Flexbox), Vanilla JS, Lucide Icons

## 📦 Local Setup
1. `npm install`
2. `npm start`
3. Visit `http://localhost:3000`

**Admin Login (Auto-seeded):**
- **Email**: `admin@example.com`
- **Password**: `admin123`

## 📄 License
MIT
