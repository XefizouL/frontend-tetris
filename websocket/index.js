const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');
const amqp = require('amqplib');
require('dotenv').config();

const PORT = process.env.PORT || 4000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Tetris WebSocket Server is running\n');
});

// Socket.io initialization with CORS allowed from anywhere (handled by Nginx reverse proxy anyway)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- Redis Client ---
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});
redisClient.on('error', (err) => console.error('Redis Socket Client Error', err));

async function initRedis() {
  try {
    await redisClient.connect();
    console.log('WS Server connected to Redis Cache');
    // Reset active users count
    await redisClient.set('active_connections', 0);
  } catch (error) {
    console.error('Failed to connect to Redis for WebSockets', error);
  }
}

// --- RabbitMQ (SQS simulator) Connection with Retry Logic ---
let channel = null;
const QUEUE_NAME = 'tetris-events-queue';

async function connectRabbitMQ(retries = 10, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Connecting to RabbitMQ (attempt ${i + 1}/${retries})...`);
      const connection = await amqp.connect(process.env.QUEUE_URL);
      channel = await connection.createChannel();
      await channel.assertQueue(QUEUE_NAME, { durable: true });
      console.log('Connected to RabbitMQ and asserted queue:', QUEUE_NAME);
      return;
    } catch (error) {
      console.error(`RabbitMQ connection failed: ${error.message}. Retrying in ${delay / 1000}s...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  console.error('Could not connect to RabbitMQ. Events queue will be offline.');
}

// Send event to SQS/RabbitMQ
async function publishEvent(eventPayload) {
  if (!channel) {
    console.warn('RabbitMQ channel is offline. Message discarded:', eventPayload);
    return;
  }
  try {
    const msgBuffer = Buffer.from(JSON.stringify(eventPayload));
    channel.sendToQueue(QUEUE_NAME, msgBuffer, { persistent: true });
    console.log('Published event to RabbitMQ:', eventPayload);
  } catch (error) {
    console.error('Error publishing event to RabbitMQ', error);
  }
}

// --- WebSocket Event Handlers ---
io.on('connection', async (socket) => {
  console.log(`New socket connection: ${socket.id}`);
  
  // Track client stats
  let currentUsername = 'Invitado';

  // Increment active connection count in Redis
  if (redisClient.isOpen) {
    try {
      const activeCount = await redisClient.incr('active_connections');
      io.emit('active_users_update', { count: activeCount });
    } catch (err) {
      console.error('Redis incr active_connections error', err);
    }
  }

  // Handle client joining with player name
  socket.on('join_game', async (data) => {
    currentUsername = data.nombre || 'Invitado';
    console.log(`Player ${currentUsername} joined the Tetris Arena.`);
    
    // Welcome the individual player
    socket.emit('arena_notification', {
      type: 'welcome',
      message: `¡Bienvenido al canal en tiempo real de AWS, ${currentUsername}! 🚀`
    });
  });

  // Handle Game Start
  socket.on('game_start', (data) => {
    const name = data.nombre || currentUsername;
    console.log(`Game started by ${name}`);
    
    // Broadcast notification to all OTHER connected sockets
    socket.broadcast.emit('arena_notification', {
      type: 'game_start',
      nombre: name,
      message: `🎮 ¡${name} acaba de iniciar una nueva partida!`
    });
  });

  // Handle Level Milestone / Line Clears
  socket.on('game_milestone', (data) => {
    const name = data.nombre || currentUsername;
    const score = data.score;
    console.log(`Milestone by ${name}: ${score} points`);

    socket.broadcast.emit('arena_notification', {
      type: 'milestone',
      nombre: name,
      score: score,
      message: `🔥 ¡Racha increíble! ${name} ha alcanzado ${score} puntos.`
    });
  });

  // Handle Game Over
  socket.on('game_over', async (data) => {
    const name = data.nombre || currentUsername;
    const score = data.score || 0;
    console.log(`Game Over for ${name} with score: ${score}`);

    // Broadcast Game Over notification to everyone
    socket.broadcast.emit('arena_notification', {
      type: 'game_over',
      nombre: name,
      score: score,
      message: `💀 Game Over para ${name} con una puntuación de ${score}.`
    });

    // Publish game_over event to RabbitMQ (simulating SQS queueing)
    await publishEvent({
      event: 'game_over',
      nombre: name,
      score: score,
      timestamp: new Date().toISOString()
    });
  });

  // Handle Disconnection
  socket.on('disconnect', async () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Decrement active connection count in Redis
    if (redisClient.isOpen) {
      try {
        const activeCount = await redisClient.decr('active_connections');
        io.emit('active_users_update', { count: activeCount > 0 ? activeCount : 0 });
      } catch (err) {
        console.error('Redis decr active_connections error', err);
      }
    }
  });
});

async function start() {
  await initRedis();
  await connectRabbitMQ();
  
  server.listen(PORT, () => {
    console.log(`Tetris WebSockets Server running on port ${PORT}`);
  });
}

start();
