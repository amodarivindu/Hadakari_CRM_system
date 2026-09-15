const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Firebase Admin Initialization
if (!admin.apps.length) {
  try {
    const serviceAccountPath =
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      path.join(__dirname, 'service-account.json');

    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      console.log('Firebase Admin initialized using service account');
    } else {
      admin.initializeApp({
        projectId: 'hadakari-crm-system'
      });

      console.log('Firebase Admin initialized with projectId only');
    }
  } catch (err) {
    console.error('Firebase initialization failed:', err);
  }
}

const db = admin.firestore();

// -------------------------
// Authentication Middleware
// -------------------------
async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    if (!token) {
      return res.status(401).json({
        error: 'Missing bearer token.'
      });
    }

    const decoded = await admin.auth().verifyIdToken(token);

    const userDoc = await db
      .collection('users')
      .doc(decoded.uid)
      .get();

    const role = userDoc.exists
      ? userDoc.data().role || 'viewer'
      : 'viewer';

    if (role !== 'admin') {
      return res.status(403).json({
        error: 'Admin access required.'
      });
    }

    req.user = decoded;

    next();
  } catch (err) {
    console.error(err);

    return res.status(401).json({
      error: 'Invalid token',
      details: err.message
    });
  }
}

// -------------------------
// Routes
// -------------------------

app.get('/', (req, res) => {
  res.json({
    service: 'Hadakari CRM Backend',
    status: 'Running',
    version: '1.0.0',
    endpoints: [
      'GET /api/health',
      'GET /api/reports/orders',
      'POST /api/reports/export'
    ]
  });
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'hadakari-crm',
    timestamp: new Date().toISOString()
  });
});

// Get All Orders
app.get('/api/reports/orders', requireAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('orders').get();

    const rows = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      count: rows.length,
      rows
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

// Export Any Collection
app.post('/api/reports/export', requireAdmin, async (req, res) => {
  try {
    const { collectionName } = req.body;

    if (!collectionName) {
      return res.status(400).json({
        error: 'collectionName is required.'
      });
    }

    const snapshot = await db.collection(collectionName).get();

    const rows = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      collectionName,
      count: rows.length,
      rows
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: 'Internal Server Error',
    details: err.message
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`CRM backend listening on http://localhost:${PORT}`);
});