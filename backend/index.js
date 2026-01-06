require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;
const LOVENSE_URL = 'https://api.lovense.com/api/lan/v2/command';

// API Routes
app.get('/', (req, res) => {
    res.send('<h1>Veroe Sync API</h1><p>The backend is running. Go to <a href="http://localhost:5173">localhost:5173</a> to use the app.</p>');
});

// Host: Get QR for linking toy
app.get('/api/lovense/qr', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username required' });

    try {
        const token = process.env.LOVENSE_DEVELOPER_TOKEN;
        const response = await axios.post('https://api.lovense.com/api/lan/getQrCode', {
            token: token,
            uid: username,
            uname: username,
            type: 'standard',
            v: 2
        });

        if (response.data && response.data.result) {
            res.json(response.data.data);
        } else {
            res.status(500).json({ error: 'Lovense API error', details: response.data });
        }
    } catch (error) {
        console.error('Error getting QR:', error.message);
        res.status(500).json({ error: 'Failed to get QR code' });
    }
});

// Lovense Callback
app.post('/api/lovense/callback', async (req, res) => {
    console.log('Lovense Callback:', JSON.stringify(req.body, null, 2));
    const { uid, toys } = req.body;

    if (uid) {
        await prisma.host.upsert({
            where: { uid: uid },
            update: { toys: toys, username: uid },
            create: { uid: uid, username: uid, toys: toys }
        });

        io.to(`host:${uid}`).emit('lovense:linked', { toys });
    }

    res.json({ result: true });
});

// Create Connection Link
app.post('/api/connections/create', async (req, res) => {
    const { uid } = req.body; // uid is the host's Lovense UID
    if (!uid) return res.status(400).json({ error: 'Host UID required' });

    const host = await prisma.host.findUnique({ where: { uid } });
    if (!host) return res.status(404).json({ error: 'Host not found. Link toy first.' });

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
        socket.join(`host:${uid}`);
        console.log(`Host ${uid} joined room`);
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
            io.to(`host:${conn.host.uid}`).emit('approval-request', { slug });
        }
    });

    // Host approves/denies typist
    socket.on('approve-typist', async ({ slug, approved }) => {
        const conn = await prisma.connection.update({
            where: { slug },
            data: { approved }
        });
        io.to(`typist:${slug}`).emit('approval-status', { approved });
    });

    // Real-time pulse from typing
    socket.on('typing-pulse', async ({ slug, intensity }) => {
        const conn = await prisma.connection.findUnique({
            where: { slug },
            include: { host: true }
        });

        if (conn && conn.approved) {
            sendCommand(conn.host.uid, 'vibrate', intensity || 3, 1);
            io.to(`host:${conn.host.uid}`).emit('incoming-pulse');
        }
    });

    // Voice level pulse
    socket.on('voice-pulse', async ({ slug, intensity }) => {
        const conn = await prisma.connection.findUnique({
            where: { slug },
            include: { host: true }
        });

        if (conn && conn.approved) {
            // Voice pulses might use 'air' if available, or just vibration
            sendCommand(conn.host.uid, 'vibrate', intensity, 1);
            io.to(`host:${conn.host.uid}`).emit('incoming-pulse');
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
            io.to(`host:${conn.host.uid}`).emit('incoming-pulse');

            // Save to history
            await prisma.responseHistory.create({
                data: {
                    connectionId: conn.id,
                    text,
                    pulses: pulses || []
                }
            });

            io.to(`host:${conn.host.uid}`).emit('new-message', { text });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

async function sendCommand(uid, command, strength, duration) {
    try {
        const host = await prisma.host.findUnique({ where: { uid } });
        if (!host || !host.toys) {
            // Fallback to generic vibrate if no toy info stored
            return await dispatchRaw(uid, 'vibrate', strength, duration);
        }

        const toyList = host.toys; // This is a Record<id, toyDetails>
        const commands = [];

        for (const [tId, toy] of Object.entries(toyList)) {
            const name = (toy.name || '').toLowerCase();
            const type = (toy.type || '').toLowerCase();

            // Default: Most toys support 'vibrate'
            commands.push(dispatchRaw(uid, 'vibrate', strength, duration));

            // Specialized Actions
            if (name.includes('nora') || type === 'nora') {
                // Nora supports rotation. For pulses, we can add a quick rotation.
                commands.push(dispatchRaw(uid, 'rotate', Math.ceil(strength / 2), duration));
            }

            if (name.includes('max') || type === 'max') {
                // Max is suction/pumping. 
                // Pumping strength is 0-3 in some APIs, but Standard API often maps 0-20.
                commands.push(dispatchRaw(uid, 'pump', strength, duration));
            }

            if (name.includes('edge') || type === 'edge') {
                // Edge has dual motors, vibrate usually hits both.
            }
        }

        await Promise.all(commands);
    } catch (error) {
        console.error('Error in intelligent command mapping:', error.message);
    }
}

async function dispatchRaw(uid, command, strength, duration) {
    const payload = {
        token: process.env.LOVENSE_DEVELOPER_TOKEN,
        uid: uid,
        command: command,
        strength: Math.min(strength, 20),
        timeSec: duration,
        apiVer: 1
    };
    return axios.post(LOVENSE_URL, payload).catch(e => {
        console.error(`Fetch failed for ${command}:`, e.message);
    });
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
