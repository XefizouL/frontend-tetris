'use client';

import { useState, useEffect, useCallback } from 'react';

const COLS = 10;
const ROWS = 20;

// Aquí les puse números en vez de 1 para poder pintar los colores guardados
const TETROMINOS = {
  I: { shape: [[1, 1, 1, 1]], color: 'bg-cyan-400' },
  J: { shape: [[2, 0, 0], [2, 2, 2]], color: 'bg-blue-500' },
  L: { shape: [[0, 0, 3], [3, 3, 3]], color: 'bg-orange-500' },
  O: { shape: [[4, 4], [4, 4]], color: 'bg-yellow-400' },
  S: { shape: [[0, 5, 5], [5, 5, 0]], color: 'bg-green-500' },
  T: { shape: [[0, 6, 0], [6, 6, 6]], color: 'bg-purple-500' },
  Z: { shape: [[7, 7, 0], [0, 7, 7]], color: 'bg-red-500' },
};

const SHAPES = Object.keys(TETROMINOS);
const createEmptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

// Diccionario para saber qué color pintar según el número guardado en el tablero
const COLOR_MAP = {
  0: 'bg-gray-900',
  1: 'bg-cyan-400', 2: 'bg-blue-500', 3: 'bg-orange-500',
  4: 'bg-yellow-400', 5: 'bg-green-500', 6: 'bg-purple-500', 7: 'bg-red-500'
};

export default function Tetris() {
  const [board, setBoard] = useState(createEmptyBoard());
  const [currentPiece, setCurrentPiece] = useState(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [isGameStarted, setIsGameStarted] = useState(false);

  // Función para detectar si la pieza choca con algo
  const checkCollision = (piece, x, y, currentBoard) => {
    if (!piece) return false;
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c] !== 0) {
          let newY = y + r;
          let newX = x + c;
          // Choca con los bordes o con otra pieza ya fijada
          if (newY >= ROWS || newX < 0 || newX >= COLS || (newY >= 0 && currentBoard[newY][newX] !== 0)) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const spawnPiece = useCallback((currentBoard) => {
    const randomShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const piece = TETROMINOS[randomShape];
    const startX = Math.floor(COLS / 2) - Math.floor(piece.shape[0].length / 2);
    const startY = 0;

    // Si al nacer ya choca, es Game Over
    if (checkCollision(piece, startX, startY, currentBoard)) {
      setGameOver(true);
      return null;
    }

    setCurrentPiece(piece);
    setPosition({ x: startX, y: startY });
  }, []);

  const startGame = () => {
    const emptyBoard = createEmptyBoard();
    setBoard(emptyBoard);
    setScore(0);
    setGameOver(false);
    setIsGameStarted(true);
    spawnPiece(emptyBoard);
  };

  // Pegar la pieza al tablero cuando llega al fondo
  const mergePiece = useCallback(() => {
    if (!currentPiece) return;
    
    let newBoard = board.map(row => [...row]); // copia del tablero
    for (let r = 0; r < currentPiece.shape.length; r++) {
      for (let c = 0; c < currentPiece.shape[r].length; c++) {
        if (currentPiece.shape[r][c] !== 0) {
          if (position.y + r >= 0) {
            newBoard[position.y + r][position.x + c] = currentPiece.shape[r][c];
          }
        }
      }
    }

    // Limpiar líneas llenas
    let linesCleared = 0;
    newBoard = newBoard.filter(row => {
      let isLineFull = row.every(cell => cell !== 0);
      if (isLineFull) linesCleared++;
      return !isLineFull;
    });

    // Agregar nuevas líneas vacías arriba por cada línea limpiada
    for (let i = 0; i < linesCleared; i++) {
      newBoard.unshift(Array(COLS).fill(0));
      setScore(prev => prev + 100);
    }

    setScore(prev => prev + 10); // Puntos por colocar pieza
    setBoard(newBoard);
    spawnPiece(newBoard);

  }, [board, currentPiece, position, spawnPiece]);

  const moveDown = useCallback(() => {
    if (gameOver || !currentPiece) return;

    if (!checkCollision(currentPiece, position.x, position.y + 1, board)) {
      setPosition(prev => ({ ...prev, y: prev.y + 1 }));
    } else {
      mergePiece(); // Si choca abajo, se pega al tablero
    }
  }, [currentPiece, position, board, gameOver, mergePiece]);

  // Controles
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameOver || !currentPiece) return;
      
      if (e.key === 'ArrowLeft') {
        if (!checkCollision(currentPiece, position.x - 1, position.y, board)) {
          setPosition(prev => ({ ...prev, x: prev.x - 1 }));
        }
      }
      if (e.key === 'ArrowRight') {
        if (!checkCollision(currentPiece, position.x + 1, position.y, board)) {
          setPosition(prev => ({ ...prev, x: prev.x + 1 }));
        }
      }
      if (e.key === 'ArrowDown') {
        moveDown();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPiece, position, board, gameOver, moveDown]);

  // Game Loop (Gravedad)
  useEffect(() => {
    if (isGameStarted && !gameOver && currentPiece) {
      const dropInterval = setInterval(moveDown, 800);
      return () => clearInterval(dropInterval);
    }
  }, [moveDown, isGameStarted, gameOver, currentPiece]);

  const saveScoreToDatabase = async () => {
    if (!playerName) return alert("Ingresa tu nombre");

    try {
      const response = await fetch('http://localhost:5000/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: playerName, puntaje: score }),
      });

      if (response.ok) {
        alert("¡Guardado en la Base de Datos!");
      } else {
        alert("Error al guardar.");
      }
    } catch (error) {
      console.error(error);
      alert("Error. Verifica que el Backend de Docker esté corriendo.");
    }
  };

  // Crear un tablero combinado (tablero estático + pieza cayendo) para dibujarlo
  const getRenderBoard = () => {
    let renderBoard = board.map(row => [...row]);
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

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center font-sans text-white">
      <h1 className="text-4xl font-bold mb-6 text-cyan-400">Tetris Cloud</h1>
      
      <div className="flex gap-10">
        {/* Tablero */}
        <div className="bg-black p-2 border-4 border-gray-700 rounded shadow-2xl">
          <div className="grid bg-gray-800" style={{ gridTemplateColumns: `repeat(${COLS}, 30px)`, gridTemplateRows: `repeat(${ROWS}, 30px)`, gap: '1px' }}>
            {getRenderBoard().map((row, y) =>
              row.map((cellValue, x) => (
                <div key={`${y}-${x}`} className={`w-full h-full ${COLOR_MAP[cellValue]} border border-gray-800/50`} />
              ))
            )}
          </div>
        </div>

        {/* Panel Derecho */}
        <div className="flex flex-col gap-6 w-64">
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-bold mb-2">Puntaje</h2>
            <p className="text-3xl text-green-400">{score}</p>
          </div>

          {!isGameStarted && !gameOver && (
            <button onClick={startGame} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded transition-all">
              Iniciar Juego
            </button>
          )}

          {gameOver && (
            <div className="bg-red-900/50 p-6 rounded-xl border border-red-500 mt-4 text-center">
              <h2 className="text-xl font-bold text-red-400 mb-4">¡Game Over!</h2>
              <input 
                type="text" placeholder="Tu nombre..." value={playerName} onChange={(e) => setPlayerName(e.target.value)}
                className="w-full p-2 mb-4 bg-gray-900 text-white border border-gray-600 rounded focus:border-cyan-400"
              />
              <button onClick={saveScoreToDatabase} className="w-full bg-green-600 hover:bg-green-500 font-bold py-2 px-4 rounded mb-2 transition-all">
                Guardar Puntaje
              </button>
              <button onClick={startGame} className="w-full bg-gray-700 hover:bg-gray-600 font-bold py-2 px-4 rounded transition-all">
                Jugar de nuevo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}