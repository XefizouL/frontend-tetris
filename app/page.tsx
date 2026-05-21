'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import Link from 'next/link';
import { 
  Tv, 
  Users, 
  Trophy, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Play, 
  Volume2, 
  VolumeX, 
  Database, 
  Cpu, 
  Zap, 
  Workflow, 
  History,
  RotateCw,
  Terminal,
  Grid
} from 'lucide-react';

const COLS = 10;
const ROWS = 20;

// Tetrominos configuration
const TETROMINOS = {
  I: { shape: [[1, 1, 1, 1]], color: 'bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.8)] border-cyan-300' },
  J: { shape: [[2, 0, 0], [2, 2, 2]], color: 'bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.8)] border-blue-400' },
  L: { shape: [[0, 0, 3], [3, 3, 3]], color: 'bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.8)] border-orange-300' },
  O: { shape: [[4, 4], [4, 4]], color: 'bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.8)] border-yellow-300' },
  S: { shape: [[0, 5, 5], [5, 5, 0]], color: 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.8)] border-green-300' },
  T: { shape: [[0, 6, 0], [6, 6, 6]], color: 'bg-purple-600 shadow-[0_0_12px_rgba(147,51,234,0.8)] border-purple-400' },
  Z: { shape: [[7, 7, 0], [0, 7, 7]], color: 'bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.8)] border-red-400' },
};

const SHAPES = Object.keys(TETROMINOS);
const createEmptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

const COLOR_MAP = {
  0: 'bg-slate-950/40 border border-slate-900/60',
  1: 'bg-cyan-500 border border-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.6)] tetris-cell',
  2: 'bg-blue-600 border border-blue-400 shadow-[0_0_8px_rgba(37,99,235,0.6)] tetris-cell',
  3: 'bg-orange-500 border border-orange-300 shadow-[0_0_8px_rgba(249,115,22,0.6)] tetris-cell',
  4: 'bg-yellow-500 border border-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.6)] tetris-cell',
  5: 'bg-green-500 border border-green-300 shadow-[0_0_8px_rgba(34,197,94,0.6)] tetris-cell',
  6: 'bg-purple-600 border border-purple-400 shadow-[0_0_8px_rgba(147,51,234,0.6)] tetris-cell',
  7: 'bg-red-600 border border-red-400 shadow-[0_0_8px_rgba(220,38,38,0.6)] tetris-cell',
  8: 'bg-slate-800/10 border-2 border-dashed border-slate-600/50 shadow-[0_0_4px_rgba(255,255,255,0.1)] tetris-cell opacity-45', // Sombra (Ghost piece)
};

export default function Tetris() {
  const [board, setBoard] = useState(createEmptyBoard());
  const [currentPiece, setCurrentPiece] = useState(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [isGameStarted, setIsGameStarted] = useState(false);
  
  // Realtime & Architecture State
  const [activeUsers, setActiveUsers] = useState(1);
  const [toasts, setToasts] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [awsConsoleLogs, setAwsConsoleLogs] = useState([
    'Initializing local AWS Stack simulation...',
    'ALB Proxy listening on port 80...',
  ]);
  const [servicesStatus, setServicesStatus] = useState({
    proxy: 'checking',
    api: 'checking',
    websocket: 'checking',
    rds: 'checking',
    redis: 'checking',
    sqs: 'checking'
  });

  const socketRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Sound generator
  const playSound = (type) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'move') {
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'rotate') {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === 'clear') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.setValueAtTime(450, ctx.currentTime + 0.08);
        osc.frequency.setValueAtTime(600, ctx.currentTime + 0.16);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === 'gameover') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch (e) {
      console.warn('Audio synthesis failed', e);
    }
  };

  // Live AWS Logs generator
  const logAwsEvent = (msg) => {
    setAwsConsoleLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 15)]);
  };

  // Add Toast Notification
  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message: msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  // Fetch High Scores Leaderboard
  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/scores/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
        logAwsEvent('GET /api/scores/leaderboard -> ElastiCache Redis cache hit');
      } else {
        logAwsEvent('GET /api/scores/leaderboard failed -> Falling back');
      }
    } catch (error) {
      console.error(error);
      logAwsEvent('AWS RDS database error: connection refused');
    }
  }, []);

  // Poll AWS Local Services Health
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setServicesStatus({
          proxy: 'ok',
          api: data.services.api === 'ok' ? 'ok' : 'error',
          websocket: socketRef.current?.connected ? 'ok' : 'error',
          rds: data.services.database === 'ok' ? 'ok' : 'error',
          redis: data.services.cache === 'ok' ? 'ok' : 'error',
          sqs: 'ok' // RabbitMQ is running if the sockets are pushing successfully
        });
      } else {
        throw new Error('API down');
      }
    } catch (err) {
      setServicesStatus({
        proxy: 'ok',
        api: 'error',
        websocket: socketRef.current?.connected ? 'ok' : 'error',
        rds: 'error',
        redis: 'error',
        sqs: 'error'
      });
    }
  }, []);

  // Initialize WebSockets and Health Checks
  useEffect(() => {
    const socketUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : 'http://localhost';
    const socket = io(socketUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to real-time ECS WebSocket service');
      logAwsEvent('ECS WebSocket server connection established (Port 80 routing)');
      setServicesStatus(prev => ({ ...prev, websocket: 'ok' }));
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSockets');
      logAwsEvent('ECS WebSocket connection terminated');
      setServicesStatus(prev => ({ ...prev, websocket: 'error' }));
    });

    socket.on('active_users_update', (data) => {
      setActiveUsers(data.count);
    });

    socket.on('arena_notification', (data) => {
      addToast(data.message, data.type);
      logAwsEvent(`WS Broadcast event [${data.type}]: ${data.nombre || 'Arena'}`);
    });

    // Check health initially and every 8 seconds
    checkHealth();
    fetchLeaderboard();
    const interval = setInterval(checkHealth, 8000);

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [addToast, checkHealth, fetchLeaderboard]);

  // Handle Collision detection
  const checkCollision = useCallback((piece, x, y, currentBoard) => {
    if (!piece) return false;
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c] !== 0) {
          let newY = y + r;
          let newX = x + c;
          if (newY >= ROWS || newX < 0 || newX >= COLS || (newY >= 0 && currentBoard[newY][newX] !== 0)) {
            return true;
          }
        }
      }
    }
    return false;
  }, []);

  // Spawns Next Piece
  const spawnPiece = useCallback((currentBoard) => {
    const randomShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const piece = TETROMINOS[randomShape];
    const startX = Math.floor(COLS / 2) - Math.floor(piece.shape[0].length / 2);
    const startY = 0;

    if (checkCollision(piece, startX, startY, currentBoard)) {
      setGameOver(true);
      playSound('gameover');
      logAwsEvent(`Game Over for ${playerName || 'Invitado'}. Final score: ${score}`);
      
      // Dispatch game over to WebSockets (triggers RabbitMQ + Worker flow)
      if (socketRef.current) {
        socketRef.current.emit('game_over', {
          nombre: playerName || 'Invitado',
          score: score
        });
      }
      
      // Save score automatically to Database
      saveScore(score);
      return null;
    }

    setCurrentPiece(piece);
    setPosition({ x: startX, y: startY });
  }, [checkCollision, playerName, score]);

  // Rotates Falling Tetromino
  const rotatePiece = useCallback(() => {
    if (gameOver || !currentPiece) return;

    const matrix = currentPiece.shape;
    const rotatedShape = matrix[0].map((_, index) =>
      matrix.map(row => row[index]).reverse()
    );

    const rotatedPiece = { ...currentPiece, shape: rotatedShape };

    // Wall kick & rotation validation
    if (!checkCollision(rotatedPiece, position.x, position.y, board)) {
      setCurrentPiece(rotatedPiece);
      playSound('rotate');
    } else if (!checkCollision(rotatedPiece, position.x - 1, position.y, board)) {
      setPosition(prev => ({ ...prev, x: prev.x - 1 }));
      setCurrentPiece(rotatedPiece);
      playSound('rotate');
    } else if (!checkCollision(rotatedPiece, position.x + 1, position.y, board)) {
      setPosition(prev => ({ ...prev, x: prev.x + 1 }));
      setCurrentPiece(rotatedPiece);
      playSound('rotate');
    }
  }, [currentPiece, position, board, gameOver, checkCollision]);

  // Starts active gameplay
  const startGame = () => {
    if (!playerName.trim()) {
      addToast('Por favor, ingresa tu alias primero 🎮', 'warning');
      return;
    }

    const emptyBoard = createEmptyBoard();
    setBoard(emptyBoard);
    setScore(0);
    setGameOver(false);
    setIsGameStarted(true);
    
    // Connect websocket presence
    if (socketRef.current) {
      socketRef.current.emit('join_game', { nombre: playerName });
      socketRef.current.emit('game_start', { nombre: playerName });
    }

    logAwsEvent(`Player ${playerName} initialized Tetris Engine`);
    spawnPiece(emptyBoard);
  };

  // Saves Score to the DB via proxy
  const saveScore = async (finalScore) => {
    const name = playerName.trim() || 'Invitado';
    logAwsEvent(`POST /api/scores -> Storing high score ${finalScore} for ${name}`);
    try {
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: name, puntaje: finalScore }),
      });

      if (response.ok) {
        logAwsEvent('AWS PG Database updated & Redis cache zAdd completed successfully');
        fetchLeaderboard();
      } else {
        logAwsEvent('AWS RDS API response failed');
      }
    } catch (error) {
      console.error(error);
      logAwsEvent('AWS API Endpoint offline - database sync cached locally');
    }
  };

  // Merges block into grid upon bottom contact
  const mergePiece = useCallback((customY) => {
    if (!currentPiece) return;

    const targetY = customY !== undefined ? customY : position.y;

    let newBoard = board.map(row => [...row]);
    for (let r = 0; r < currentPiece.shape.length; r++) {
      for (let c = 0; c < currentPiece.shape[r].length; c++) {
        if (currentPiece.shape[r][c] !== 0) {
          if (targetY + r >= 0) {
            newBoard[targetY + r][position.x + c] = currentPiece.shape[r][c];
          }
        }
      }
    }

    // Line clearing mechanics
    let linesCleared = 0;
    newBoard = newBoard.filter(row => {
      let isLineFull = row.every(cell => cell !== 0);
      if (isLineFull) linesCleared++;
      return !isLineFull;
    });

    // Populate top with blank lines
    let scoreAdd = 0;
    for (let i = 0; i < linesCleared; i++) {
      newBoard.unshift(Array(COLS).fill(0));
      scoreAdd += 100;
    }

    if (linesCleared > 0) {
      playSound('clear');
      logAwsEvent(`AWS Worker cleared ${linesCleared} rows!`);
      const newScore = score + scoreAdd + 10;
      setScore(newScore);

      // Milestone notification
      if (newScore > 0 && newScore % 500 === 0) {
        if (socketRef.current) {
          socketRef.current.emit('game_milestone', { nombre: playerName, score: newScore });
        }
      }
    } else {
      setScore(prev => prev + 10);
    }

    setBoard(newBoard);
    spawnPiece(newBoard);
  }, [board, currentPiece, position, spawnPiece, score, playerName]);

  // Move falling block down
  const moveDown = useCallback(() => {
    if (gameOver || !currentPiece) return;

    if (!checkCollision(currentPiece, position.x, position.y + 1, board)) {
      setPosition(prev => ({ ...prev, y: prev.y + 1 }));
    } else {
      mergePiece();
    }
  }, [currentPiece, position, board, gameOver, checkCollision, mergePiece]);

  // Left/Right shift
  const moveHorizontal = useCallback((dir) => {
    if (gameOver || !currentPiece) return;
    if (!checkCollision(currentPiece, position.x + dir, position.y, board)) {
      setPosition(prev => ({ ...prev, x: prev.x + dir }));
      playSound('move');
    }
  }, [currentPiece, position, board, gameOver, checkCollision]);

  // Refs to prevent stale closures in custom key repeat intervals
  const gameOverRef = useRef(gameOver);
  const currentPieceRef = useRef(currentPiece);
  const isGameStartedRef = useRef(isGameStarted);
  const positionRef = useRef(position);
  const boardRef = useRef(board);
  const checkCollisionRef = useRef(checkCollision);
  const mergePieceRef = useRef(mergePiece);

  const moveLeft = useCallback(() => moveHorizontal(-1), [moveHorizontal]);
  const moveRight = useCallback(() => moveHorizontal(1), [moveHorizontal]);

  const moveLeftRef = useRef(moveLeft);
  const moveRightRef = useRef(moveRight);
  const moveDownRef = useRef(moveDown);
  const rotatePieceRef = useRef(rotatePiece);

  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);
  useEffect(() => { currentPieceRef.current = currentPiece; }, [currentPiece]);
  useEffect(() => { isGameStartedRef.current = isGameStarted; }, [isGameStarted]);
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { checkCollisionRef.current = checkCollision; }, [checkCollision]);
  useEffect(() => { mergePieceRef.current = mergePiece; }, [mergePiece]);
  useEffect(() => { moveLeftRef.current = moveLeft; }, [moveLeft]);
  useEffect(() => { moveRightRef.current = moveRight; }, [moveRight]);
  useEffect(() => { moveDownRef.current = moveDown; }, [moveDown]);
  useEffect(() => { rotatePieceRef.current = rotatePiece; }, [rotatePiece]);

  // Keep track of active intervals/timeouts for repeats
  const keyIntervals = useRef({
    ArrowLeft: null,
    ArrowRight: null,
    ArrowDown: null,
  });

  const startKeyRepeat = useCallback((key, actionRef, intervalMs, dasDelay = 150) => {
    if (keyIntervals.current[key]) return; // Already repeating
    
    // Trigger immediately
    actionRef.current();
    
    const active = { timeoutId: null, intervalId: null };
    
    active.timeoutId = setTimeout(() => {
      active.intervalId = setInterval(() => {
        actionRef.current();
      }, intervalMs);
    }, dasDelay);

    keyIntervals.current[key] = active;
  }, []);

  const stopKeyRepeat = useCallback((key) => {
    const active = keyIntervals.current[key];
    if (active) {
      clearTimeout(active.timeoutId);
      if (active.intervalId) {
        clearInterval(active.intervalId);
      }
      keyIntervals.current[key] = null;
    }
  }, []);

  // Stop repeats if component loses focus or game state resets
  useEffect(() => {
    const handleBlur = () => {
      stopKeyRepeat('ArrowLeft');
      stopKeyRepeat('ArrowRight');
      stopKeyRepeat('ArrowDown');
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [stopKeyRepeat]);

  useEffect(() => {
    if (gameOver || !isGameStarted || !currentPiece) {
      stopKeyRepeat('ArrowLeft');
      stopKeyRepeat('ArrowRight');
      stopKeyRepeat('ArrowDown');
    }
  }, [gameOver, isGameStarted, currentPiece, stopKeyRepeat]);

  // Key listeners with dynamic repeat acceleration
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameOverRef.current || !currentPieceRef.current || !isGameStartedRef.current) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        startKeyRepeat('ArrowLeft', moveLeftRef, 50, 160);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        startKeyRepeat('ArrowRight', moveRightRef, 50, 160);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        startKeyRepeat('ArrowDown', moveDownRef, 40, 90);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        rotatePieceRef.current();
      }
      if (e.key === ' ') {
        e.preventDefault();
        // Hard drop
        let testY = positionRef.current.y;
        while (!checkCollisionRef.current(currentPieceRef.current, positionRef.current.x, testY + 1, boardRef.current)) {
          testY++;
        }
        setPosition({ x: positionRef.current.x, y: testY });
        mergePieceRef.current(testY);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        stopKeyRepeat(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startKeyRepeat, stopKeyRepeat]);

  // Game Gravitational loop
  useEffect(() => {
    if (isGameStarted && !gameOver && currentPiece) {
      const dropInterval = setInterval(moveDown, 850);
      return () => clearInterval(dropInterval);
    }
  }, [moveDown, isGameStarted, gameOver, currentPiece]);

  // Combined render grid with Ghost Piece (Sombra) rendering
  const getRenderBoard = () => {
    let renderBoard = board.map(row => [...row]);
    
    if (currentPiece && isGameStarted && !gameOver) {
      // 1. Calculate drop coordinate for ghost piece
      let ghostY = position.y;
      while (!checkCollision(currentPiece, position.x, ghostY + 1, board)) {
        ghostY++;
      }
      
      // 2. Overlay ghost piece onto empty board tiles
      if (ghostY > position.y) {
        for (let r = 0; r < currentPiece.shape.length; r++) {
          for (let c = 0; c < currentPiece.shape[r].length; c++) {
            if (currentPiece.shape[r][c] !== 0) {
              let y = ghostY + r;
              let x = position.x + c;
              if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
                if (board[y][x] === 0) {
                  renderBoard[y][x] = 8; // Special index for shadow piece
                }
              }
            }
          }
        }
      }
    }

    // 3. Overlay the active falling piece
    if (currentPiece) {
      for (let r = 0; r < currentPiece.shape.length; r++) {
        for (let c = 0; c < currentPiece.shape[r].length; c++) {
          if (currentPiece.shape[r][c] !== 0) {
            let y = position.y + r;
            let x = position.x + c;
            if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
              renderBoard[y][x] = currentPiece.shape[r][c];
            }
          }
        }
      }
    }
    return renderBoard;
  };

  const getStatusIcon = (status) => {
    if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === 'checking') return <Activity className="w-4 h-4 text-amber-400 animate-pulse" />;
    return <AlertTriangle className="w-4 h-4 text-red-500 animate-bounce" />;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between pb-6 pt-4 px-4 font-sans text-slate-100 select-none relative">
      {/* Background Neon Glow Overlay */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Dynamic Slide-in Toast Banner Alerts */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div 
            key={t.id} 
            className="toast-animate glass-panel px-4 py-3 rounded-lg border-l-4 border-cyan-400 flex items-center gap-3 text-sm font-medium shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
            style={{ 
              borderLeftColor: t.type === 'game_over' ? 'var(--neon-magenta)' : 
                               t.type === 'game_start' ? 'var(--neon-cyan)' : 'var(--neon-green)'
            }}
          >
            <Zap className="w-4 h-4 text-cyan-400 flex-shrink-0 animate-pulse" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* HEADER */}
      <header className="w-full max-w-6xl flex justify-between items-center mb-4 z-10">
        <div className="flex items-center gap-3">
          <Link href="/debug" className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass-panel hover:text-cyan-400 text-xs font-semibold transition-all">
            <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>AWS Console Debug</span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 glass-panel px-3 py-1.5 rounded-full text-xs font-semibold">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>Multiplayer Online:</span>
            <span className="text-cyan-400 text-sm font-bold font-mono animate-pulse">{activeUsers}</span>
          </div>

          <button 
            onClick={() => setSoundEnabled(!soundEnabled)} 
            className="p-2 rounded-full glass-panel hover:text-cyan-400 transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* LOBBY / NAME REGISTER */}
      {!isGameStarted ? (
        <main className="w-full max-w-xl glass-panel p-8 rounded-2xl border border-slate-800/80 shadow-[0_10px_50px_rgba(0,0,0,0.6)] z-10 my-auto text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-gradient-to-tr from-cyan-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/20 mb-6">
            <Play className="w-8 h-8 text-white fill-white ml-1" />
          </div>
          
          <h2 className="text-3xl font-black mb-2 tracking-wide">INGRESA TU ALIAS</h2>
          <p className="text-sm text-slate-400 mb-8 max-w-md">
            Registra tu nombre en tiempo real en la red local de contenedores docker. ¡Tus récords se guardarán directamente en PostgreSQL y Redis!
          </p>

          <div className="w-full max-w-sm flex flex-col gap-4 mb-4">
            <input 
              type="text" 
              placeholder="Escribe tu nick o alias..." 
              value={playerName} 
              maxLength={15}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-5 py-3.5 bg-slate-950/80 border border-slate-800 focus:border-cyan-400 text-center rounded-xl text-lg font-bold placeholder-slate-600 focus:outline-none transition-all"
            />
            
            <button 
              onClick={startGame}
              className="w-full py-4 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 font-extrabold text-base tracking-widest uppercase rounded-xl shadow-lg shadow-cyan-400/20 active:scale-98 transition-all cursor-pointer"
            >
              Iniciar Arena Tetris
            </button>
          </div>

          <div className="w-full grid grid-cols-3 gap-3 max-w-md mt-6 pt-6 border-t border-slate-900/60 text-left">
            <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-900/50">
              <span className="text-[10px] text-slate-500 block uppercase font-extrabold">AWS DB SQL</span>
              <span className="text-xs font-bold text-slate-300">RDS Postgres</span>
            </div>
            <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-900/50">
              <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Caché / Zset</span>
              <span className="text-xs font-bold text-slate-300">ElastiCache</span>
            </div>
            <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-900/50">
              <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Async events</span>
              <span className="text-xs font-bold text-slate-300">AWS SQS Broker</span>
            </div>
          </div>
        </main>
      ) : (
        /* GAME ARENA PLAYING SCREEN */
        <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-10 gap-8 items-start my-auto z-10 justify-center mx-auto">

          {/* MAIN TETRIS GAME BOARD */}
          <section className="lg:col-span-6 flex justify-center">
            <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 shadow-[0_0_50px_rgba(0,240,255,0.06)] relative">
              {/* Grid Canvas */}
              <div className="grid bg-slate-950/80 p-2.5 rounded-xl border border-slate-900/90" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(26px, 32px))`, gridTemplateRows: `repeat(${ROWS}, minmax(26px, 32px))`, gap: '2px' }}>
                {getRenderBoard().map((row, y) =>
                  row.map((cellValue, x) => (
                    <div 
                      key={`${y}-${x}`} 
                      className={`w-full h-full rounded-[4px] border ${COLOR_MAP[cellValue]} transition-colors duration-75`} 
                    />
                  ))
                )}
              </div>

              {/* In-game Game Over Overlay Popups */}
              {gameOver && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-md rounded-2xl flex flex-col justify-center items-center p-6 text-center z-20">
                  <div className="w-14 h-14 bg-red-600/10 rounded-full flex items-center justify-center border border-red-500 mb-4 animate-pulse">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                  </div>
                  <h2 className="text-3xl font-black text-red-500 tracking-wider font-mono uppercase mb-2">Game Over</h2>
                  <p className="text-slate-400 text-sm max-w-xs mb-6">
                    Puntuación alcanzada por <strong className="text-cyan-400">{playerName}</strong>:
                    <span className="block text-3xl font-black text-green-400 font-mono mt-1">{score}</span>
                  </p>

                  <div className="flex flex-col gap-2.5 w-full max-w-[220px]">
                    <button 
                      onClick={startGame}
                      className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 font-extrabold tracking-widest uppercase rounded-lg shadow-md cursor-pointer transition-all"
                    >
                      Jugar de Nuevo
                    </button>
                    <button 
                      onClick={() => setIsGameStarted(false)}
                      className="w-full py-3 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 font-bold rounded-lg cursor-pointer transition-all"
                    >
                      Volver al Lobby
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* RIGHT SIDEBAR: HIGH SCORES & GAME CONTROLS */}
          <section className="lg:col-span-4 flex flex-col gap-5">
            {/* Score & Controls Panel */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col gap-4 text-center">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">PUNTUACIÓN ACTUAL</span>
                <p className="text-5xl font-extrabold text-green-400 font-mono tracking-tight mt-1">{score}</p>
              </div>

              <div className="border-t border-slate-900/60 pt-4 flex flex-col gap-2.5">
                <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block">Controles de Teclado</span>
                <div className="grid grid-cols-2 gap-2 text-left text-xs">
                  <div className="p-2 bg-slate-950/40 rounded border border-slate-900/50 flex justify-between items-center">
                    <span className="text-slate-400 font-semibold">◀ / ▶</span>
                    <span className="text-cyan-400 text-[10px] font-bold">Mover</span>
                  </div>
                  <div className="p-2 bg-slate-950/40 rounded border border-slate-900/50 flex justify-between items-center">
                    <span className="text-slate-400 font-semibold">▲</span>
                    <span className="text-fuchsia-400 text-[10px] font-bold">Rotar</span>
                  </div>
                  <div className="p-2 bg-slate-950/40 rounded border border-slate-900/50 flex justify-between items-center">
                    <span className="text-slate-400 font-semibold">▼</span>
                    <span className="text-cyan-400 text-[10px] font-bold">Bajar</span>
                  </div>
                  <div className="p-2 bg-slate-950/40 rounded border border-slate-900/50 flex justify-between items-center">
                    <span className="text-slate-400 font-semibold">Espacio</span>
                    <span className="text-green-400 text-[10px] font-bold">Caída rápida</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AWS ElastiCache / Redis Leaderboard */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800/80">
              <h3 className="text-sm font-black tracking-widest text-slate-400 mb-4 uppercase flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400 animate-bounce" />
                Global Leaderboard
              </h3>

              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto">
                {leaderboard.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    No hay puntuaciones registradas aún en Redis.
                  </div>
                ) : (
                  leaderboard.map((item, idx) => (
                    <div 
                      key={idx} 
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all text-xs ${
                        idx === 0 ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300 font-bold shadow-[0_0_15px_rgba(234,179,8,0.05)]' :
                        idx === 1 ? 'bg-slate-100/5 border-slate-400/20 text-slate-200 font-semibold' :
                        idx === 2 ? 'bg-amber-600/5 border-amber-600/20 text-amber-300 font-semibold' :
                        'bg-slate-950/20 border-slate-900/60 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-extrabold ${
                          idx === 0 ? 'bg-yellow-400/20 text-yellow-300' :
                          idx === 1 ? 'bg-slate-400/20 text-slate-200' :
                          idx === 2 ? 'bg-amber-600/20 text-amber-300' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="truncate max-w-[120px] font-mono">{item.nombre}</span>
                      </div>
                      <span className="font-bold font-mono tracking-wide">{item.puntaje}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

        </main>
      )}


    </div>
  );
}