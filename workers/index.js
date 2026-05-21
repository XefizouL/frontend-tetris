const { Pool } = require('pg');
const amqp = require('amqplib');
require('dotenv').config();

// --- PostgreSQL Pool ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize database schema for achievements auditing with retry logic
async function initDB(retries = 8, delay = 5000) {
  const queryText = `
    CREATE TABLE IF NOT EXISTS achievements (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      puntaje INT NOT NULL,
      logro VARCHAR(255) NOT NULL,
      procesado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query(queryText);
      console.log('PostgreSQL Achievements table initialized by Worker successfully');
      return;
    } catch (error) {
      console.error(`Worker failed to initialize database schema (attempt ${i + 1}/${retries}): ${error.message}`);
      if (i < retries - 1) {
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  console.error('Worker failed to initialize PostgreSQL after maximum retries');
}

// --- RabbitMQ Queue Consumer with Reconnection Retry ---
const QUEUE_NAME = 'tetris-events-queue';

async function startWorker(retries = 10, delay = 5000) {
  await initDB();

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Worker connecting to RabbitMQ (attempt ${i + 1}/${retries})...`);
      const connection = await amqp.connect(process.env.QUEUE_URL);
      const channel = await connection.createChannel();
      
      await channel.assertQueue(QUEUE_NAME, { durable: true });
      // Limit prefetch to balance load across workers replicas
      channel.prefetch(1);
      
      console.log(`🤖 Async Worker online and waiting for messages in queue [${QUEUE_NAME}]...`);
      
      channel.consume(QUEUE_NAME, async (msg) => {
        if (!msg) return;

        try {
          const content = JSON.parse(msg.content.toString());
          console.log('📥 Received event from RabbitMQ (SQS simulator):', content);

          if (content.event === 'game_over') {
            const { nombre, score } = content;
            
            // Calculate special cloud/devops achievement based on score
            let achievement = 'Iniciación de DevOps 🛠️';
            if (score >= 2000) {
              achievement = 'Leyenda de la Nube (100% Serverless) 👑☁️';
            } else if (score >= 1000) {
              achievement = 'Campeón de AWS (Multi-AZ Master) 🏆🌀';
            } else if (score >= 500) {
              achievement = 'Arquitecto de Tetris (Docker Pro) 🐳📐';
            }

            console.log(`🏆 Calculando logro para ${nombre}: "${achievement}" basado en ${score} pts`);

            // Save achievement to PostgreSQL
            await pool.query(
              'INSERT INTO achievements (nombre, puntaje, logro) VALUES ($1, $2, $3)',
              [nombre, score, achievement]
            );

            console.log(`✅ Logro registrado con éxito en PostgreSQL para ${nombre}`);
          }

          // Acknowledge the message
          channel.ack(msg);
        } catch (error) {
          console.error('❌ Error processing message, rejecting...', error);
          // Requeue message on failure
          channel.nack(msg, false, true);
        }
      }, { noAck: false });

      // Handle connection closing
      connection.on('close', () => {
        console.error('RabbitMQ connection closed. Reconnecting...');
        setTimeout(() => startWorker(retries, delay), delay);
      });

      return;
    } catch (error) {
      console.error(`Worker failed to connect to RabbitMQ: ${error.message}. Retrying in ${delay / 1000}s...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }

  console.error('Worker could not connect to RabbitMQ after maximum retries. Shutting down worker...');
}

startWorker();
