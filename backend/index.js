require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL is not set. Using IN-MEMORY FALLBACK.');
}

console.log('🚀 Backend v2.1 - Legacy room fix deployed');

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
        // Find by Lovense UID or Vanity Slug
        const host = await prisma.host.findFirst({
            where: {
                OR: [
                    { uid },
                    { vanitySlug: uid }
                ]
            }
        });
        if (host) {
            if (typeof host.toys === 'string') host.toys = JSON.parse(host.toys);
            if (typeof host.settings === 'string') host.settings = JSON.parse(host.settings);
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
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', database: 'connected', timestamp: new Date() });
    } catch (err) {
        res.json({ status: 'warning', database: 'fallback', timestamp: new Date() });
    }
});

// AUTH - Google Login/Link
app.post('/api/auth/google', async (req, res) => {
    const { credential, lovenseUid } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: [process.env.GOOGLE_CLIENT_ID]
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        let host = await prisma.host.findUnique({ where: { googleId } });

        if (!host && email) {
            host = await prisma.host.findUnique({ where: { email } });
        }

        if (host) {
            host = await prisma.host.update({
                where: { id: host.id },
                data: {
                    googleId,
                    avatar: picture,
                    email
                }
            });
        } else if (lovenseUid) {
            const existingHost = await prisma.host.findUnique({ where: { uid: lovenseUid } });
            if (existingHost) {
                host = await prisma.host.update({
                    where: { id: existingHost.id },
                    data: { googleId, email, avatar: picture }
                });
            }
        }

        if (!host) {
            host = await prisma.host.create({
                data: {
                    uid: `anon_${uuidv4().substring(0, 8)}`,
                    username: name,
                    email,
                    googleId,
                    avatar: picture,
                    settings: JSON.stringify({ intensityCeiling: 20, syncMode: 'Standard' })
                }
            });
        }

        res.json({
            success: true,
            host: {
                ...host,
                settings: typeof host.settings === 'string' ? JSON.parse(host.settings) : (host.settings || {})
            }
        });
    } catch (err) {
        console.error('[AUTH] Google verify error:', err);
        res.status(401).json({ error: 'Identity verification failed' });
    }
});

// Settings - Update Host Settings
app.post('/api/host/settings', async (req, res) => {
    const { hostId, vanitySlug, settings } = req.body;
    if (!hostId) return res.status(400).json({ error: 'Host ID required' });

    try {
        const data = {};
        if (vanitySlug !== undefined) data.vanitySlug = vanitySlug.toLowerCase().trim() || null;
        if (settings !== undefined) data.settings = JSON.stringify(settings);

        const host = await prisma.host.update({
            where: { id: hostId },
            data
        });

        res.json({
            success: true,
            host: {
                ...host,
                settings: typeof host.settings === 'string' ? JSON.parse(host.settings) : (host.settings || {})
            }
        });
    } catch (err) {
        if (err.code === 'P2002') return res.status(400).json({ error: 'Vanity URL already taken' });
        res.status(500).json({ error: err.message });
    }
});

const qrCache = new Map();
const presets = new Map(); // uid -> interval
const baseFloors = new Map(); // uid -> level
const commandQueues = new Map(); // uid -> { timeout, pendingStrength, lastSent }
const preferredUrls = new Map(); // uid -> string (the successful URL)
const hostVacancyTimers = new Map(); // uid -> timeoutId
const hostSocketMap = new Map(); // socket.id -> uid

// GLOBAL RATE LIMITER (To prevent IP-wide 50500 blocks)
let lastGlobalRequestTime = 0;
const GLOBAL_COOLDOWN = 150; // tuned to ~6 req/sec
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
                    appId: (process.env.LOVENSE_APP_ID || '').trim(),
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
        const { slug, locationData = {} } = req.body;
        if (!slug) return res.status(400).json({ error: 'Slug required' });

        let connectionId = null;
        if (slug !== 'system' && slug !== 'home') {
            const conn = await getConnection(slug);
            if (conn) connectionId = conn.id;
        }

        // Use request IP if client didn't provide one
        const clientIp = locationData.query || req.ip || req.headers['x-forwarded-for'] || '0.0.0.0';

        const logData = {
            connectionId,
            ip: clientIp,
            city: locationData.city || 'Unknown',
            region: locationData.region || 'Unknown',
            regionName: locationData.regionName || 'Unknown',
            country: locationData.country || 'Unknown',
            countryCode: locationData.countryCode || 'Unknown',
            isp: locationData.isp || 'Unknown',
            org: locationData.org || 'Unknown',
            as: locationData.as?.toString() || 'Unknown',
            zip: locationData.zip || 'Unknown',
            lat: typeof locationData.lat === 'string' ? parseFloat(locationData.lat) : (locationData.lat || 0),
            lon: typeof locationData.lon === 'string' ? parseFloat(locationData.lon) : (locationData.lon || 0),
            timezone: locationData.timezone || 'Unknown',
            path: locationData.path || req.headers.referer || 'Unknown',
            browser: locationData.browser || 'Unknown',
            os: locationData.os || 'Unknown',
            device: locationData.device || 'Unknown',
            userAgent: locationData.userAgent || req.headers['user-agent'] || 'Unknown'
        };

        console.log(`[ANALYTICS] Logging visit: ${clientIp} | Path: ${logData.path} | Slug: ${slug}`);

        try {
            await prisma.visitorLog.create({ data: logData });
        } catch (dbErr) {
            console.warn('[DB] Fallback to memory for visitor log:', dbErr.message);
            memoryStore.visitorLogs.push({ ...logData, id: uuidv4(), createdAt: new Date() });
            if (memoryStore.visitorLogs.length > 1000) memoryStore.visitorLogs.shift();
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
    const password = req.headers['x-admin-password'];
    if (password !== 'tntadmin2026') return res.status(401).json({ error: 'Unauthorized: Admin access denied' });

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

// Admin - Detailed Overwatch Stats
app.get('/api/admin/overwatch', async (req, res) => {
    const password = req.headers['x-admin-password'];
    if (password !== 'tntadmin2026') return res.status(401).json({ error: 'Unauthorized' });

    try {
        let logs = [];
        try {
            logs = await prisma.visitorLog.findMany({
                orderBy: { createdAt: 'desc' },
                take: 100
            });
        } catch (e) {
            logs = [...memoryStore.visitorLogs].reverse().slice(0, 100);
        }

        const stats = {
            totalVisits: logs.length,
            uniqueIps: new Set(logs.map(l => l.ip)).size,
            activeNow: io.engine.clientsCount,
            countries: {},
            browsers: {},
            os: {},
            devices: {},
            paths: {},
            traffic24h: new Array(24).fill(0)
        };

        logs.forEach(log => {
            if (log.countryCode) stats.countries[log.countryCode] = (stats.countries[log.countryCode] || 0) + 1;
            if (log.browser) stats.browsers[log.browser] = (stats.browsers[log.browser] || 0) + 1;
            if (log.os) stats.os[log.os] = (stats.os[log.os] || 0) + 1;
            if (log.device) stats.devices[log.device] = (stats.devices[log.device] || 0) + 1;
            if (log.path) stats.paths[log.path] = (stats.paths[log.path] || 0) + 1;

            // Traffic by hour (very basic)
            const hour = new Date(log.createdAt).getHours();
            stats.traffic24h[hour]++;
        });

        res.json({
            summary: stats,
            recentLogs: logs.slice(0, 50)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin - Purge All Analytics Logs
app.delete('/api/admin/logs/purge', async (req, res) => {
    const password = req.headers['x-admin-password'];
    if (password !== 'tntadmin2026') return res.status(401).json({ error: 'Unauthorized' });

    try {
        try {
            await prisma.visitorLog.deleteMany({});
        } catch (e) {
            memoryStore.visitorLogs = [];
        }
        res.json({ success: true, message: 'All logs purged' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin - All Connections
app.get('/api/admin/connections', async (req, res) => {
    const password = req.headers['x-admin-password'];
    if (password !== 'tntadmin2026') return res.status(401).json({ error: 'Unauthorized: Admin access denied' });

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
    const password = req.headers['x-admin-password'];
    if (password !== 'tntadmin2026') return res.status(401).json({ error: 'Unauthorized: Admin access denied' });

    const { slug } = req.params;
    try {
        memoryStore.connections.delete(slug);
        await prisma.connection.delete({ where: { slug } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin - Purge All Connections
app.delete('/api/admin/connections/purge/all', async (req, res) => {
    const password = req.headers['x-admin-password'];
    if (password !== 'tntadmin2026') return res.status(401).json({ error: 'Unauthorized: Admin access denied' });

    try {
        memoryStore.connections.clear();
        await prisma.connection.deleteMany({});
        io.emit('session-terminated', { message: "System-wide session purge performed by Administrator." });
        res.json({ success: true, message: "All connections purged" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin - Purge Orphaned/Dead Connections
app.delete('/api/admin/connections/purge/dead', async (req, res) => {
    const password = req.headers['x-admin-password'];
    if (password !== 'tntadmin2026') return res.status(401).json({ error: 'Unauthorized' });

    try {
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

        // Find connections that are older than 15 mins AND have 0 visitor logs
        // This is a rough heuristic for "clicked and abandoned"
        const deadConns = await prisma.connection.findMany({
            where: {
                createdAt: { lt: fifteenMinsAgo },
                visitorLogs: { none: {} }
            }
        });

        for (const conn of deadConns) {
            memoryStore.connections.delete(conn.slug);
        }

        const result = await prisma.connection.deleteMany({
            where: {
                id: { in: deadConns.map(c => c.id) }
            }
        });

        res.json({ success: true, count: result.count });
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

    socket.on('join-host', (rawUid) => {
        const uid = (rawUid || '').toLowerCase().trim();
        if (!uid) return;

        socket.uid = uid;
        hostSocketMap.set(socket.id, uid);

        // Cancel any pending destruction timer for this host
        if (hostVacancyTimers.has(uid)) {
            console.log(`[CLEANUP] Host ${uid} returned. Cancelling auto-destruction.`);
            clearTimeout(hostVacancyTimers.get(uid));
            hostVacancyTimers.delete(uid);
        }

        // Join the full UID room (Always lowercase)
        socket.join(`host:${uid}`);
        console.log(`[SOCKET] Host ${uid} joined room host:${uid}`);

        // Also join rooms for all prefix variants of the UID
        const parts = uid.split('_');
        for (let i = 1; i < parts.length; i++) {
            const prefix = parts.slice(0, i).join('_');
            socket.join(`host:${prefix}`);
            console.log(`[SOCKET] Host also joined legacy room host:${prefix}`);
        }

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

        // Get the approving host's current UID from the socket
        const approverUid = socket.uid;
        console.log(`[APPROVAL] Approver UID from socket: ${approverUid}`);

        try {
            // First, ensure we have the current host record
            if (approved && approverUid) {
                // Upsert the host with current UID
                const currentHost = await prisma.host.upsert({
                    where: { uid: approverUid },
                    update: { username: approverUid },
                    create: { uid: approverUid, username: approverUid }
                });

                // Update the connection to point to this current host
                await prisma.connection.update({
                    where: { slug },
                    data: {
                        approved: true,
                        hostId: currentHost.id
                    }
                });
                console.log(`[DB] Connection ${slug} updated: approved=true, hostId=${currentHost.id} (UID: ${approverUid})`);

                // Also update memory
                const memConn = memoryStore.connections.get(slug);
                if (memConn) {
                    memConn.approved = true;
                    memConn.hostId = currentHost.id;
                    memConn.hostUid = approverUid;
                }
            } else {
                await prisma.connection.update({
                    where: { slug },
                    data: { approved }
                });
                console.log(`[DB] Approval updated for ${slug}`);
            }
        } catch (e) {
            console.error(`[DB-ERROR] Failed to update approval for ${slug}: ${e.message}`);
            const memConn = memoryStore.connections.get(slug);
            if (memConn) {
                memConn.approved = approved;
                if (approved && approverUid) {
                    memConn.hostUid = approverUid;
                }
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
        console.log(`[PULSE-DEBUG] Received typing-pulse: slug=${slug}, intensity=${intensity}`);

        const conn = await getConnection(slug);
        console.log(`[PULSE-DEBUG] Connection found: ${!!conn}, Host: ${!!conn?.host}, Approved: ${conn?.approved}`);

        if (conn && conn.host) {
            console.log(`[PULSE-DEBUG] Host UID from DB: "${conn.host.uid}"`);
        }

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
            console.warn(`[BLOCK] Typing Pulse from ${slug}. Found: ${!!conn}, Host: ${!!conn?.host}, Approved: ${isApproved}`);
        }
    });

    // Voice level pulse
    socket.on('voice-pulse', async ({ slug, intensity }) => {
        const conn = await getConnection(slug);

        if (conn && conn.host && conn.approved) {
            const hostUid = conn.host.uid.toLowerCase();
            const room = `host:${hostUid}`;
            console.log(`[PULSE] Voice (${intensity}) from ${slug} -> host ${hostUid}`);
            sendCommand(conn.host.uid, 'vibrate', intensity, 1);

            // Send visual feedback to host
            io.to(room).emit('incoming-pulse', { source: 'voice', level: intensity });
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

    socket.on('disconnect', async () => {
        const uid = hostSocketMap.get(socket.id);
        console.log('User disconnected:', socket.id, uid ? `(Host: ${uid})` : '');

        if (uid) {
            hostSocketMap.delete(socket.id);

            // Check if any other sockets for this host are still connected
            const hostRoom = `host:${uid}`;
            const remainingClients = io.sockets.adapter.rooms.get(hostRoom)?.size || 0;

            if (remainingClients === 0) {
                console.log(`[CLEANUP] Host ${uid} is fully vacant. Starting 3-minute destruction timer.`);

                const timerId = setTimeout(async () => {
                    console.log(`[CLEANUP] 3 minutes reached. Destroying vacant sessions for ${uid}`);
                    try {
                        const host = await prisma.host.findUnique({ where: { uid } });
                        if (host) {
                            // Find all connections for this host
                            const conns = await prisma.connection.findMany({ where: { hostId: host.id } });
                            for (const conn of conns) {
                                memoryStore.connections.delete(conn.slug);
                                io.to(`typist:${conn.slug}`).emit('session-terminated', {
                                    message: "Session expired due to host inactivity (3m vacancy)."
                                });
                            }

                            // Delete from DB
                            await prisma.connection.deleteMany({ where: { hostId: host.id } });
                            console.log(`[CLEANUP] Successfully purged ${conns.length} connections for ${uid}`);
                        }
                    } catch (e) {
                        console.error(`[CLEANUP] Error during auto-destruction for ${uid}:`, e.message);
                    }
                    hostVacancyTimers.delete(uid);
                }, 3 * 60 * 1000); // 3 minutes

                hostVacancyTimers.set(uid, timerId);
            }
        }
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
    const cooldown = 200;
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
            console.warn(`[LOVENSE] No toys linked for ${uid}, sending broadcast...`);
            return await dispatchRaw(uid, null, 'vibrate', strength, duration, directSocket);
        }

        const toys = typeof host.toys === 'string' ? JSON.parse(host.toys) : host.toys;
        const commands = [];

        if (Array.isArray(toys)) {
            for (const toy of toys) {
                const tId = toy.id || toy.toyId;
                if (tId === 'SIM' && toys.length > 1) continue;
                commands.push(dispatchRaw(uid, tId === 'SIM' ? null : tId, 'vibrate', strength, duration, directSocket));
            }
        } else if (typeof toys === 'object') {
            // Handle { "toyId": { ... } } format common in Lovense callback
            for (const [tId, toyInfo] of Object.entries(toys)) {
                if (tId === 'SIM' && Object.keys(toys).length > 1) continue;
                // Use key as ID if internal property is missing
                const actualId = toyInfo.id || toyInfo.toyId || tId;
                commands.push(dispatchRaw(uid, actualId === 'SIM' ? null : actualId, 'vibrate', strength, duration, directSocket));
            }
        }

        await Promise.all(commands);
        if (directSocket && strength > 0) directSocket.emit('incoming-pulse', { source: 'test', level: strength });
    } catch (error) {
        console.error('[LOVENSE] Dispatch Error:', error.message);
    }
}

async function dispatchRaw(uid, toyId, command, strength, duration, directSocket = null) {
    const token = (process.env.LOVENSE_DEVELOPER_TOKEN || '').trim();
    const appId = (process.env.LOVENSE_APP_ID || '').trim();

    // Use preferred URL if we found one that works for this user
    const savedUrl = preferredUrls.get(uid);

    const apiUrls = [
        'https://api.lovense.com/api/standard/v1/command',
        'https://api.lovense-api.com/api/standard/v1/command',
        'https://api.v-connect.com/api/standard/v1/command',
        'https://api-us.lovense.com/api/standard/v1/command'
    ];

    // Reorder to try the successful one first
    if (savedUrl) {
        const idx = apiUrls.indexOf(savedUrl);
        if (idx > -1) apiUrls.splice(idx, 1);
        apiUrls.unshift(savedUrl);
    }

    let lastFeedback = null;
    const finalStrength = Math.min(Math.max(strength, 0), 20);
    const normalizedCmd = command.charAt(0).toUpperCase() + command.slice(1).toLowerCase();

    for (const url of apiUrls) {
        try {
            const domain = url.split('/')[2];

            // Standard V1 API Payload
            const payload = {
                token: token,
                uid: uid,
                apiVer: 1,
                sec: duration,
                timeSec: duration,
                strength: finalStrength,
                command: normalizedCmd,
                action: `${normalizedCmd}:${finalStrength}` // Some Standard implementations use action
            };

            if (appId) payload.appId = appId;
            if (toyId) payload.toyId = toyId;

            console.log(`[LOVENSE] Dispatching to ${domain} for ${uid} | ${normalizedCmd}:${finalStrength}`);

            const response = await enqueueGlobalRequest(() => axios.post(url, payload, { timeout: 4000 }));
            const resData = response.data || {};

            const isIpBlock = resData.code === 50500;
            const isSuccess = resData.result === true || resData.result === 1 || resData.result === 'success' || resData.message === 'success';

            // If success, store this as preferred for next time
            if (isSuccess && url !== savedUrl) {
                console.log(`[LOVENSE] URL Optimized: Using ${domain} for ${uid}`);
                preferredUrls.set(uid, url);
            }

            lastFeedback = {
                success: isSuccess,
                message: isSuccess ? `TOY RECEIVED SIGNAL (${domain})` :
                    (isIpBlock ? `LOVENSE BLOCK: Server IP Restricted.` : `TOY REJECTED (${domain}): ${resData.message || resData.code || 'Offline'}`),
                code: resData.code,
                url: domain,
                details: resData
            };

            if (isSuccess) {
                console.log(`[LOVENSE] SUCCESS from ${domain}`);
                io.to(`host:${uid.toLowerCase()}`).emit('api-feedback', lastFeedback);
                if (directSocket) directSocket.emit('api-feedback', lastFeedback);
                return resData;
            } else {
                console.warn(`[LOVENSE] FAILURE from ${domain}:`, JSON.stringify(resData));
            }

        } catch (e) {
            console.warn(`[LOVENSE] Request to ${url.split('/')[2]} failed:`, e.message);
        }
    }

    // If we've exhausted all URLs and none succeeded
    console.error(`[LOVENSE] ALL DOMAINS FAILED for ${uid}`);
    const finalErr = lastFeedback ? lastFeedback.message : "ALL TARGET DOMAINS FAILED OR REJECTED SIGNAL";
    io.to(`host:${uid.toLowerCase()}`).emit('api-feedback', { success: false, message: finalErr, details: 'Check if your Lovense app is open and linked.' });
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

// Background Cleanup Task (Runs every 10 minutes)
setInterval(async () => {
    console.log('[CLEANUP] Running periodic session maintenance...');
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);

    try {
        // Delete any connection with no activity older than 30 mins
        const orphaned = await prisma.connection.findMany({
            where: {
                createdAt: { lt: thirtyMinsAgo },
                visitorLogs: { none: {} }
            }
        });

        if (orphaned.length > 0) {
            console.log(`[CLEANUP] Nuking ${orphaned.length} orphaned/abandoned sessions.`);
            for (const o of orphaned) memoryStore.connections.delete(o.slug);
            await prisma.connection.deleteMany({
                where: { id: { in: orphaned.map(o => o.id) } }
            });
        }
    } catch (e) {
        console.error('[CLEANUP] Background maintenance error:', e.message);
    }
}, 10 * 60 * 1000);

try {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server fully operational on port ${PORT}`);
        console.log(`🔗 Health check: /health`);
    });
} catch (err) {
    console.error('FAILED TO START SERVER:', err);
}

