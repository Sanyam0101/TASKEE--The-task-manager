/**
 * Team Task Manager - Frontend (Vanilla JS)
 * 
 * Features:
 * - Reactive UI updates without heavy frameworks
 * - Modular design (Auth, Navigation, App Logic)
 * - Fetch-based API interaction with centralized error handling
 */

const API = '/api';
let token = localStorage.getItem('token') || '';
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');

// --- DOM Utilities ---
const $ = (id) => document.getElementById(id);
const val = (id) => $(id).value;
const setVal = (id, v) => $(id).value = v;

/**
 * Global headers for API requests
 */
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
});

/**
 * Generic Fetch Wrapper
 * Handles errors and JSON parsing globally.
 */
async function req(path, options = {}) {
  try {
    const r = await fetch(API + path, {
      ...options,
      headers: options.headers || headers()
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || 'Request failed');
    return data;
  } catch (e) {
    console.error(`API Error (${path}):`, e);
    alert(e.message);
    throw e;
  }
}

// --- Authentication Logic ---

function toggleAuth(isLogin) {
  $('login-form').classList.toggle('hidden', !isLogin);
  $('signup-form').classList.toggle('hidden', isLogin);
  $('auth-section').querySelector('h2').innerText = isLogin ? 'Welcome Back' : 'Create Account';
}

async function signup() {
  const payload = {
    name: val('signup-name'),
    email: val('signup-email'),
    password: val('signup-password'),
    role: val('signup-role')
  };
  await req('/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
  alert('Account created! Please sign in.');
  toggleAuth(true);
}

async function login() {
  const payload = { email: val('email'), password: val('password') };
  const data = await req('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
  token = data.token;
  currentUser = data.user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(currentUser));
  init();
}

function logout() {
  localStorage.clear();
  token = '';
  currentUser = null;
  location.reload();
}

// --- Navigation & View Control ---

/**
 * Switch between different sections of the app (Dashboard, Projects, Tasks)
 */
function showSection(sectionId) {
  document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
  $(sectionId).classList.remove('hidden');
  
  // Auto-refresh data when switching views
  if (sectionId === 'dashboard-view') loadDashboard();
  if (sectionId === 'projects-view') loadProjects();
  if (sectionId === 'tasks-view') loadTasks();
}

function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

// --- Core Application Logic ---

let users = [];
let projects = [];

/**
 * App Initialization
 * Checks for session and prepares the initial UI.
 */
async function init() {
  if (!token || !currentUser) {
    $('auth-section').classList.remove('hidden');
    $('app-section').classList.add('hidden');
    return;
  }

  $('auth-section').classList.add('hidden');
  $('app-section').classList.remove('hidden');
  $('welcome-name').innerText = currentUser.name;
  $('welcome-role').innerText = currentUser.role;

  // RBAC: Hide project creation for non-admins
  if (currentUser.role !== 'Admin') {
    $('btn-create-project').classList.add('hidden');
  }

  await loadUsers();
  await loadDashboard();
  lucide.createIcons(); // Initialize Lucide icons
}

async function loadUsers() {
  users = await req('/users');
  const select = $('task-assignee-select');
  select.innerHTML = users.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('');
}

async function loadProjects() {
  projects = await req('/projects');
  
  const select = $('task-project-select');
  select.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  const list = $('projects-list');
  list.innerHTML = projects.map(p => {
    const progress = p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0;
    return `
      <div class="card project-card">
        <div class="flex between mb-2">
          <h4 style="margin:0">${p.name}</h4>
          <i data-lucide="folder" style="color: var(--primary); width: 20px;"></i>
        </div>
        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">${p.description || 'No description provided.'}</p>
        
        <div class="progress-text">
          <span>Progress</span>
          <span>${progress}%</span>
        </div>
        <div class="progress-container">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <p style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 1rem;">
          ${p.completed_tasks} of ${p.total_tasks} tasks completed
        </p>

        <div class="flex" style="font-size: 0.75rem; color: var(--text-muted);">
          <i data-lucide="calendar" style="width: 14px;"></i>
          <span>Created ${new Date(p.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    `;
  }).join('');
  lucide.createIcons();
}

async function createProject() {
  const name = val('new-project-name');
  const description = val('new-project-desc');
  if (!name) return alert('Project name is required');

  await req('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, description })
  });
  
  closeModal('project-modal');
  setVal('new-project-name', '');
  setVal('new-project-desc', '');
  await loadProjects();
}

async function loadTasks() {
  const tasks = await req('/tasks');
  const tbody = $('tasks-table-body');
  
  tbody.innerHTML = tasks.map(t => {
    const statusClass = t.status.toLowerCase().replace(' ', '-');
    return `
      <tr>
        <td style="font-weight: 500;">${t.title}</td>
        <td><span class="badge badge-todo">${t.project_name}</span></td>
        <td>
          <div class="flex">
            <i data-lucide="user" style="width: 14px; color: var(--text-muted);"></i>
            <span>${t.assignee_name || 'Unassigned'}</span>
          </div>
        </td>
        <td style="color: ${isOverdue(t) ? 'var(--danger)' : 'inherit'}">
          ${t.due_date ? new Date(t.due_date).toLocaleDateString() : '-'}
        </td>
        <td><span class="badge badge-${statusClass}">${t.status}</span></td>
        <td>
          <select style="padding: 0.25rem; font-size: 0.8rem; width: auto;" onchange="updateTaskStatus(${t.id}, this.value)">
            <option value="Todo" ${t.status === 'Todo' ? 'selected' : ''}>Todo</option>
            <option value="In Progress" ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
            <option value="Done" ${t.status === 'Done' ? 'selected' : ''}>Done</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

function isOverdue(task) {
  if (!task.due_date || task.status === 'Done') return false;
  return new Date(task.due_date) < new Date(new Date().toISOString().slice(0, 10));
}

async function createTask() {
  const payload = {
    projectId: Number(val('task-project-select')),
    title: val('task-title'),
    description: val('task-desc'),
    assigneeId: Number(val('task-assignee-select')),
    dueDate: val('task-due-date')
  };

  if (!payload.projectId || !payload.title) return alert('Project and Title are required');

  await req('/tasks', { method: 'POST', body: JSON.stringify(payload) });
  closeModal('task-modal');
  setVal('task-title', '');
  setVal('task-desc', '');
  await loadTasks();
  await loadDashboard();
}

async function updateTaskStatus(id, status) {
  await req(`/tasks/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  await loadTasks();
  await loadDashboard();
}

async function loadDashboard() {
  const data = await req('/dashboard');
  $('stat-total').innerText = data.total;
  $('stat-progress').innerText = data.inProgress;
  $('stat-done').innerText = data.done;
  $('stat-overdue').innerText = data.overdue;

  // Render Activities
  const list = $('activity-list');
  if (!data.activities || data.activities.length === 0) {
    list.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">No recent activity.</p>`;
  } else {
    list.innerHTML = data.activities.map(a => `
      <div class="activity-item">
        <div class="activity-icon">
          <i data-lucide="${getActivityIcon(a.message)}" style="width: 16px;"></i>
        </div>
        <div class="activity-content">
          <div class="activity-message">${a.user_name} ${a.message}</div>
          <div class="activity-meta">${formatTime(a.created_at)}</div>
        </div>
      </div>
    `).join('');
    lucide.createIcons();
  }
}

function getActivityIcon(msg) {
  if (msg.includes('Created project')) return 'folder-plus';
  if (msg.includes('Created task')) return 'file-plus';
  if (msg.includes('Updated task')) return 'refresh-cw';
  if (msg.includes('Joined')) return 'user-plus';
  return 'bell';
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const diff = Math.floor((new Date() - date) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString();
}

// Start the app
init();
