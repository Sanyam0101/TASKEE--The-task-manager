/**
 * Team Task Manager - Backend (Node.js + Express + SQLite)
 */

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'task-manager-secret-key-123';

// --- Database Initialization ---
const db = new Database('app.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Admin', 'Member')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    owner_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY(project_id, user_id),
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    assignee_id INTEGER,
    status TEXT NOT NULL CHECK(status IN ('Todo','In Progress','Done')) DEFAULT 'Todo',
    due_date TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(assignee_id) REFERENCES users(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

/**
 * Helper to log user activities
 */
function logActivity(userId, message) {
  try {
    db.prepare('INSERT INTO activities (user_id, message) VALUES (?, ?)').run(userId, message);
  } catch (e) {
    console.error('Failed to log activity:', e);
  }
}

// --- Seed Data (Initial Admin) ---
const adminEmail = 'admin@example.com';
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users(name, email, password_hash, role) VALUES(?,?,?,?)')
    .run('System Admin', adminEmail, hash, 'Admin');
  console.log('Seeded admin user: admin@example.com / admin123');
}

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Requires Admin role' });
  }
  next();
}

// --- Auth Routes ---

app.post('/api/auth/signup', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(name, email, hash, role);
    logActivity(info.lastInsertRowid, `Joined the team as ${role}`);
    res.status(201).json({ id: info.lastInsertRowid, name, email, role });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ message: 'Email already in use' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
});

// --- User & Project Routes ---

app.get('/api/users', auth, (req, res) => {
  const users = db.prepare('SELECT id,name,email,role FROM users').all();
  res.json(users);
});

app.post('/api/projects', auth, requireAdmin, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Project name is required' });
  
  const info = db.prepare('INSERT INTO projects(name,description,owner_id) VALUES(?,?,?)').run(name, description || '', req.user.id);
  db.prepare('INSERT OR IGNORE INTO project_members(project_id,user_id) VALUES(?,?)').run(info.lastInsertRowid, req.user.id);
  logActivity(req.user.id, `Created project: ${name}`);
  res.status(201).json({ id: info.lastInsertRowid, name, description });
});

app.get('/api/projects', auth, (req, res) => {
  let projects;
  if (req.user.role === 'Admin') {
    projects = db.prepare(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'Done') as completed_tasks
      FROM projects p 
      ORDER BY created_at DESC
    `).all();
  } else {
    projects = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'Done') as completed_tasks
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE pm.user_id = ?
      ORDER BY p.created_at DESC
    `).all(req.user.id);
  }
  res.json(projects);
});

// --- Task Routes ---

app.post('/api/tasks', auth, (req, res) => {
  const { projectId, title, description, assigneeId, dueDate } = req.body;
  if (!projectId || !title) return res.status(400).json({ message: 'Project and title are required' });
  
  const info = db.prepare('INSERT INTO tasks(project_id,title,description,assignee_id,due_date,created_by) VALUES(?,?,?,?,?,?)')
    .run(projectId, title, description || '', assigneeId || null, dueDate || null, req.user.id);
  logActivity(req.user.id, `Created task: ${title}`);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.get('/api/tasks', auth, (req, res) => {
  let tasks;
  const isAdmin = req.user.role === 'Admin';
  
  const query = isAdmin 
    ? `SELECT t.*, p.name as project_name, u.name as assignee_name FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id ORDER BY t.created_at DESC`
    : `SELECT t.*, p.name as project_name, u.name as assignee_name FROM tasks t JOIN projects p ON p.id = t.project_id JOIN project_members pm ON pm.project_id = p.id LEFT JOIN users u ON u.id = t.assignee_id WHERE pm.user_id = ? GROUP BY t.id ORDER BY t.created_at DESC`;

  tasks = isAdmin ? db.prepare(query).all() : db.prepare(query).all(req.user.id);
  res.json(tasks);
});

app.patch('/api/tasks/:id/status', auth, (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!['Todo', 'In Progress', 'Done'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
  
  const task = db.prepare('SELECT title FROM tasks WHERE id = ?').get(id);
  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
  logActivity(req.user.id, `Updated task "${task.title}" to ${status}`);
  res.json({ message: 'Status updated' });
});

// --- Dashboard Stats ---

app.get('/api/dashboard', auth, (req, res) => {
  let tasks;
  const isAdmin = req.user.role === 'Admin';
  
  if (isAdmin) {
    tasks = db.prepare('SELECT status, due_date FROM tasks').all();
  } else {
    tasks = db.prepare(`SELECT t.status, t.due_date FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id WHERE pm.user_id = ? GROUP BY t.id`).all(req.user.id);
  }
  
  const activities = db.prepare(`
    SELECT a.*, u.name as user_name 
    FROM activities a 
    JOIN users u ON u.id = a.user_id 
    ORDER BY a.created_at DESC 
    LIMIT 10
  `).all();

  const now = new Date().toISOString().slice(0, 10);
  const summary = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'Todo').length,
    inProgress: tasks.filter(t => t.status === 'In Progress').length,
    done: tasks.filter(t => t.status === 'Done').length,
    overdue: tasks.filter(t => t.due_date && t.due_date < now && t.status !== 'Done').length,
    activities
  };
  res.json(summary);
});

// --- Static Server & SPA Routing ---

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ message: 'Not found' });
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
