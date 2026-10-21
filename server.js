require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(helmet({ contentSecurityPolicy: false }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// Strict rate limiter for Owner Admin login to prevent brute force
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: "Too many login attempts. Locked out." }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Initialize SQLite Database
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Database opening error: ', err.message);
    else console.log('Connected to SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tweets (
        id TEXT PRIMARY KEY,
        username TEXT,
        content TEXT,
        timestamp TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        username TEXT,
        caption TEXT,
        videoUrl TEXT,
        timestamp TEXT
    )`);
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const activeUsers = {};

// --- OWNER ADMIN CONTROL PANEL API ---
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "simon_owner_admin_2026";

app.post('/api/admin/verify', adminLimiter, (req, res) => {
    const { passcode } = req.body;
    if (passcode === ADMIN_SECRET_KEY) {
        res.json({ success: true, token: "owner_authorized_session" });
    } else {
        res.status(401).json({ success: false, error: "Unauthorized Admin Passcode" });
    }
});

app.get('/api/admin/stats', (req, res) => {
    db.all(`SELECT COUNT(*) as tweetCount FROM tweets`, [], (err, tweetRow) => {
        db.all(`SELECT COUNT(*) as videoCount FROM videos`, [], (err2, videoRow) => {
            res.json({
                activeUsersCount: Object.keys(activeUsers).length,
                totalTweets: tweetRow[0]?.tweetCount || 0,
                totalVideos: videoRow[0]?.videoCount || 0,
                connectedUsersList: Object.values(activeUsers)
            });
        });
    });
});

// Twitter API
app.post('/api/tweet', (req, res) => {
    const { username, content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    const newTweet = { id: Date.now().toString(), username: username || 'Anonymous', content, timestamp: new Date().toLocaleTimeString() };
    
    db.run(`INSERT INTO tweets (id, username, content, timestamp) VALUES (?, ?, ?, ?)`, 
        [newTweet.id, newTweet.username, newTweet.content, newTweet.timestamp], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('new_tweet', newTweet);
        res.json({ success: true, tweet: newTweet });
    });
});

app.get('/api/tweets', (req, res) => {
    db.all(`SELECT * FROM tweets ORDER BY rowid DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Reels API
app.post('/api/upload-video', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video uploaded' });
    const newPost = { 
        id: Date.now().toString(), 
        caption: req.body.caption || 'My Reel', 
        username: req.body.username || 'Creator', 
        videoUrl: `/uploads/${req.file.filename}`, 
        timestamp: new Date().toLocaleTimeString() 
    };

    db.run(`INSERT INTO videos (id, username, caption, videoUrl, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [newPost.id, newPost.username, newPost.caption, newPost.videoUrl, newPost.timestamp], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('new_video_post', newPost);
        res.json({ success: true, post: newPost });
    });
});

app.get('/api/videos', (req, res) => {
    db.all(`SELECT * FROM videos ORDER BY rowid DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// WebSockets & Signaling
io.on('connection', (socket) => {
    socket.on('register', (data) => {
        activeUsers[socket.id] = { tenDigitId: data.tenDigitId, username: data.username || `User_${data.tenDigitId.slice(-4)}` };
    });
    socket.on('private_message', (data) => {
        const { targetId, message } = data;
        const targetSocketId = Object.keys(activeUsers).find(sId => activeUsers[sId].tenDigitId === targetId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('private_message', { senderId: activeUsers[socket.id]?.tenDigitId, message, timestamp: new Date().toLocaleTimeString() });
        } else {
            socket.emit('error_notice', { message: `User with ID ${targetId} is offline.` });
        }
    });
    socket.on('call_user', (data) => {
        const { targetId, offer } = data;
        const targetSocketId = Object.keys(activeUsers).find(sId => activeUsers[sId].tenDigitId === targetId);
        if (targetSocketId) io.to(targetSocketId).emit('incoming_call', { callerId: activeUsers[socket.id]?.tenDigitId, offer });
    });
    socket.on('answer_call', (data) => {
        const { targetId, answer } = data;
        const targetSocketId = Object.keys(activeUsers).find(sId => activeUsers[sId].tenDigitId === targetId);
        if (targetSocketId) io.to(targetSocketId).emit('call_answered', { answer });
    });
    socket.on('ice_candidate', (data) => {
        const { targetId, candidate } = data;
        const targetSocketId = Object.keys(activeUsers).find(sId => activeUsers[sId].tenDigitId === targetId);
        if (targetSocketId) io.to(targetSocketId).emit('ice_candidate', { candidate });
    });
    socket.on('disconnect', () => { delete activeUsers[socket.id]; });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running! Open http://localhost:${PORT} in Chrome`);
});
