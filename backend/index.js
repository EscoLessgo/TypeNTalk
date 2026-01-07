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

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Host: Get QR for linking toy
app.get('/api/lovense/qr', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username required' });

    try {
        const token = process.env.LOVENSE_DEVELOPER_TOKEN;

        if (!token || token.length < 10) {
            console.error('[CRITICAL] LOVENSE_DEVELOPER_TOKEN is missing or too short.');
            return res.status(500).json({
                error: 'LOVENSE_DEVELOPER_TOKEN is not configured.',
                details: 'Please add your Developer Token to the Railway Environment Variables. The app cannot function without it.'
            });
        }

        const response = await axios.post('https://api.lovense.com/api/lan/getQrCode', {
            token: token,
            uid: username,
            uname: username,
            v: 2,
            apiVer: 1,
            type: 'standard'
        });

        if (response.data && response.data.result) {
            res.json(response.data.data);
        } else {
            res.status(500).json({ error: 'Lovense API error', details: response.data });
        }
    } catch (error) {
        console.error('Error getting QR:', error.message);
        if (error.response) {
            console.error('Lovense API Response Error:', error.response.data);
        }
        res.status(500).json({
            error: 'Failed to get QR code from Lovense',
            details: error.response?.data || error.message
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
    const { uid } = req.body; // uid is the host's Lovense UID
    if (!uid) return res.status(400).json({ error: 'Host UID required' });

    // Ensure the host exists in our DB (especially important for 'Skip To Link' flow)
    const host = await prisma.host.upsert({
        where: { uid },
        update: { username: uid },
        create: { uid, username: uid }
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
});

// Get Connection Status
app.get('/api/connections/:slug', async (req, res) => {
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
        sendCommand(uid, 'vibrate', 20, 6, socket);
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
            console.log(`[PULSE] Typing pulse from typist for slug ${slug} -> targeting host ${conn.host.uid}`);
            sendCommand(conn.host.uid, 'vibrate', intensity || 3, 1);
            io.to(`host:${conn.host.uid}`).emit('incoming-pulse', { source: 'typing', level: intensity || 3 });
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
            console.log(`[PULSE] Voice pulse from typist for slug ${slug} -> targeting host ${conn.host.uid} (level ${intensity})`);
            // Voice pulses might use 'air' if available, or just vibration
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
            const surgeIntensity = 15;
            const duration = Math.min(text.length * 0.1, 5); // 0.1s per char, max 5s

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

        if (!host || !host.toys) {
            console.log(`[LOVENSE] No toy metadata for ${uid}, sending broadcast command.`);
            return await dispatchRaw(uid, null, 'vibrate', strength, duration, directSocket);
        }

        const toyList = JSON.parse(host.toys);
        const toys = Array.isArray(toyList) ? toyList : Object.values(toyList);
        const commands = [];

        for (const toy of toys) {
            const tId = toy.id || toy.toyId;
            const name = (toy.name || '').toLowerCase();
            const type = (toy.type || '').toLowerCase();

            if (tId === 'SIM' && toys.length > 1) continue;
            const targetToyId = tId === 'SIM' ? null : tId;

            // Shotgun approach: Fire all possible motor types with Capitalized commands
            commands.push(dispatchRaw(uid, targetToyId, 'Vibrate', strength, duration, directSocket));
            commands.push(dispatchRaw(uid, targetToyId, 'Oscillate', strength, duration, directSocket));
            commands.push(dispatchRaw(uid, targetToyId, 'Rotate', strength, duration, directSocket));
            commands.push(dispatchRaw(uid, targetToyId, 'Pump', strength, duration, directSocket));
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

    const payload = {
        token: token,
        uid: uid,
        command: command,
        strength: Math.min(Math.max(strength, 0), 20),
        timeSec: duration,
        apiVer: 1
    };

    if (toyId) payload.toyId = toyId;

    // Try primary, then secondary if needed
    for (const url of apiUrls) {
        try {
            const domain = url.split('/')[2];
            console.log(`[LOVENSE] Sending ${command}:${strength} to ${uid} via ${domain}`);
            const response = await axios.post(url, payload, { timeout: 8000 });

            const isSuccess = response.data.result === true || response.data.code === 200 || response.data.result === 'success';

            const feedback = {
                success: isSuccess,
                message: isSuccess ? `TOY RESPONDED OK (${domain})` : `API REJECTED: ${response.data.message || response.data.code}`,
                code: response.data.code,
                url: domain
            };

            io.to(`host:${uid}`).emit('api-feedback', feedback);
            if (directSocket) directSocket.emit('api-feedback', feedback);

            if (isSuccess) return response.data;
        } catch (e) {
            const errMsg = `NETWORK ERROR: ${e.message} (Is Lovense API down?)`;
            console.error(`[LOVENSE] Network error for ${url.split('/')[2]}:`, e.message);

            const feedback = { success: false, message: errMsg, url: url.split('/')[2] };
            io.to(`host:${uid}`).emit('api-feedback', feedback);
            if (directSocket) directSocket.emit('api-feedback', feedback);
        }
    }
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
