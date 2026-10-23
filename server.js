require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) console.error('Database error:', err);
  else console.log('Connected to SQLite Database.');
});

// Default Admin Credentials (can be changed in database)
const DEFAULT_ADMIN_PASS = '$2a$10$wT8c3x5kK/Qe123456789u.exampleHashedPass'; // Default hashed password

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name TEXT DEFAULT 'TenDigit Super App',
    app_icon_url TEXT DEFAULT '/uploads/default-icon.png',
    admin_password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_digit_id TEXT UNIQUE,
    username TEXT UNIQUE,
    password TEXT,
    country TEXT DEFAULT 'Kenya',
    city TEXT DEFAULT 'Chuka'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS wallets (
    user_id INTEGER PRIMARY KEY,
    balance REAL DEFAULT 0.0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS payout_profiles (
    user_id INTEGER PRIMARY KEY,
    full_name TEXT,
    national_id TEXT,
    mpesa_phone TEXT,
    verified BOOLEAN DEFAULT 1,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    amount REAL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT,
    media_url TEXT,
    media_type TEXT DEFAULT 'text',
    category TEXT DEFAULT 'General',
    country TEXT DEFAULT 'Kenya',
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    user_id INTEGER,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_ten_digit TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

function generateTenDigitId() {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

// App Public Info
app.get('/api/app/info', (req, res) => {
  db.get(`SELECT app_name, app_icon_url FROM app_config LIMIT 1`, [], (err, config) => {
    res.json(config || { app_name: 'TenDigit Super App', app_icon_url: '/uploads/default-icon.png' });
  });
});

// Admin Auth & Login
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  db.get(`SELECT admin_password FROM app_config LIMIT 1`, [], async (err, config) => {
    // If no admin password set yet, default pass is 'admin123'
    if (!config || !config.admin_password) {
      if (password === 'admin123') {
        const hashed = await bcrypt.hash('admin123', 10);
        db.run(`INSERT INTO app_config (app_name, admin_password) VALUES ('TenDigit Super App', ?)`, [hashed]);
        return res.json({ success: true, message: 'Admin authenticated!' });
      } else {
        return res.status(401).json({ error: 'Invalid admin password' });
      }
    }

    const match = await bcrypt.compare(password, config.admin_password);
    if (match) {
      res.json({ success: true, message: 'Admin authenticated!' });
    } else {
      res.status(401).json({ error: 'Invalid admin password' });
    }
  });
});

// Admin Update Branding
app.post('/api/admin/branding', upload.single('icon'), (req, res) => {
  const { app_name } = req.body;
  const icon_url = req.file ? '/uploads/' + req.file.filename : null;

  db.get(`SELECT COUNT(*) as count FROM app_config`, [], (err, row) => {
    if (row.count === 0) {
      db.run(`INSERT INTO app_config (app_name, app_icon_url) VALUES (?, ?)`, [app_name || 'TenDigit Super App', icon_url || '/uploads/default-icon.png']);
    } else {
      if (icon_url) {
        db.run(`UPDATE app_config SET app_name = ?, app_icon_url = ?`, [app_name, icon_url]);
      } else {
        db.run(`UPDATE app_config SET app_name = ?`, [app_name]);
      }
    }
    res.json({ success: true, message: 'App identity updated successfully!' });
  });
});

// Admin Stats Endpoint
app.get('/api/admin/stats', (req, res) => {
  db.get(`SELECT COUNT(*) as user_count FROM users`, [], (err, u) => {
    db.get(`SELECT COUNT(*) as post_count FROM posts`, [], (err, p) => {
      db.get(`SELECT SUM(amount) as total_volume FROM transactions`, [], (err, t) => {
        res.json({
          total_users: u ? u.user_count : 0,
          total_posts: p ? p.post_count : 0,
          total_platform_volume: t && t.total_volume ? Math.abs(t.total_volume) : 0.0
        });
      });
    });
  });
});

// Payout Profile Setup
app.post('/api/payout/setup', (req, res) => {
  const { user_id, full_name, national_id, mpesa_phone } = req.body;
  if (!user_id || !national_id || !mpesa_phone) {
    return res.status(400).json({ error: 'National ID and M-Pesa phone number required.' });
  }

  db.run(`INSERT OR REPLACE INTO payout_profiles (user_id, full_name, national_id, mpesa_phone, verified) VALUES (?, ?, ?, ?, 1)`,
    [user_id, full_name, national_id, mpesa_phone], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: 'M-Pesa payout profile saved!' });
    });
});

app.get('/api/payout/:userId', (req, res) => {
  db.get(`SELECT * FROM payout_profiles WHERE user_id = ?`, [req.params.userId], (err, profile) => {
    res.json(profile || null);
  });
});

app.post('/api/payout/withdraw', (req, res) => {
  const { user_id, amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  db.get(`SELECT balance FROM wallets WHERE user_id = ?`, [user_id], (err, wallet) => {
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    db.get(`SELECT mpesa_phone FROM payout_profiles WHERE user_id = ?`, [user_id], (err, profile) => {
      if (!profile || !profile.mpesa_phone) {
        return res.status(400).json({ error: 'Please link your Safaricom M-Pesa number first.' });
      }

      db.serialize(() => {
        db.run(`UPDATE wallets SET balance = balance - ? WHERE user_id = ?`, [amount, user_id]);
        db.run(`INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'MPESA_WITHDRAWAL', ?, ?)`, 
          [user_id, -amount, `M-Pesa Payout to ${profile.mpesa_phone}`]);
        
        res.json({ success: true, message: `Withdrawal request sent! KES equivalent of $${amount.toFixed(2)} sent to M-Pesa number ${profile.mpesa_phone}` });
      });
    });
  });
});

// Standard User Endpoints
app.post('/api/register', async (req, res) => {
  const { username, password, country, city } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const tenDigitId = generateTenDigitId();

  db.run(`INSERT INTO users (ten_digit_id, username, password, country, city) VALUES (?, ?, ?, ?, ?)`,
    [tenDigitId, username, hashedPassword, country || 'Kenya', city || 'Chuka'], function(err) {
      if (err) return res.status(400).json({ error: 'Username already taken' });
      const userId = this.lastID;
      db.run(`INSERT INTO wallets (user_id, balance) VALUES (?, 10.0)`, [userId]);
      db.run(`INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'BONUS', 10.0, 'Welcome Bonus')`, [userId]);

      res.json({ success: true, user: { id: userId, username, ten_digit_id: tenDigitId } });
    });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    res.json({ success: true, user: { id: user.id, username: user.username, ten_digit_id: user.ten_digit_id, country: user.country } });
  });
});

app.get('/api/users/search', (req, res) => {
  const query = `%${req.query.q || ''}%`;
  db.all(`SELECT id, username, ten_digit_id, country, city FROM users WHERE username LIKE ? OR ten_digit_id LIKE ? LIMIT 10`,
    [query, query], (err, users) => {
      res.json(users || []);
    });
});

app.get('/api/feed/:userId', (req, res) => {
  const userId = req.params.userId;
  db.get(`SELECT country FROM users WHERE id = ?`, [userId], (err, user) => {
    const userCountry = user ? user.country : 'Kenya';
    db.all(`SELECT posts.*, users.username, users.ten_digit_id FROM posts 
            JOIN users ON posts.user_id = users.id 
            ORDER BY CASE WHEN posts.country = ? THEN 1 ELSE 2 END, posts.created_at DESC LIMIT 50`,
            [userCountry], async (err, posts) => {
      if (!posts) return res.json([]);
      const postsWithComments = await Promise.all(posts.map(async (post) => {
        return new Promise((resolve) => {
          db.all(`SELECT comments.*, users.username FROM comments 
                  JOIN users ON comments.user_id = users.id 
                  WHERE post_id = ? ORDER BY comments.created_at ASC`, [post.id], (err, comments) => {
            post.comments = comments || [];
            resolve(post);
          });
        });
      }));
      res.json(postsWithComments);
    });
  });
});

app.get('/api/reels', (req, res) => {
  db.all(`SELECT posts.*, users.username, users.ten_digit_id FROM posts 
          JOIN users ON posts.user_id = users.id 
          WHERE posts.media_type = 'video' 
          ORDER BY posts.created_at DESC LIMIT 20`, [], (err, reels) => {
    res.json(reels || []);
  });
});

app.post('/api/posts', upload.single('media'), (req, res) => {
  const { user_id, content, category, country } = req.body;
  const media_url = req.file ? '/uploads/' + req.file.filename : null;
  const media_type = req.file ? (req.file.mimetype.startsWith('video') ? 'video' : 'image') : 'text';

  db.run(`INSERT INTO posts (user_id, content, media_url, media_type, category, country) VALUES (?, ?, ?, ?, ?, ?)`,
    [user_id, content, media_url, media_type, category || 'General', country || 'Kenya'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, postId: this.lastID });
    });
});

app.post('/api/posts/like', (req, res) => {
  const { postId } = req.body;
  db.run(`UPDATE posts SET likes = likes + 1 WHERE id = ?`, [postId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/comments', (req, res) => {
  const { post_id, user_id, comment } = req.body;
  db.run(`INSERT INTO comments (post_id, user_id, comment) VALUES (?, ?, ?)`, [post_id, user_id, comment], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/messages/:senderId/:targetTenDigit', (req, res) => {
  const { senderId, targetTenDigit } = req.params;
  db.all(`SELECT messages.*, users.username as sender_name FROM messages 
          JOIN users ON messages.sender_id = users.id 
          WHERE (messages.sender_id = ? AND messages.receiver_ten_digit = ?) 
          OR (users.ten_digit_id = ? AND messages.receiver_ten_digit = (SELECT ten_digit_id FROM users WHERE id = ?)) 
          ORDER BY messages.created_at ASC`,
          [senderId, targetTenDigit, targetTenDigit, senderId], (err, msgs) => {
            res.json(msgs || []);
          });
});

app.get('/api/wallet/:userId', (req, res) => {
  db.get(`SELECT balance FROM wallets WHERE user_id = ?`, [req.params.userId], (err, row) => {
    db.all(`SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`, [req.params.userId], (err, txs) => {
      res.json({ balance: row ? row.balance : 0.0, transactions: txs || [] });
    });
  });
});

app.post('/api/tip', (req, res) => {
  const { sender_id, receiver_id, amount } = req.body;
  const platformFee = amount * 0.15;
  const creatorEarnings = amount - platformFee;

  db.serialize(() => {
    db.run(`UPDATE wallets SET balance = balance - ? WHERE user_id = ?`, [amount, sender_id]);
    db.run(`UPDATE wallets SET balance = balance + ? WHERE user_id = ?`, [creatorEarnings, receiver_id]);
    
    db.run(`INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'TIP_SENT', ?, 'Tip sent to creator')`, [sender_id, -amount]);
    db.run(`INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'TIP_RECEIVED', ?, 'Creator earnings from tip')`, [receiver_id, creatorEarnings]);

    res.json({ success: true, message: 'Tip sent successfully!', creatorEarnings });
  });
});

io.on('connection', (socket) => {
  socket.on('join_chat', (tenDigitId) => {
    socket.join(tenDigitId);
  });

  socket.on('send_message', (data) => {
    const { senderId, receiverTenDigit, message } = data;
    db.run(`INSERT INTO messages (sender_id, receiver_ten_digit, message) VALUES (?, ?, ?)`,
      [senderId, receiverTenDigit, message]);
    io.to(receiverTenDigit).emit('receive_message', data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Super App Running on http://127.0.0.1:${PORT}`);
  console.log(`🔐 Admin Owner Portal Live on http://127.0.0.1:${PORT}/admin.html`);
});
