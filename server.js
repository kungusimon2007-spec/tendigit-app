const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Database opening error: ', err.message);
    else console.log('Connected to SQLite database.');
});

db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    bio TEXT DEFAULT 'NexusHub Member'
)`);

db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Single-page full-featured social app HTML
const appHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NexusHub - Super App</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #090d16; color: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; }
        
        /* Top Navigation & Branding */
        header { background: #0f172a; border-bottom: 1px solid #1e293b; padding: 12px 20px 12px 60px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 99; }
        .logo-area { display: flex; align-items: center; gap: 10px; }
        .logo-icon { width: 32px; height: 32px; background: #38bdf8; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #0f172a; font-size: 18px; }
        h1 { font-size: 18px; font-weight: 700; color: #f8fafc; }
        .subtitle { font-size: 11px; color: #94a3b8; }

        /* Hamburger Menu */
        #hamburger-btn { position: fixed; top: 12px; left: 15px; z-index: 1000; background: #1e293b; color: white; border: none; padding: 8px 12px; border-radius: 8px; font-size: 18px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
        #nexus-drawer { position: fixed; top: 0; left: -300px; width: 280px; height: 100%; background: #0f172a; z-index: 1001; transition: left 0.3s ease; box-shadow: 5px 0 25px rgba(0,0,0,0.7); padding: 25px; border-right: 1px solid #1e293b; }
        #nexus-drawer.open { left: 0; }
        .drawer-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid #334155; padding-bottom: 15px; }
        .drawer-links { list-style: none; }
        .drawer-links li { margin-bottom: 15px; }
        .drawer-links a { color: #cbd5e1; text-decoration: none; font-size: 15px; display: block; padding: 10px 14px; border-radius: 8px; background: #1e293b; transition: background 0.2s; }
        .drawer-links a:hover { background: #334155; color: #38bdf8; }

        /* Tabs Bar */
        .tabs-bar { display: flex; background: #0f172a; border-bottom: 1px solid #1e293b; overflow-x: auto; }
        .tab-btn { flex: 1; padding: 14px 16px; background: none; border: none; color: #94a3b8; font-size: 14px; font-weight: 600; cursor: pointer; text-align: center; white-space: nowrap; transition: all 0.2s; }
        .tab-btn.active { color: #38bdf8; border-bottom: 2px solid #38bdf8; background: rgba(56, 189, 248, 0.05); }

        /* Main Content Container */
        .main-container { max-width: 600px; width: 100%; margin: 20px auto; padding: 0 15px; flex: 1; }
        .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        
        /* Auth Screen */
        #auth-screen { display: flex; justify-content: center; align-items: center; height: 80vh; }
        .auth-box { width: 100%; max-width: 400px; background: #111827; border: 1px solid #1f2937; padding: 30px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .auth-box h2 { margin-bottom: 20px; color: #38bdf8; font-size: 22px; text-align: center; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; font-size: 13px; color: #94a3b8; margin-bottom: 6px; }
        .form-control { width: 100%; padding: 12px; background: #090d16; border: 1px solid #374151; border-radius: 8px; color: white; font-size: 14px; }
        .btn { width: 100%; padding: 12px; background: #38bdf8; color: #0f172a; border: none; border-radius: 8px; font-weight: bold; font-size: 15px; cursor: pointer; margin-top: 10px; transition: background 0.2s; }
        .btn:hover { background: #0ea5e9; }
        .btn-secondary { background: #374151; color: white; margin-top: 8px; }
        .btn-secondary:hover { background: #4b5563; }

        /* Feed & Posts */
        textarea.form-control { resize: vertical; min-height: 80px; }
        .post-item { background: #1f2937; padding: 15px; border-radius: 8px; margin-top: 12px; }
        .post-author { font-weight: bold; color: #38bdf8; font-size: 14px; margin-bottom: 4px; }
        .post-content { font-size: 14px; color: #e2e8f0; }

        /* Utility */
        .hidden { display: none !important; }
        .flex-row { display: flex; gap: 10px; }
    </style>
</head>
<body>

    <!-- Hamburger Menu Button -->
    <button id="hamburger-btn" onclick="toggleMenu()">☰</button>

    <!-- Navigation Drawer -->
    <div id="nexus-drawer">
        <div class="drawer-header">
            <h3>NexusHub Menu</h3>
            <button onclick="toggleMenu()" style="background:none; border:none; color:white; font-size:22px; cursor:pointer;">&times;</button>
        </div>
        <ul class="drawer-links">
            <li><a href="#" onclick="alert('Profile Modal: Username: ' + currentUser); toggleMenu();">👤 Edit Profile</a></li>
            <li><a href="#" onclick="alert('Settings: Notifications & Dark Theme enabled.'); toggleMenu();">⚙️ App Settings</a></li>
            <li><a href="#" onclick="alert('NexusHub v2.0 - Standalone PWA Super App'); toggleMenu();">ℹ️ About NexusHub</a></li>
            <li><a href="#" onclick="localStorage.removeItem('nexus_user'); location.reload();" style="background:#dc2626;">🚪 Logout</a></li>
        </ul>
    </div>

    <!-- Top App Bar -->
    <header>
        <div class="logo-area">
            <div class="logo-icon">N</div>
            <div>
                <h1>NexusHub</h1>
                <div class="subtitle">NexusChat • NexusFeed • NexusReels • Wallet</div>
            </div>
        </div>
        <div id="user-display" style="font-size: 13px; color: #38bdf8; font-weight: 600;"></div>
    </header>

    <!-- Auth Section -->
    <div id="auth-screen" class="main-container">
        <div class="auth-box">
            <h2>Welcome to NexusHub</h2>
            <div class="form-group">
                <label>Username</label>
                <input type="text" id="auth-username" class="form-control" placeholder="Enter your username">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="auth-password" class="form-control" placeholder="Enter password">
            </div>
            <button class="btn" onclick="handleAuth('login')">Login</button>
            <button class="btn btn-secondary" onclick="handleAuth('register')">Create Account</button>
        </div>
    </div>

    <!-- App Dashboard (Hidden until logged in) -->
    <div id="app-dashboard" class="hidden">
        <!-- Tabs Bar -->
        <div class="tabs-bar">
            <button class="tab-btn active" onclick="switchTab('feed', event)">📰 NexusFeed</button>
            <button class="tab-btn" onclick="switchTab('chat', event)">💬 NexusChat</button>
            <button class="tab-btn" onclick="switchTab('reels', event)">🎬 NexusReels</button>
            <button class="tab-btn" onclick="switchTab('wallet', event)">💰 Wallet</button>
        </div>

        <!-- Tab 1: Feed -->
        <div id="tab-feed" class="main-container tab-content">
            <div class="card">
                <h3 style="margin-bottom: 12px; font-size: 16px;">Create Post</h3>
                <textarea id="post-text" class="form-control" placeholder="What\\'s happening in your world?"></textarea>
                <button class="btn" onclick="createPost()">Publish Post</button>
            </div>
            <div class="card">
                <h3 style="margin-bottom: 12px; font-size: 16px;">Community Feed</h3>
                <div id="feed-container">Loading posts...</div>
            </div>
        </div>

        <!-- Tab 2: Chat -->
        <div id="tab-chat" class="main-container tab-content hidden">
            <div class="card" style="height: 400px; display: flex; flex-direction: column;">
                <h3 style="margin-bottom: 12px; font-size: 16px; border-bottom: 1px solid #1f2937; padding-bottom: 8px;">NexusChat Global Room</h3>
                <div id="chat-messages" style="flex: 1; overflow-y: auto; background: #090d16; padding: 10px; border-radius: 8px; margin-bottom: 10px; font-size: 14px;">
                    <div style="color: #94a3b8; text-align: center; margin-top: 20px;">Welcome to NexusChat! Send a message below.</div>
                </div>
                <div class="flex-row">
                    <input type="text" id="chat-input" class="form-control" placeholder="Type a message..." onkeypress="if(event.key==='Enter') sendChatMessage()">
                    <button class="btn" style="width: 100px; margin-top: 0;" onclick="sendChatMessage()">Send</button>
                </div>
            </div>
        </div>

        <!-- Tab 3: Reels -->
        <div id="tab-reels" class="main-container tab-content hidden">
            <div class="card" style="text-align: center; padding: 40px 20px;">
                <h3 style="margin-bottom: 10px; color: #38bdf8;">NexusReels</h3>
                <p style="color: #94a3b8; font-size: 14px; margin-bottom: 20px;">Short video sharing and streaming is ready for content creators.</p>
                <button class="btn" onclick="alert('Video upload feature active! Select a video file to stream.')">Upload Reel</button>
            </div>
        </div>

        <!-- Tab 4: Wallet -->
        <div id="tab-wallet" class="main-container tab-content hidden">
            <div class="card">
                <h3 style="margin-bottom: 15px; color: #38bdf8;">NexusWallet Balance</h3>
                <div style="font-size: 32px; font-weight: bold; margin-bottom: 15px;">$1,250.00 <span style="font-size: 14px; color: #10b981;">USD</span></div>
                <div class="flex-row">
                    <button class="btn" onclick="alert('Send funds dialog opened.')">Send</button>
                    <button class="btn btn-secondary" onclick="alert('Receive QR Code generated.')">Receive</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentUser = localStorage.getItem('nexus_user') || '';

        function checkAuth() {
            if (currentUser) {
                document.getElementById('auth-screen').classList.add('hidden');
                document.getElementById('app-dashboard').classList.remove('hidden');
                document.getElementById('user-display').innerText = '@' + currentUser;
                loadPosts();
            } else {
                document.getElementById('auth-screen').classList.remove('hidden');
                document.getElementById('app-dashboard').classList.add('hidden');
                document.getElementById('user-display').innerText = '';
            }
        }

        async function handleAuth(action) {
            const username = document.getElementById('auth-username').value.trim();
            const password = document.getElementById('auth-password').value.trim();
            if (!username || !password) {
                alert('Please enter username and password.');
                return;
            }
            
            const res = await fetch('/api/' + action, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                currentUser = username;
                localStorage.setItem('nexus_user', currentUser);
                checkAuth();
            } else {
                alert(data.error || 'Authentication failed');
            }
        }

        function toggleMenu() {
            document.getElementById('nexus-drawer').classList.toggle('open');
        }

        function switchTab(tabName, event) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + tabName).classList.remove('hidden');
            event.currentTarget.classList.add('active');
        }

        async function createPost() {
            const content = document.getElementById('post-text').value.trim();
            if (!content) return;
            await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentUser, content })
            });
            document.getElementById('post-text').value = '';
            loadPosts();
        }

        async function loadPosts() {
            const res = await fetch('/api/posts');
            const posts = await res.json();
            const container = document.getElementById('feed-container');
            if (posts.length === 0) {
                container.innerHTML = '<p style="color:#94a3b8; font-size:13px;">No posts yet. Be the first to share something!</p>';
                return;
            }
            container.innerHTML = posts.map(p => \`
                <div class="post-item">
                    <div class="post-author">@\${p.username}</div>
                    <div class="post-content">\${p.content}</div>
                </div>
            \`).join('');
        }

        function sendChatMessage() {
            const input = document.getElementById('chat-input');
            const val = input.value.trim();
            if (!val) return;
            const chatBox = document.getElementById('chat-messages');
            chatBox.innerHTML += \`<div style="margin-bottom:8px;"><b style="color:#38bdf8;">@\${currentUser}:</b> \${val}</div>\`;
            input.value = '';
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        window.onload = checkAuth;
    </script>
</body>
</html>
`;

// API Endpoints
app.get('/', (req, res) => {
    res.send(appHTML);
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password], function(err) {
        if (err) {
            res.json({ success: false, error: 'Username already taken or invalid.' });
        } else {
            res.json({ success: true });
        }
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (row) {
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Invalid username or password.' });
        }
    });
});

app.get('/api/posts', (req, res) => {
    db.all(`SELECT * FROM posts ORDER BY id DESC`, [], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/posts', (req, res) => {
    const { username, password, content } = req.body;
    db.run(`INSERT INTO posts (username, content) VALUES (?, ?)`, [username, content], function(err) {
        res.json({ success: !err });
    });
});

app.listen(PORT, () => {
    console.log('NexusHub server running on port ' + PORT);
});
