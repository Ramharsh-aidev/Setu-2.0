/**
 * ============================================
 * SETU BACKEND SERVER
 * Voice-Native AI for Government Schemes
 * ============================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Import services
const { initializeQdrant } = require('./lib/qdrant');
const { initializeHuggingFace } = require('./lib/huggingface');
const { startScraperSchedule } = require('./lib/scraper');
const { initializeDatabase } = require('./lib/database');

// Import routes
const vapiWebhookRouter = require('./routes/vapi-webhook');
const schemeRouter = require('./routes/schemes');
const sessionRouter = require('./routes/sessions');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.FRONTEND_URL || 'http://localhost:3000'
  ],
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// INITIALIZATION CONTROLLER
// ============================================
let servicesReady = false;

const initializeServices = async () => {
  try {
    console.log('🚀 Initializing Setu Backend Services...\n');

    // Initialize Qdrant
    console.log('📚 Initializing Qdrant Vector Database...');
    await initializeQdrant();
    console.log('✅ Qdrant initialized successfully\n');

    // Initialize Hugging Face
    console.log('🤖 Initializing Hugging Face LLM...');
    await initializeHuggingFace();
    console.log('✅ Hugging Face initialized successfully\n');

    // Initialize Database
    console.log('🗄️  Initializing PostgreSQL Database...');
    await initializeDatabase();
    console.log('✅ Database initialized successfully\n');

    // Start Scraper Schedule
    console.log('📅 Starting Periodic Scraper...');
    if (process.env.SCRAPER_ENABLED === 'true') {
      await startScraperSchedule();
      console.log('✅ Scraper scheduled successfully\n');
    } else {
      console.log('⏭️  Scraper disabled in configuration\n');
    }

    servicesReady = true;
    console.log('🎉 All services initialized successfully!\n');
  } catch (error) {
    console.error('❌ Error during service initialization:', error);
    process.exit(1);
  }
};

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/health', (req, res) => {
  res.json({
    status: servicesReady ? 'ready' : 'initializing',
    timestamp: new Date().toISOString(),
    services: {
      qdrant: 'checking',
      huggingface: 'checking',
      database: 'checking'
    }
  });
});

// ============================================
// API ROUTES
// ============================================

// Vapi Webhook Routes
app.use('/api/vapi', vapiWebhookRouter);

// Schemes Routes
app.use('/api/schemes', schemeRouter);

// Sessions Routes
app.use('/api/sessions', sessionRouter);

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ============================================
// SERVER START
// ============================================
const startServer = async () => {
  await initializeServices();

  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎤 Setu Backend Server Running`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`${'='.repeat(50)}\n`);
  });
};

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;
