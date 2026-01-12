require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL is not set. Using IN-MEMORY FALLBACK.');
}

const prisma = new PrismaClient();

// Fallback Memory Store (if DB is down)
const memoryStore = {
    hosts: new Map(), // uid -> hostObject
    connections: new Map(), // slug -> connObject
    responses: [],
    visitorLogs: []
};

// Unified Data Access Helpers
async function getHost(uid) {
    if (!uid) return null;
    try {
        const host = await prisma.host.findUnique({ where: { uid } });
        if (host) {
            if (typeof host.toys === 'string') host.toys = JSON.parse(host.toys);
            return host;
        }
    } catch (e) { }
    return memoryStore.hosts.get(uid);
}

async function getConnection(slug) {
    if (!slug) return null;

    // Check memory first for ephemeral status
    const memConn = memoryStore.connections.get(slug);

    try {
        const conn = await prisma.connection.findUnique({
            where: { slug },
            include: { host: true }
        });
        if (conn) {
            // Merge memory status if it exists
            if (memConn) return { ...conn, approved: memConn.approved };

            // If not in memory but in DB, seed memory
            memoryStore.connections.set(slug, {
                slug: conn.slug,
                hostId: conn.hostId,
                hostUid: conn.host?.uid,
                approved: conn.approved,
                createdAt: conn.createdAt
            });
            return conn;
        }
    } catch (e) {
        console.error('[DB] Error fetching connection:', slug, e.message);
    }

    if (memConn) {
        // Hydrate host for memory connection
        const host = await getHost(memConn.hostUid);
        return { ...memConn, host };
    }
    return null;
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
    const token = (process.env.LOVENSE_DEVELOPER_TOKEN || '').trim();
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', database: 'connected', lovense: token ? 'SET' : 'MISSING', timestamp: new Date() });
    } catch (err) {
        res.status(200).json({
            status: 'warning',
            database: 'disconnected',
            mode: 'IN-MEMORY-FALLBACK',
            lovense: token ? 'SET' : 'MISSING',
            error: err.message,
            timestamp: new Date()
        });
    }
});

const qrCache = new Map();
const presets = new Map(); // uid -> interval
const baseFloors = new Map(); // uid -> level
const commandQueues = new Map(); // uid -> { timeout, pendingStrength, lastSent }
const preferredUrls = new Map(); // uid -> string (the successful URL)

// GLOBAL RATE LIMITER (To prevent IP-wide 50500 blocks)
let lastGlobalRequestTime = 0;
const GLOBAL_COOLDOWN = 400; // tuned to 2.5 req/sec
let globalRequestQueue = [];
let isProcessingGlobalQueue = false;

async function processGlobalQueue() {
    if (isProcessingGlobalQueue || globalRequestQueue.length === 0) return;
    isProcessingGlobalQueue = true;

    while (globalRequestQueue.length > 0) {
        const now = Date.now();
        const timeSinceLast = now - lastGlobalRequestTime;

        if (timeSinceLast < GLOBAL_COOLDOWN) {
            await new Promise(r => setTimeout(r, GLOBAL_COOLDOWN - timeSinceLast));
        }

        const { task, resolve, reject } = globalRequestQueue.shift();
        lastGlobalRequestTime = Date.now();

        try {
            const result = await task();
            resolve(result);
        } catch (e) {
            reject(e);
        }
    }

    isProcessingGlobalQueue = false;
}

function enqueueGlobalRequest(task) {
    return new Promise((resolve, reject) => {
        globalRequestQueue.push({ task, resolve, reject });
        processGlobalQueue();
    });
}

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
        if (!token) return res.status(500).json({ error: 'LOVENSE_DEVELOPER_TOKEN missing.' });

        const domains = [
            'https://api.lovense-api.com',
            'https://api.lovense.com',
            'https://api.v-connect.com', // Additional fallback
            'https://api-us.lovense.com'  // US-specific fallback
        ];

        let lastError = null;

        for (const domain of domains) {
            try {
                console.log(`[LOVENSE] Attempting QR generation via ${domain} (Global Queue: ${globalRequestQueue.length})...`);

                const response = await enqueueGlobalRequest(() => axios.post(`${domain}/api/lan/getQrCode`, {
                    token: token,
                    uid: username,
                    uname: username,
                    v: 2,
                    apiVer: 1,
                    type: 'standard'
                }, { timeout: 8000 }));

                if (response.data && (response.data.result === true || response.data.result === 1)) {
                    qrCache.set(username, { data: response.data.data, time: Date.now() });
                    return res.json(response.data.data);
                }

                // If we got a specific "IP restricted" or rate limit message, don't just fail silently
                if (response.data && response.data.code === 50500) {
                    console.error(`[LOVENSE] ${domain} reported IP restriction:`, response.data.message);
                    lastError = {
                        error: 'IP Restricted by Lovense',
                        details: 'Lovense has temporarily blocked our server IP for frequent access. This usually clears in 10-15 minutes.',
                        raw: response.data
                    };
                    continue; // Try the other domain
                }

                console.warn(`[LOVENSE] ${domain} returned unsuccessful result:`, response.data);
                lastError = response.data;
            } catch (err) {
                console.error(`[LOVENSE] Request to ${domain} failed:`, err.message);
                lastError = err.message;
            }
        }

        // If all domains failed
        res.status(500).json({
            error: 'Lovense API Error',
            details: lastError
        });

    } catch (error) {
        console.error('Fatal Error getting QR:', error.message);
        res.status(500).json({ error: 'System error', details: error.message });
    }
});

// Lovense Callback
app.post('/api/lovense/callback', async (req, res) => {
    console.log('Lovense Callback:', JSON.stringify(req.body, null, 2));
    const { uid, toys } = req.body;

    if (uid) {
        console.log(`[CALLBACK] Successful link for UID: ${uid}`);
        try {
            await prisma.host.upsert({
                where: { uid: uid },
                update: { toys: JSON.stringify(toys), username: uid },
                create: { uid: uid, username: uid, toys: JSON.stringify(toys) }
            });
        } catch (dbErr) {
            console.warn('[DB] Fallback to memory for host upsert');
            memoryStore.hosts.set(uid, { uid, toys: JSON.stringify(toys), username: uid, id: `mem-${uid}` });
        }

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
        const { uid } = req.body;
        if (!uid) return res.status(400).json({ error: 'Host UID required' });

        let host;
        let existingSlug;

        try {
            host = await prisma.host.upsert({
                where: { uid: uid },
                update: { username: uid },
                create: { uid: uid, username: uid }
            });
        } catch (dbErr) {
            host = { uid, username: uid, id: `mem-${uid}` };
            memoryStore.hosts.set(uid, host);
        }

        // SLUG REUSE: Reuse the most recent slug for this host if it exists.
        // This prevents the Typist from losing connection if the Host refreshes their page.
        try {
            const existing = await prisma.connection.findFirst({
                where: { hostId: host.id },
                orderBy: { createdAt: 'desc' }
            });
            // Reuse if less than 12 hours old
            if (existing && (Date.now() - new Date(existing.createdAt).getTime() < 12 * 60 * 60 * 1000)) {
                existingSlug = existing.slug;
            }
        } catch (e) {
            const memExisting = Array.from(memoryStore.connections.values())
                .find(c => c.hostUid === uid);
            if (memExisting && (Date.now() - new Date(memExisting.createdAt).getTime() < 12 * 60 * 60 * 1000)) {
                existingSlug = memExisting.slug;
            }
        }

        if (existingSlug) {
            console.log(`[SESSION] Reusing existing slug ${existingSlug} for host ${uid} | Resetting Approval: REQUIRED`);

            // 1. Memory Sync FIRST (Atomic for current server session)
            const memConn = memoryStore.connections.get(existingSlug);
            if (memConn) {
                memConn.approved = false;
            } else {
                memoryStore.connections.set(existingSlug, {
                    slug: existingSlug,
                    hostId: host.id,
                    hostUid: uid,
                    approved: false,
                    createdAt: new Date()
                });
            }

            // 2. DB Sync
            try {
                await prisma.connection.update({
                    where: { slug: existingSlug },
                    data: { approved: false }
                });
            } catch (e) {
                console.warn('[DB] Failed to reset approval in DB, but memory is updated.');
            }

            // 3. Notify
            io.to(`typist:${existingSlug}`).emit('approval-status', { approved: false });
            return res.json({ slug: existingSlug });
        }

        const slug = uuidv4().substring(0, 8);
        try {
            await prisma.connection.create({
                data: { slug, hostId: host.id, approved: false }
            });
        } catch (dbErr) {
            memoryStore.connections.set(slug, {
                slug,
                hostId: host.id,
                hostUid: uid,
                approved: false,
                createdAt: new Date()
            });
        }

        res.json({ slug });
    } catch (err) {
        console.error('[API] Create connection error:', err);
        res.status(500).json({ error: 'System Error', details: err.message });
    }
});

// Get Connection Status
app.get('/api/connections/:slug', async (req, res) => {
    try {
        const connection = await getConnection(req.params.slug);
        if (!connection) return res.status(404).json({ error: 'Link invalid' });
        res.json(connection);
    } catch (err) {
        console.error('[API] Get connection error:', err);
        res.status(500).json({ error: 'System Error', details: err.message });
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

// Analytics - Track a view
app.post('/api/analytics/track', async (req, res) => {
    try {
        const { slug, locationData } = req.body;
        if (!slug) return res.status(400).json({ error: 'Slug required' });

        const conn = await getConnection(slug);
        if (!conn) return res.status(404).json({ error: 'Connection not found' });

        const logData = {
            connectionId: conn.id,
            ip: locationData.query,
            city: locationData.city,
            region: locationData.region,
            regionName: locationData.regionName,
            country: locationData.country,
            countryCode: locationData.countryCode,
            isp: locationData.isp,
            org: locationData.org,
            as: locationData.as,
            zip: locationData.zip,
            lat: locationData.lat,
            lon: locationData.lon,
            timezone: locationData.timezone
        };

        try {
            await prisma.visitorLog.create({ data: logData });
        } catch (dbErr) {
            console.warn('[DB] Fallback to memory for visitor log');
            memoryStore.visitorLogs.push({ ...logData, id: uuidv4(), createdAt: new Date() });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[API] Analytics track error:', err);
        res.status(500).json({ error: 'System Error', details: err.message });
    }
});

// Analytics - Get logs for a connection
app.get('/api/analytics/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const conn = await getConnection(slug);
        if (!conn) return res.status(404).json({ error: 'Connection not found' });

        let logs = [];
        try {
            logs = await prisma.visitorLog.findMany({
                where: { connectionId: conn.id },
                orderBy: { createdAt: 'desc' }
            });
        } catch (dbErr) {
            logs = memoryStore.visitorLogs
                .filter(l => l.connectionId === conn.id)
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }

        res.json(logs);
    } catch (err) {
        console.error('[API] Analytics fetch error:', err);
        res.status(500).json({ error: 'System Error', details: err.message });
    }
});

// Admin - Summary Stats
app.get('/api/admin/summary', async (req, res) => {
    try {
        let hostCount = 0;
        let connCount = 0;
        let logCount = 0;

        try {
            hostCount = await prisma.host.count();
            connCount = await prisma.connection.count();
            logCount = await prisma.visitorLog.count();
        } catch (e) {
            hostCount = memoryStore.hosts.size;
            connCount = memoryStore.connections.size;
            logCount = memoryStore.visitorLogs.length;
        }

        res.json({ hostCount, connCount, logCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin - All Connections
app.get('/api/admin/connections', async (req, res) => {
    try {
        let connections = [];
        try {
            connections = await prisma.connection.findMany({
                include: {
                    host: true,
                    _count: {
                        select: { visitorLogs: true, history: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
        } catch (e) {
            connections = Array.from(memoryStore.connections.values()).map(c => ({
                ...c,
                host: Array.from(memoryStore.hosts.values()).find(h => h.uid === c.hostUid),
                _count: {
                    visitorLogs: memoryStore.visitorLogs.filter(l => l.connectionId === c.id).length,
                    history: 0
                }
            })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        res.json(connections);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin - Delete Connection
app.delete('/api/admin/connections/:slug', async (req, res) => {
    const { slug } = req.params;
    try {
        memoryStore.connections.delete(slug);
        await prisma.connection.delete({ where: { slug } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Socket.io Logic
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('clear-qr-cache', ({ username }) => {
        if (username) {
            console.log(`[LOVENSE] Clearing QR cache for ${username}`);
            qrCache.delete(username);
        }
    });

    socket.on('join-host', (uid) => {
        socket.uid = uid;
        socket.join(`host:${uid}`);
        console.log(`[SOCKET] Host ${uid} joined room host:${uid}`);
        socket.emit('host:ready', { uid });
    });

    socket.on('join-typist', async (slug) => {
        if (!slug) return;
        socket.join(`typist:${slug}`);
        console.log(`[SOCKET] Typist for ${slug} joined room (Socket: ${socket.id})`);

        // Sync current approval status immediately
        const conn = await getConnection(slug);
        if (conn) {
            // Only send approval-status if NOT already approved
            // This prevents the race condition where re-joining resets an approved session
            if (!conn.approved) {
                socket.emit('approval-status', { approved: conn.approved });
            }
            // Notify host that partner is here
            if (conn.host) {
                const hostUid = conn.host.uid.toLowerCase();
                console.log(`[SOCKET] Alerting Host ${hostUid} that partner joined`);
                io.to(`host:${hostUid}`).emit('partner-joined', { slug });
            }
        }
    });

    socket.on('latency-ping', (startTime, cb) => {
        if (typeof cb === 'function') cb(startTime);
    });

    socket.on('request-approval', async (data = {}) => {
        const { slug, name } = data;
        const displayName = (name && typeof name === 'string' && name.trim()) ? name.trim() : 'Anonymous';

        console.log(`[SOCKET] Approval Request: Typist="${displayName}" for Slug=${slug}`);

        const conn = await getConnection(slug);
        if (conn && conn.host) {
            const room = `host:${conn.host.uid}`;
            const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
            console.log(`[SOCKET] Forwarding request to host room: ${room} (Size: ${roomSize})`);
            io.to(room).emit('approval-request', { slug, name: displayName });
        } else {
            console.warn(`[SOCKET] Failed to find host for slug ${slug} during approval request (Conn found: ${!!conn})`);
        }
    });

    socket.on('approve-typist', async ({ slug, approved }) => {
        console.log(`[APPROVAL-COMMIT] Status -> ${approved ? 'TRUE' : 'FALSE'} for Slug=${slug} (Requested by Socket: ${socket.id})`);

        try {
            await prisma.connection.update({
                where: { slug },
                data: { approved }
            });
            console.log(`[DB] Approval updated for ${slug}`);
        } catch (e) {
            console.error(`[DB-ERROR] Failed to update approval for ${slug}: ${e.message}`);
            const memConn = memoryStore.connections.get(slug);
            if (memConn) {
                memConn.approved = approved;
                console.log(`[MEMORY] Approval updated for ${slug}`);
            } else {
                console.warn(`[WARNING] No memory connection found for ${slug} to update approval.`);
            }
        }

        const room = `typist:${slug}`;
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
        console.log(`[APPROVAL-EMIT] Sending approval-status to ${room} (Size: ${roomSize})`);

        if (roomSize === 0) {
            console.warn(`[WARNING] Typist room ${room} is empty! Typist might have disconnected or hasn't joined yet.`);
        }

        io.to(room).emit('approval-status', { approved });
    });

    socket.on('host-feedback', (data = {}, ack) => {
        const { uid, type, slug } = data;
        const room = `typist:${slug}`;
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;

        console.log(`[SIGNAL] Host "${uid}" -> Typist room "${room}" (Size: ${roomSize}) | Type: ${type}`);

        // Send acknowledgement if callback provided
        if (typeof ack === 'function') {
            ack({ received: true, room, roomSize });
        }

        if (!slug) {
            socket.emit('api-feedback', { success: false, message: "ERROR: Missing connection slug." });
            return;
        }

        if (roomSize === 0) {
            console.warn(`[SIGNAL] Warning: Room ${room} is EMPTY. Signal dropped.`);
            socket.emit('api-feedback', {
                success: false,
                message: "SIGNAL NOT DELIVERED: Partner is offline or disconnected."
            });
            return;
        }

        io.to(room).emit('host-feedback', { type });
        socket.emit('api-feedback', {
            success: true,
            message: `Feedback Delivered (${type.toUpperCase()})`
        });
    });

    socket.on('host-message', (data = {}) => {
        const { slug, text, uid } = data;
        if (!slug || !text) return;

        const room = `typist:${slug}`;
        console.log(`[MESSAGE] Host ${uid} -> Typist ${slug}: ${text}`);

        io.to(room).emit('host-message', { text, from: uid || 'Host' });
        socket.emit('api-feedback', { success: true, message: "Message Sent to Partner" });
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

        io.emit('preset-update', { uid, preset });

        if (preset === 'none') return;

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
            io.to(`host:${uid.toLowerCase()}`).emit('incoming-pulse', { source: 'preset', level: strength });
        }, 2000);

        presets.set(uid, interval);
    });

    socket.on('typing-update', async ({ slug, text }) => {
        const conn = await getConnection(slug);
        if (conn && conn.host && conn.approved) {
            const hostUid = conn.host.uid.toLowerCase();
            io.to(`host:${hostUid}`).emit('typing-draft', { text });
        }
    });

    socket.on('test-toy', async ({ uid }) => {
        const targetUid = uid || socket.uid;
        console.log(`[TEST-TOY] Direct test requested for UID: ${targetUid}`);
        socket.emit('api-feedback', {
            success: true,
            message: `SERVER RECEIVED CLICK FOR ${targetUid}. CONNECTING TO LOVENSE...`,
            url: 'local'
        });
        sendCommand(targetUid, 'Vibrate', 20, 6, socket);
    });

    socket.on('run-diagnostics', async ({ uid }) => {
        const targetUid = uid || socket.uid;
        const host = await getHost(targetUid);
        if (!host || !host.toys) {
            socket.emit('api-feedback', { success: false, message: 'DIAGNOSTICS: No toys linked to this ID yet. Scan the QR again!' });
        } else {
            const toys = host.toys;
            const toyNames = Array.isArray(toys) ? toys.map(t => t.name).join(', ') : Object.values(toys).map(t => t.name).join(', ');
            socket.emit('api-feedback', { success: true, message: `DIAGNOSTICS: Server sees [${toyNames}]. Link is healthy.` });
        }
    });

    // Real-time pulse from typing
    socket.on('typing-pulse', async ({ slug, intensity }) => {
        const conn = await getConnection(slug);
        const isApproved = conn?.approved === true;

        if (conn && conn.host && isApproved) {
            // Normalize UID to lowercase to match frontend
            const hostUid = conn.host.uid.toLowerCase();
            const room = `host:${hostUid}`;
            const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
            console.log(`[PULSE] Typing for ${slug} -> Host ${hostUid} (Room Size: ${roomSize}) | Status: APPROVED`);

            sendCommand(conn.host.uid, 'vibrate', intensity || 9, 1);
            io.to(room).emit('incoming-pulse', { source: 'typing', level: intensity || 9 });
        } else {
            if (intensity > 2) {
                console.warn(`[BLOCK] Illegal Typing Pulse from ${slug}. Found: ${!!conn}, Host: ${!!conn?.host}, Approved: ${isApproved}`);
            }
        }
    });

    // Voice level pulse
    socket.on('voice-pulse', async ({ slug, intensity }) => {
        const conn = await getConnection(slug);

        if (conn && conn.host && conn.approved) {
            const hostUid = conn.host.uid.toLowerCase();
            console.log(`[PULSE] Voice (${intensity}) from ${slug} -> host ${hostUid}`);
            sendCommand(conn.host.uid, 'vibrate', intensity, 1);
            io.to(`host:${hostUid}`).emit('incoming-pulse', { source: 'voice', level: intensity });
        }
    });

    // Final surge
    socket.on('final-surge', async ({ slug, text, pulses }) => {
        console.log(`[SURGE] Request from ${slug} | Text: ${text?.substring(0, 20)}...`);
        const conn = await getConnection(slug);
        const isApproved = conn?.approved === true;

        if (!conn) {
            socket.emit('error', 'Connection not found.');
            return;
        }

        if (!isApproved) {
            console.warn(`[SURGE] BLOCKED: Typist ${slug} is not approved.`);
            socket.emit('api-feedback', { success: false, message: "SURGE BLOCKED: You are not approved by the host yet." });
            return;
        }

        if (conn.host) {
            const hostUid = conn.host.uid.toLowerCase();
            const surgeIntensity = 20; // 100% power
            const duration = 3; // Fixed 3 seconds

            console.log(`[SURGE] Executing for host ${hostUid} at 100%`);
            sendCommand(conn.host.uid, 'vibrate', surgeIntensity, duration);
            io.to(`host:${hostUid}`).emit('incoming-pulse', { source: 'surge', level: surgeIntensity });

            // Save to history
            try {
                await prisma.responseHistory.create({
                    data: {
                        connectionId: conn.id,
                        text,
                        pulses: JSON.stringify(pulses || [])
                    }
                });
            } catch (e) {
                console.error('[DB] Failed to save surge history:', e.message);
            }

            io.to(`host:${hostUid}`).emit('new-message', { text });
            socket.emit('api-feedback', { success: true, message: "SURGE DELIVERED 🔥" });
        } else {
            console.error(`[SURGE] ERROR: No host linked to slug ${slug}`);
            socket.emit('api-feedback', { success: false, message: "SIGNAL ERROR: No host found for this link." });
        }
    });

    socket.on('host-climax', ({ uid, slug }) => {
        const room = `typist:${slug}`;
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
        console.log(`[CLIMAX] Host ${uid} reach climax, alerting slug ${slug} (Room Size: ${roomSize})`);

        if (roomSize === 0) {
            console.warn(`[CLIMAX] Warning: Room ${room} is EMPTY. Climax alert dropped.`);
            socket.emit('api-feedback', {
                success: false,
                message: "SIGNAL NOT DELIVERED: Partner is offline."
            });
            return;
        }

        io.to(room).emit('climax-requested');
        socket.emit('api-feedback', {
            success: true,
            message: "CLIMAX ALERT DELIVERED! 🔥"
        });
    });

    socket.on('terminate-session', async ({ slug }) => {
        if (!slug) return;
        console.log(`[TERMINATE] Host requested termination for ${slug}`);

        try {
            await prisma.connection.update({
                where: { slug },
                data: { approved: false }
            });
        } catch (e) {
            const mem = memoryStore.connections.get(slug);
            if (mem) mem.approved = false;
        }

        io.to(`typist:${slug}`).emit('session-terminated', {
            message: "Host has ended the session. Connection terminated."
        });
        io.to(`typist:${slug}`).emit('approval-status', { approved: false });
    });

    socket.on('trigger-climax', async ({ slug, pattern }) => {
        const conn = await getConnection(slug);
        const isApproved = conn?.approved === true;

        if (conn && conn.host && isApproved) {
            const hostUid = conn.host.uid.toLowerCase();
            console.log(`[CLIMAX] Triggering climax for ${hostUid} | Approved: ${isApproved}`);

            io.to(`host:${hostUid}`).emit('incoming-pulse', { source: 'climax', level: 20 });
            io.to(`host:${hostUid}`).emit('api-feedback', {
                success: true,
                message: "🔥 CLIMAX TRIGGERED! 100% POWER ENGAGED! 🔥"
            });

            if (pattern && Array.isArray(pattern)) {
                // Run the custom pattern
                for (const step of pattern) {
                    sendCommand(conn.host.uid, 'vibrate', step.intensity, step.duration);
                    if (step.duration > 0) {
                        await new Promise(r => setTimeout(r, step.duration * 1000));
                    }
                }
            } else {
                // Default intense climax pattern: 10 seconds of 100% intensity
                sendCommand(conn.host.uid, 'vibrate', 20, 10);
            }
        }
    });

    socket.on('toggle-overdrive', async ({ slug, active }) => {
        const conn = await getConnection(slug);

        if (conn && conn.host && conn.approved) {
            const uid = conn.host.uid;
            const hostUid = uid.toLowerCase();
            console.log(`[OVERDRIVE] Host ${hostUid} via Typist ${slug} -> ${active}`);

            if (presets.has(uid)) {
                clearInterval(presets.get(uid));
                presets.delete(uid);
            }

            if (active) {
                sendCommand(uid, 'vibrate', 20, 2);
                const interval = setInterval(() => {
                    sendCommand(uid, 'vibrate', 20, 2);
                    io.to(`host:${hostUid}`).emit('incoming-pulse', { source: 'overdrive', level: 20 });
                }, 1500);
                presets.set(uid, interval);
                io.to(`host:${hostUid}`).emit('api-feedback', { success: true, message: "⚠️ OVERDRIVE ACTIVE: 100% POWER!" });
            } else {
                sendCommand(uid, 'vibrate', 0, 1);
                io.to(`host:${hostUid}`).emit('api-feedback', { success: true, message: "Overdrive Disengaged." });
            }
            io.to(`host:${hostUid}`).emit('overdrive-status', { active });
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
        const err = 'LOVENSE_DEVELOPER_TOKEN is missing!';
        if (directSocket) directSocket.emit('api-feedback', { success: false, message: err });
        return;
    }

    const floor = baseFloors.get(uid) || 0;
    const finalStrength = Math.max(strength, Math.floor(floor / 5));

    // --- THROTTLING LOGIC ---
    // Lovense Cloud API is heavily rate-limited (1-2 req/sec). 
    // We must buffer keypresses to prevent IP blacklisting.
    const now = Date.now();
    let queue = commandQueues.get(uid);

    if (!queue) {
        queue = { timeout: null, pendingStrength: 0, lastSent: 0 };
        commandQueues.set(uid, queue);
    }

    // If we've sent a command very recently (< 400ms), buffer this one
    const cooldown = 400;
    if (now - queue.lastSent < cooldown) {
        // Only keep the strongest pulse during the wait window
        queue.pendingStrength = Math.max(queue.pendingStrength, finalStrength);

        if (!queue.timeout) {
            queue.timeout = setTimeout(async () => {
                const s = queue.pendingStrength;
                queue.timeout = null;
                queue.pendingStrength = 0;
                await performDispatch(uid, s, duration, directSocket);
            }, cooldown - (now - queue.lastSent));
        }
        return;
    }

    // Immediate send if outside cooldown
    await performDispatch(uid, finalStrength, duration, directSocket);
}

async function performDispatch(uid, strength, duration, directSocket) {
    const queue = commandQueues.get(uid);
    if (queue) queue.lastSent = Date.now();

    try {
        const host = await getHost(uid);
        if (!host || !host.toys) {
            // If no toys, try a direct broadcast to all linked devices via Lovense Cloud UID
            return await dispatchRaw(uid, null, 'vibrate', strength, duration, directSocket);
        }

        const toys = typeof host.toys === 'string' ? JSON.parse(host.toys) : host.toys;
        const toyList = Array.isArray(toys) ? toys : Object.values(toys);
        const commands = [];

        for (const toy of toyList) {
            const tId = toy.id || toy.toyId;
            if (tId === 'SIM' && toyList.length > 1) continue;
            commands.push(dispatchRaw(uid, tId === 'SIM' ? null : tId, 'vibrate', strength, duration, directSocket));
        }

        await Promise.all(commands);
        if (directSocket && strength > 0) directSocket.emit('incoming-pulse', { source: 'test', level: strength });
    } catch (error) {
        console.error('[LOVENSE] Dispatch Error:', error.message);
    }
}

async function dispatchRaw(uid, toyId, command, strength, duration, directSocket = null) {
    const token = (process.env.LOVENSE_DEVELOPER_TOKEN || '').trim();

    // Use preferred URL if we found one that works for this user
    const savedUrl = preferredUrls.get(uid);

    const apiUrls = [
        'https://api.lovense.com/api/standard/v1/command',
        'https://api.lovense-api.com/api/standard/v1/command'
    ];

    // Reorder to try the successfull one first
    if (savedUrl) {
        const idx = apiUrls.indexOf(savedUrl);
        if (idx > -1) apiUrls.splice(idx, 1);
        apiUrls.unshift(savedUrl);
    }

    for (const url of apiUrls) {
        try {
            const domain = url.split('/')[2];

            // Standard V1 API Payload
            const payload = {
                token: token,
                uid: uid,
                apiVer: 1,
                sec: duration,
                timeSec: duration
            };

            // Force capitalization for Standard API (e.g. "Vibrate")
            payload.command = command.charAt(0).toUpperCase() + command.slice(1).toLowerCase();
            payload.strength = Math.min(Math.max(strength, 0), 20);

            if (toyId) payload.toyId = toyId;

            console.log(`[LOVENSE] Dispatching to ${domain}:`, JSON.stringify(payload));

            const response = await enqueueGlobalRequest(() => axios.post(url, payload, { timeout: 3500 }));
            const isIpBlock = response.data.code === 50500;
            const isSuccess = response.data.result === true || response.data.result === 1 || response.data.result === 'success' || response.data.message === 'success';

            // If success, store this as preferred for next time
            if (isSuccess && url !== savedUrl) {
                console.log(`[LOVENSE] URL Optimized: Using ${domain} for ${uid}`);
                preferredUrls.set(uid, url);
            }

            const feedback = {
                success: isSuccess,
                message: isSuccess ? `TOY RECEIVED SIGNAL (${domain})` :
                    (isIpBlock ? `LOVENSE BLOCK: Server IP Restricted. Try again in 5min.` : `TOY REJECTED: ${response.data.message || response.data.code || 'Offline'}`),
                code: response.data.code,
                url: domain,
                details: response.data
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
