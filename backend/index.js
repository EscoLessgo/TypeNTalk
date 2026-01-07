require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const prisma = new PrismaClient();

if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL is not set. The app requires a PostgreSQL database to function on Railway.');
    console.warn('👉 Go to Railway -> TypeNTalk Service -> Variables -> New Variable -> Reference -> Postgres -> DATABASE_URL');
}

const app = express();
app.use(cors());
app.use(express.json());

// Request logging for debugging
app.use((req, res, next) => {
    if (req.url !== '/health') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
});

const FRONTEND_PATH = path.join(__dirname, '../frontend/dist');
const FRONTEND_INDEX = path.join(FRONTEND_PATH, 'index.html');

console.log('--- Startup Config ---');
console.log('__dirname:', __dirname);
console.log('Frontend Path:', FRONTEND_PATH);
console.log('Frontend Index:', FRONTEND_INDEX);
console.log('Database URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET (using sqlite)');
console.log('---------------------');

// Serve static files from the frontend build
app.use(express.static(FRONTEND_PATH));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;
const LOVENSE_URL = 'https://api.lovense.com/api/standard/v1/command';

// API Routes
app.get('/', (req, res) => {
    res.send('<h1>Veroe Sync API</h1><p>The backend is running. Go to <a href="http://localhost:5173">localhost:5173</a> to use the app.</p>');
});

app.get('/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', database: 'connected', timestamp: new Date() });
    } catch (err) {
        res.status(503).json({ status: 'unhealthy', database: 'disconnected', error: err.message });
    }
});

const qrCache = new Map();
const presets = new Map(); // uid -> interval
const baseFloors = new Map(); // uid -> level

// Host: Get QR for linking toy
app.get('/api/lovense/qr', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username required' });

    // Return cached QR if available (expires in 10 mins)
    const cached = qrCache.get(username);
    if (cached && (Date.now() - cached.time < 600000)) {
        console.log(`[LOVENSE] Using cached QR for ${username}`);
        return res.json(cached.data);
    }

    try {
        const token = (process.env.LOVENSE_DEVELOPER_TOKEN || '').trim();

        if (!token || token.length < 10) {
            return res.status(500).json({ error: 'LOVENSE_DEVELOPER_TOKEN missing.' });
        }

        const response = await axios.post('https://api.lovense.com/api/lan/getQrCode', {
            token: token,
            uid: username,
            uname: username,
            v: 2,
            apiVer: 1,
            type: 'standard'
        }, { timeout: 10000 });

        if (response.data && response.data.result) {
            qrCache.set(username, { data: response.data.data, time: Date.now() });
            res.json(response.data.data);
        } else {
            console.error('[LOVENSE] API Error:', response.data);
            res.status(500).json({ error: 'Lovense API error', details: response.data });
        }
    } catch (error) {
        console.error('Error getting QR:', error.message);
        const isRateLimit = error.message.includes('1015') || (error.response && error.response.status === 429);
        res.status(500).json({
            error: isRateLimit ? 'RATE LIMITED BY CLOUDFLARE' : 'Failed to get QR code',
            details: isRateLimit ? 'Please wait 5 minutes. Lovense has temporarily blocked us.' : error.message
        });
    }
});

// Lovense Callback
app.post('/api/lovense/callback', async (req, res) => {
    console.log('Lovense Callback:', JSON.stringify(req.body, null, 2));
    const { uid, toys } = req.body;

    if (uid) {
        console.log(`[CALLBACK] Successful link for UID: ${uid}`);
        await prisma.host.upsert({
            where: { uid: uid },
            update: { toys: JSON.stringify(toys), username: uid },
            create: { uid: uid, username: uid, toys: JSON.stringify(toys) }
        });

        io.to(`host:${uid}`).emit('api-feedback', {
            success: true,
            message: '✓ LINK SUCCESSFUL! APP CONNECTED TO SERVER.',
            url: 'callback'
        });
        io.to(`host:${uid}`).emit('lovense:linked', { toys });
    }

    res.json({ result: true });
});

// Create Connection Link
app.post('/api/connections/create', async (req, res) => {
    try {
        const { uid } = req.body; // uid is the host's Lovense UID
        if (!uid) return res.status(400).json({ error: 'Host UID required' });

        // Ensure the host exists in our DB (especially important for 'Skip To Link' flow)
        const host = await prisma.host.upsert({
            where: { uid: uid },
            update: { username: uid },
            create: { uid: uid, username: uid }
        });

        // Check for an existing recent connection to prevent link-shuffling
        const existing = await prisma.connection.findFirst({
            where: { hostId: host.id },
            orderBy: { createdAt: 'desc' }
        });

        if (existing && !existing.approved) {
            return res.json({ slug: existing.slug });
        }

        const slug = uuidv4().substring(0, 8);
        const connection = await prisma.connection.create({
            data: {
                slug,
                hostId: host.id,
                approved: false
            }
        });

        res.json({ slug });
    } catch (err) {
        console.error('[API] Create connection error:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Get Connection Status
app.get('/api/connections/:slug', async (req, res) => {
    try {
        const connection = await prisma.connection.findUnique({
            where: { slug: req.params.slug },
            include: { host: true }
        });

        if (!connection) return res.status(404).json({ error: 'Link invalid' });

        // Parse JSON fields
        if (connection.host.toys) connection.host.toys = JSON.parse(connection.host.toys);
        if (connection.history) {
            connection.history = connection.history.map(h => ({
                ...h,
                pulses: h.pulses ? JSON.parse(h.pulses) : []
            }));
        }

        res.json(connection);
    } catch (err) {
        console.error('[API] Get connection error:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Favorite a response
app.post('/api/history/favorite', async (req, res) => {
    const { id, isFavorite } = req.body;
    await prisma.responseHistory.update({
        where: { id },
        data: { isFavorite }
    });
    res.json({ success: true });
});

// Socket.io Logic
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-host', (uid) => {
        socket.uid = uid;
        socket.join(`host:${uid}`);
        console.log(`[SOCKET] Host ${uid} joined room host:${uid}`);
        socket.emit('host:ready', { uid });
    });

    socket.on('join-typist', (slug) => {
        socket.join(`typist:${slug}`);
        console.log(`Typist for ${slug} joined room`);
    });

    socket.on('request-approval', async ({ slug }) => {
        const conn = await prisma.connection.findUnique({
            where: { slug },
            include: { host: true }
        });
        if (conn) {
            // AUTO-APPROVE for simplified UX
            await prisma.connection.update({
                where: { slug },
                data: { approved: true }
            });
            io.to(`typist:${slug}`).emit('approval-status', { approved: true });
            io.to(`host:${conn.host.uid}`).emit('approval-request', { slug });
        }
    });

    socket.on('approve-typist', async ({ slug, approved }) => {
        await prisma.connection.update({
            where: { slug },
            data: { approved }
        });
        io.to(`typist:${slug}`).emit('approval-status', { approved });
    });

    socket.on('host-feedback', ({ uid, type, slug }) => {
        console.log(`[FEEDBACK] Host ${uid} sent ${type} to typist ${slug}`);
        io.to(`typist:${slug}`).emit('host-feedback', { type });
    });

    socket.on('set-base-floor', ({ uid, level }) => {
        console.log(`[CONFIG] Base floor for ${uid} set to ${level}`);
        baseFloors.set(uid, parseInt(level));
        // Trigger one pulse to show/test
        sendCommand(uid, 'vibrate', Math.floor(parseInt(level) / 5), 1);
    });

    socket.on('set-preset', ({ uid, preset }) => {
        console.log(`[PRESET] Host ${uid} set preset to ${preset}`);

        // Clear existing preset for this host
        if (presets.has(uid)) {
            clearInterval(presets.get(uid));
            presets.delete(uid);
        }

        // Emit to all typists for this host
        // We'd need a lookup for slug, but for now we'll just broadcast or rely on client state
        // In a real app we'd find the connection

        if (preset === 'none') {
            io.emit('preset-update', { uid, preset: 'none' }); // Simplified broadcast
            return;
        }

        io.emit('preset-update', { uid, preset });

        const interval = setInterval(() => {
            let strength = 0;
            if (preset === 'pulse') {
                strength = 5;
            } else if (preset === 'wave') {
                strength = Math.floor(Math.sin(Date.now() / 1000) * 5 + 10);
            } else if (preset === 'chaos') {
                strength = Math.floor(Math.random() * 15 + 5);
            }

            sendCommand(uid, 'vibrate', strength, 1);
            io.to(`host:${uid}`).emit('incoming-pulse', { source: 'preset', level: strength });
        }, 2000);

        presets.set(uid, interval);
    });

    socket.on('typing-update', async ({ slug, text }) => {
        const conn = await prisma.connection.findUnique({
            where: { slug },
            include: { host: true }
        });
        if (conn) {
            io.to(`host:${conn.host.uid}`).emit('typing-draft', { text });
        }
    });

    socket.on('test-toy', async ({ uid }) => {
        console.log(`[TEST-TOY] Direct test requested for UID: ${uid}`);
        socket.emit('api-feedback', {
            success: true,
            message: `SERVER RECEIVED CLICK FOR ${uid}. CONNECTING TO LOVENSE...`,
            url: 'local'
        });
        sendCommand(uid, 'Vibrate', 20, 6, socket);
    });

    socket.on('run-diagnostics', async ({ uid }) => {
        const host = await prisma.host.findUnique({ where: { uid } });
        if (!host || !host.toys) {
            socket.emit('api-feedback', { success: false, message: 'DIAGNOSTICS: No toys linked to this ID yet. Scan the QR again!' });
        } else {
            const toys = JSON.parse(host.toys);
            const toyNames = Array.isArray(toys) ? toys.map(t => t.name).join(', ') : Object.values(toys).map(t => t.name).join(', ');
            socket.emit('api-feedback', { success: true, message: `DIAGNOSTICS: Server sees [${toyNames}]. Link is healthy.` });
        }
    });

    // Real-time pulse from typing
    socket.on('typing-pulse', async ({ slug, intensity }) => {
        const conn = await prisma.connection.findUnique({
            where: { slug },
            include: { host: true }
        });

        if (conn && conn.approved) {
            console.log(`[PULSE] Typing pulse for ${slug} -> targeting host ${conn.host.uid}`);
            sendCommand(conn.host.uid, 'vibrate', intensity || 9, 1);
            io.to(`host:${conn.host.uid}`).emit('incoming-pulse', { source: 'typing', level: intensity || 9 });
        } else {
            console.log(`[PULSE] Ignored typing pulse. Conn found: ${!!conn}, Approved: ${conn?.approved}`);
        }
    });

    // Voice level pulse
    socket.on('voice-pulse', async ({ slug, intensity }) => {
        const conn = await prisma.connection.findUnique({
            where: { slug },
            include: { host: true }
        });

        if (conn && conn.approved) {
            console.log(`[PULSE] Voice pulse (${intensity}) from ${slug} -> host ${conn.host.uid}`);
            sendCommand(conn.host.uid, 'vibrate', intensity, 1);
            io.to(`host:${conn.host.uid}`).emit('incoming-pulse', { source: 'voice', level: intensity });
        }
    });

    // Final surge
    socket.on('final-surge', async ({ slug, text, pulses }) => {
        const conn = await prisma.connection.findUnique({
            where: { slug },
            include: { host: true }
        });

        if (conn && conn.approved) {
            const surgeIntensity = 20; // 100% power
            const duration = 3; // Fixed 3 seconds

            sendCommand(conn.host.uid, 'vibrate', surgeIntensity, duration);
            io.to(`host:${conn.host.uid}`).emit('incoming-pulse', { source: 'surge', level: surgeIntensity });

            // Save to history
            await prisma.responseHistory.create({
                data: {
                    connectionId: conn.id,
                    text,
                    pulses: JSON.stringify(pulses || [])
                }
            });

            io.to(`host:${conn.host.uid}`).emit('new-message', { text });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up presets if host disconnects?
        // Actually host might just be refreshing.
    });
});

async function sendCommand(uid, command, strength, duration, directSocket = null) {
    if (!process.env.LOVENSE_DEVELOPER_TOKEN) {
        const err = 'LOVENSE_DEVELOPER_TOKEN is missing in Railway variables!';
        console.error(`[CRITICAL] ${err}`);
        if (directSocket) directSocket.emit('api-feedback', { success: false, message: err });
        return;
    }

    try {
        const host = await prisma.host.findUnique({ where: { uid } });
        const floor = baseFloors.get(uid) || 0;
        const finalStrength = Math.max(strength, Math.floor(floor / 5)); // Strength is 0-20, floor is 0-100

        if (!host || !host.toys) {
            console.log(`[LOVENSE] No toy metadata for ${uid}, sending broadcast command.`);
            return await dispatchRaw(uid, null, 'vibrate', finalStrength, duration, directSocket);
        }

        const toyList = JSON.parse(host.toys);
        const toys = Array.isArray(toyList) ? toyList : Object.values(toyList);
        const commands = [];

        for (const toy of toys) {
            const tId = toy.id || toy.toyId;
            if (tId === 'SIM' && toys.length > 1) continue;
            const targetToyId = tId === 'SIM' ? null : tId;

            // Simplified: Only send Vibrate. Shotgunning 4 commands per keypress causes instant rate-limiting.
            commands.push(dispatchRaw(uid, targetToyId, 'Vibrate', finalStrength, duration, directSocket));
        }

        await Promise.all(commands);
        if (directSocket) directSocket.emit('incoming-pulse', { source: 'test', level: strength });
    } catch (error) {
        console.error('[LOVENSE] Error in command mapping:', error.message);
    }
}

async function dispatchRaw(uid, toyId, command, strength, duration, directSocket = null) {
    // Automatically trim whitespace from the token to prevent Railway paste errors
    const rawToken = process.env.LOVENSE_DEVELOPER_TOKEN || '';
    const token = rawToken.trim();

    if (token) {
        console.log(`[DEBUG] Token Loaded: ${token.substring(0, 4)}...${token.substring(token.length - 4)}`);
    }

    const apiUrls = [
        'https://api.lovense-api.com/api/lan/v2/command',
        'https://api.lovense.com/api/lan/v2/command',
        'https://api.lovense.com/api/standard/v1/command'
    ];

    for (const url of apiUrls) {
        try {
            const domain = url.split('/')[2];
            const isV2 = url.includes('/v2/');

            const payload = {
                token: token,
                uid: uid,
                apiVer: 1,
                sec: duration,      // For V1 Standard API
                timeSec: duration   // For V2 LAN API
            };

            if (isV2) {
                payload.command = "Function";
                payload.action = `${command}:${Math.min(Math.max(strength, 0), 20)}`;
            } else {
                payload.command = command.toLowerCase();
                payload.strength = Math.min(Math.max(strength, 0), 20);
            }

            if (toyId) payload.toyId = toyId;

            console.log(`[LOVENSE] Dispatching via ${domain} (${isV2 ? 'V2' : 'V1'}) | Action: ${payload.action || payload.command}`);
            const response = await axios.post(url, payload, { timeout: 2500 });

            // CRITICAL SUCCESS CHECK: Must have result=true/1/'success'. 
            // Lovense server often returns code:200 even if the toy is offline!
            const isSuccess = response.data.result === true ||
                response.data.result === 1 ||
                response.data.result === 'success' ||
                response.data.message === 'success';

            const feedback = {
                success: isSuccess,
                message: isSuccess ? `TOY RECEIVED SIGNAL (${domain})` : `TOY REJECTED: ${response.data.message || response.data.code || 'Offline'}`,
                code: response.data.code,
                url: domain
            };

            console.log(`[LOVENSE] Result from ${domain}:`, isSuccess ? 'SUCCESS' : 'FAILURE', JSON.stringify(response.data));

            io.to(`host:${uid}`).emit('api-feedback', feedback);
            if (directSocket) directSocket.emit('api-feedback', feedback);

            if (isSuccess) return response.data;
        } catch (e) {
            const errMsg = `FAILOVER (${url.split('/')[2]}): ${e.message}`;
            console.warn(`[LOVENSE] Failover trigger:`, e.message);
            // Don't emit error to user yet, wait for next fallback
        }
    }

    // If we've exhausted all URLs and none succeeded
    const finalErr = "ALL TARGET DOMAINS FAILED OR REJECTED SIGNAL";
    io.to(`host:${uid}`).emit('api-feedback', { success: false, message: finalErr });
    if (directSocket) directSocket.emit('api-feedback', { success: false, message: finalErr });
}

// Fallback for React routing - must be AFTER all other routes
app.get('*', (req, res) => {
    res.sendFile(FRONTEND_INDEX);
});

process.on('uncaughtException', (err) => {
    console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

try {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server fully operational on port ${PORT}`);
        console.log(`🔗 Health check: /health`);
    });
} catch (err) {
    console.error('FAILED TO START SERVER:', err);
}
