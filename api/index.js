const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { createClient } = require('redis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- Database connection (PostgreSQL) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- Cache connection (Redis) ---
const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

async function initRedis() {
  try {
    await redisClient.connect();
    console.log('Connected to Redis Cache');
  } catch (error) {
    console.error('Failed to connect to Redis, continuing without cache...', error);
  }
}

// Initialize tables in PostgreSQL with retry logic
async function initDB(retries = 8, delay = 5000) {
  const queryText = `
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      puntaje INT NOT NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query(queryText);
      console.log('PostgreSQL database initialized successfully');
      return;
    } catch (error) {
      console.error(`Error initializing PostgreSQL database (attempt ${i + 1}/${retries}): ${error.message}`);
      if (i < retries - 1) {
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  console.error('Failed to initialize PostgreSQL after maximum retries');
}

// --- API Endpoints ---

// Health Check
app.get('/api/health', async (req, res) => {
  let dbStatus = 'down';
  let redisStatus = 'down';
  
  try {
    await pool.query('SELECT 1');
    dbStatus = 'ok';
  } catch (err) {
    console.error('PG Health check error', err);
  }

  if (redisClient.isOpen) {
    try {
      await redisClient.ping();
      redisStatus = 'ok';
    } catch (err) {
      console.error('Redis Health check error', err);
    }
  }

  res.status(dbStatus === 'ok' && redisStatus === 'ok' ? 200 : 500).json({
    status: 'healthy',
    timestamp: new Date(),
    services: {
      api: 'ok',
      database: dbStatus,
      cache: redisStatus
    }
  });
});

// GET /api/scores - Get recent scores from PostgreSQL
app.get('/api/scores', async (req, res) => {
  try {
    const result = await pool.query('SELECT nombre, puntaje, creado_en FROM scores ORDER BY creado_en DESC LIMIT 15');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching scores', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/scores/leaderboard - Realtime Leaderboard (Redis Sorted Set + PostgreSQL Fallback)
app.get('/api/scores/leaderboard', async (req, res) => {
  try {
    if (redisClient.isOpen) {
      // ZREVRANGE leaderboard 0 9 WITHSCORES
      const cachedLeaderboard = await redisClient.zRangeWithScores('leaderboard', 0, 9, {
        REV: true
      });
      
      if (cachedLeaderboard && cachedLeaderboard.length > 0) {
        console.log('Leaderboard fetched from Redis Cache');
        const formatted = cachedLeaderboard.map(item => ({
          nombre: item.value,
          puntaje: parseInt(item.score, 10),
        }));
        return res.json(formatted);
      }
    }

    // Fallback to PostgreSQL
    console.log('Leaderboard cache miss, querying PostgreSQL...');
    const result = await pool.query(`
      SELECT nombre, MAX(puntaje) as puntaje 
      FROM scores 
      GROUP BY nombre 
      ORDER BY puntaje DESC 
      LIMIT 10
    `);

    const leaderboard = result.rows.map(row => ({
      nombre: row.nombre,
      puntaje: parseInt(row.puntaje, 10),
    }));

    // Repopulate Redis cache if open
    if (redisClient.isOpen && leaderboard.length > 0) {
      for (const item of leaderboard) {
        await redisClient.zAdd('leaderboard', {
          score: item.puntaje,
          value: item.nombre
        });
      }
      console.log('Redis cache repopulated with leaderboard');
    }

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/scores - Add score to DB and update Cache
app.post('/api/scores', async (req, res) => {
  const { nombre, puntaje } = req.body;
  if (!nombre || puntaje === undefined) {
    return res.status(400).json({ error: 'Nombre and Puntaje are required' });
  }

  try {
    // 1. Save score in Postgres history
    await pool.query(
      'INSERT INTO scores (nombre, puntaje) VALUES ($1, $2)',
      [nombre, parseInt(puntaje, 10)]
    );
    console.log(`Saved score for ${nombre}: ${puntaje} in PostgreSQL`);

    // 2. Update Redis Sorted Set for Leaderboard
    if (redisClient.isOpen) {
      // Get current high score for this player in Redis
      const currentScore = await redisClient.zScore('leaderboard', nombre);
      if (currentScore === null || parseInt(puntaje, 10) > currentScore) {
        await redisClient.zAdd('leaderboard', {
          score: parseInt(puntaje, 10),
          value: nombre
        });
        console.log(`Updated high score for ${nombre}: ${puntaje} in Redis`);
      }
    }

    res.status(201).json({ success: true, nombre, puntaje });
  } catch (error) {
    console.error('Error saving score', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start initialization and server
async function start() {
  await initDB();
  await initRedis();
  
  app.listen(PORT, () => {
    console.log(`Tetris API Server running on port ${PORT}`);
  });
}

start();
