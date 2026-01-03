const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fetch = require('cross-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const rooms = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// Generate questions endpoint
app.post('/api/generate-questions', async (req, res) => {
  try {
    const { category, difficulty, count } = req.body;
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Generate ${count} trivia questions about ${category} with ${difficulty} difficulty.
Return ONLY a valid JSON array with this exact structure:
[{"question": "question text", "options": ["A", "B", "C", "D"], "correctAnswer": 0}]
correctAnswer is the index (0-3) of the correct option.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) throw new Error('No JSON found');
    
    const questions = JSON.parse(jsonMatch[0]);
    res.json({ questions });
  } catch (error) {
    console.error('Error generating questions:', error);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
});

async function generateQuestions(category, difficulty, count) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Generate ${count} trivia questions about ${category} with ${difficulty} difficulty.
Return ONLY a valid JSON array with this exact structure:
[{"question": "question text", "options": ["A", "B", "C", "D"], "correctAnswer": 0}]
correctAnswer is the index (0-3) of the correct option.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) throw new Error('No JSON found');
    
    const questions = JSON.parse(jsonMatch[0]);
    return questions;
  } catch (error) {
    console.error('Error generating questions:', error);
    return [];
  }
}

function startQuestionTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.timer) clearInterval(room.timer);

  room.timeLeft = 10;
  room.showAnswer = false;
  room.answers = {};
  room.answerTimes = {};
  const questionStartTime = Date.now();

  io.to(roomId).emit('questionUpdate', {
    currentQuestion: room.currentQuestion,
    timeLeft: room.timeLeft,
    showAnswer: room.showAnswer,
  });

  room.timer = setInterval(() => {
    room.timeLeft--;
    
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.showAnswer = true;
      
      const correctAnswer = room.questions[room.currentQuestion]?.correctAnswer;
      room.players.forEach((player) => {
        if (room.answers[player.id] === correctAnswer) {
          const answerTime = room.answerTimes[player.id];
          const timeElapsed = answerTime ? (answerTime - questionStartTime) / 1000 : 10;
          // Award 2 points if answered within 3 seconds, 1 point otherwise
          player.score += timeElapsed <= 3 ? 2 : 1;
        }
      });

      io.to(roomId).emit('questionUpdate', {
        currentQuestion: room.currentQuestion,
        timeLeft: 0,
        showAnswer: true,
      });

      io.to(roomId).emit('gameState', {
        players: room.players,
        host: room.host,
        category: room.category,
        difficulty: room.difficulty,
        started: room.started,
        currentQuestion: room.currentQuestion,
        questions: room.questions,
        answers: room.answers,
        timeLeft: 0,
        showAnswer: true,
      });

      setTimeout(() => {
        room.currentQuestion++;
        if (room.currentQuestion < room.questions.length) {
          startQuestionTimer(roomId);
        } else {
          clearInterval(room.timer);
          room.started = false;
          io.to(roomId).emit('gameEnd');
        }
      }, 3000);
    } else {
      io.to(roomId).emit('questionUpdate', {
        currentQuestion: room.currentQuestion,
        timeLeft: room.timeLeft,
        showAnswer: room.showAnswer,
      });
    }
  }, 1000);
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('joinRoom', ({ roomId, playerName, isPublic }) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        players: [],
        host: socket.id,
        hostName: playerName,
        category: 'General Knowledge',
        difficulty: 'Medium',
        started: false,
        currentQuestion: 0,
        questions: [],
        answers: {},
        answerTimes: {},
        timeLeft: 10,
        showAnswer: false,
        timer: null,
        isPublic: isPublic !== undefined ? isPublic : false,
      });
    }

    const room = rooms.get(roomId);
    
    if (room.players.length >= 4) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    if (room.started) {
      socket.emit('error', { message: 'Game already started' });
      return;
    }

    room.players.push({
      id: socket.id,
      name: playerName,
      score: 0,
    });

    socket.join(roomId);
    socket.data.roomId = roomId;

    io.to(roomId).emit('gameState', {
      players: room.players,
      host: room.host,
      category: room.category,
      difficulty: room.difficulty,
      started: room.started,
      currentQuestion: room.currentQuestion,
      questions: room.questions,
      answers: room.answers,
      timeLeft: room.timeLeft,
      showAnswer: room.showAnswer,
    });

    console.log(`Player ${playerName} joined room ${roomId}`);
  });

  socket.on('updateSettings', ({ roomId, category, difficulty }) => {
    const room = rooms.get(roomId);
    if (room && room.host === socket.id) {
      room.category = category;
      room.difficulty = difficulty;
      io.to(roomId).emit('gameState', {
        players: room.players,
        host: room.host,
        category: room.category,
        difficulty: room.difficulty,
        started: room.started,
        currentQuestion: room.currentQuestion,
        questions: room.questions,
        answers: room.answers,
        timeLeft: room.timeLeft,
        showAnswer: room.showAnswer,
      });
    }
  });

  socket.on('startGame', async ({ roomId, category }) => {
    const room = rooms.get(roomId);
    if (room && room.host === socket.id && !room.started) {
      room.started = true;
      room.currentQuestion = 0;
      room.players.forEach((p) => (p.score = 0));
      
      const finalCategory = category || room.category;
      const questions = await generateQuestions(finalCategory, room.difficulty, 10);
      room.questions = questions;

      io.to(roomId).emit('gameState', {
        players: room.players,
        host: room.host,
        category: room.category,
        difficulty: room.difficulty,
        started: room.started,
        currentQuestion: room.currentQuestion,
        questions: room.questions,
        answers: room.answers,
        timeLeft: room.timeLeft,
        showAnswer: room.showAnswer,
      });

      startQuestionTimer(roomId);
      console.log(`Game started in room ${roomId}`);
    }
  });

  socket.on('submitAnswer', ({ roomId, answer }) => {
    const room = rooms.get(roomId);
    if (room && !room.showAnswer) {
      room.answers[socket.id] = answer;
      room.answerTimes[socket.id] = Date.now();
      io.to(roomId).emit('gameState', {
        players: room.players,
        host: room.host,
        category: room.category,
        difficulty: room.difficulty,
        started: room.started,
        currentQuestion: room.currentQuestion,
        questions: room.questions,
        answers: room.answers,
        timeLeft: room.timeLeft,
        showAnswer: room.showAnswer,
      });
    }
  });

  socket.on('returnToLobby', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.host === socket.id) {
      if (room.timer) clearInterval(room.timer);
      room.started = false;
      room.currentQuestion = 0;
      room.questions = [];
      room.answers = {};
      room.answerTimes = {};
      room.timeLeft = 10;
      room.showAnswer = false;
      room.players.forEach((p) => (p.score = 0));

      io.to(roomId).emit('gameState', {
        players: room.players,
        host: room.host,
        category: room.category,
        difficulty: room.difficulty,
        started: room.started,
        currentQuestion: room.currentQuestion,
        questions: room.questions,
        answers: room.answers,
        timeLeft: room.timeLeft,
        showAnswer: room.showAnswer,
      });
      console.log(`Room ${roomId} returned to lobby`);
    }
  });

  socket.on('getPublicLobbies', () => {
    const publicLobbies = [];
    rooms.forEach((room, id) => {
      if (room.isPublic && !room.started && room.players.length < 4) {
        publicLobbies.push({
          roomId: id,
          hostName: room.hostName,
          playerCount: room.players.length,
        });
      }
    });
    socket.emit('publicLobbies', publicLobbies);
  });

  // FPS Game Handlers
  socket.on('fpsJoinRoom', ({ roomId, playerName, isPublic }) => {
    socket.join(roomId);
    socket.data.fpsRoomId = roomId;

    let room = rooms.get(`fps_${roomId}`);
    if (!room) {
      room = {
        players: [],
        host: socket.id,
        hostName: playerName,
        started: false,
        gameTime: 300, // 5 minutes
        isPublic: isPublic !== undefined ? isPublic : false,
      };
      rooms.set(`fps_${roomId}`, room);
    }

    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe'];
    // Spawn players in a small area near center so they can see each other
    const spawnX = 600 + (Math.random() - 0.5) * 200; // Center ±100
    const spawnY = 350 + (Math.random() - 0.5) * 200; // Center ±100
    const newPlayer = {
      id: socket.id,
      name: playerName,
      x: spawnX,
      y: spawnY,
      angle: 0,
      health: 100,
      kills: 0,
      deaths: 0,
      color: colors[room.players.length % colors.length],
    };

    room.players.push(newPlayer);

    socket.emit('fpsJoined', { roomId });
    io.to(roomId).emit('fpsGameState', {
      players: room.players,
      host: room.host,
      started: room.started,
      timeLeft: room.gameTime,
      gameTime: room.gameTime,
    });
    console.log(`${playerName} joined FPS room ${roomId}`);
  });

  socket.on('fpsStartGame', ({ roomId }) => {
    const room = rooms.get(`fps_${roomId}`);
    if (!room || room.started) return;

    room.started = true;
    room.startTime = Date.now();
    room.bullets = [];

    io.to(roomId).emit('fpsStart');

    // Game loop
    room.gameLoop = setInterval(() => {
      if (!room.bullets) room.bullets = [];

      // Update bullets
      room.bullets = room.bullets.filter(bullet => {
        bullet.x += bullet.dx;
        bullet.y += bullet.dy;

        // Check bounds
        if (bullet.x < 0 || bullet.x > 1200 || bullet.y < 0 || bullet.y > 700) {
          return false;
        }

        // Check player hits
        for (const player of room.players) {
          if (player.id === bullet.playerId) continue;
          if (player.health <= 0) continue;

          const dist = Math.sqrt((bullet.x - player.x) ** 2 + (bullet.y - player.y) ** 2);
          if (dist < 20) {
            player.health -= 25;
            if (player.health <= 0) {
              player.health = 0;
              player.deaths++;
              const shooter = room.players.find(p => p.id === bullet.playerId);
              if (shooter) shooter.kills++;

              // Respawn after 3 seconds
              setTimeout(() => {
                player.health = 100;
                player.x = 600 + (Math.random() - 0.5) * 200;
                player.y = 350 + (Math.random() - 0.5) * 200;
              }, 3000);
            }
            return false;
          }
        }

        return true;
      });

      // Send game state
      io.to(roomId).emit('fpsGameState', {
        players: room.players,
        host: room.host,
        started: room.started,
        timeLeft: room.gameTime - Math.floor((Date.now() - room.startTime) / 1000),
        gameTime: room.gameTime,
      });

      // Check time limit
      const elapsed = Math.floor((Date.now() - room.startTime) / 1000);
      if (elapsed >= room.gameTime) {
        clearInterval(room.gameLoop);
        io.to(roomId).emit('fpsGameOver');
      }
    }, 16); // ~60 FPS
  });

  socket.on('fpsMove', ({ roomId, movement }) => {
    const room = rooms.get(`fps_${roomId}`);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.health <= 0) return;

    const speed = 5;
    let dx = 0;
    let dy = 0;

    if (movement.forward) dy -= speed;
    if (movement.backward) dy += speed;
    if (movement.left) dx -= speed;
    if (movement.right) dx += speed;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    player.x = Math.max(20, Math.min(1180, player.x + dx));
    player.y = Math.max(20, Math.min(680, player.y + dy));
    player.angle = movement.angle;

    // Broadcast updated positions immediately
    io.to(roomId).emit('fpsGameState', {
      players: room.players,
      host: room.host,
      started: room.started,
      timeLeft: room.gameTime - Math.floor((Date.now() - (room.startTime || Date.now())) / 1000),
      gameTime: room.gameTime,
    });
  });

  socket.on('fpsShoot', ({ roomId, angle }) => {
    const room = rooms.get(`fps_${roomId}`);
    if (!room || !room.bullets) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.health <= 0) return;

    const speed = 10;
    const bullet = {
      id: Math.random().toString(),
      x: player.x + Math.cos(angle) * 30,
      y: player.y + Math.sin(angle) * 30,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      playerId: socket.id,
    };

    room.bullets.push(bullet);
  });
  socket.on('getPublicFpsLobbies', () => {
    const publicLobbies = [];
    rooms.forEach((room, id) => {
      if (id.startsWith('fps_') && room.isPublic && !room.started && room.players.length < 4) {
        publicLobbies.push({
          roomId: id.replace('fps_', ''),
          hostName: room.hostName,
          playerCount: room.players.length,
        });
      }
    });
    socket.emit('publicFpsLobbies', publicLobbies);
  });
  socket.on('getPublicFpsLobbies', () => {
    const publicLobbies = [];
    rooms.forEach((room, id) => {
      if (id.startsWith('fps_') && room.isPublic && !room.started && room.players.length < 4) {
        publicLobbies.push({
          roomId: id.replace('fps_', ''),
          hostName: room.hostName,
          playerCount: room.players.length,
        });
      }
    });
    socket.emit('publicFpsLobbies', publicLobbies);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const fpsRoomId = socket.data.fpsRoomId;

    // Handle trivia room disconnect
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.players = room.players.filter((p) => p.id !== socket.id);
        
        if (room.players.length === 0) {
          if (room.timer) clearInterval(room.timer);
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (empty)`);
        } else {
          if (room.host === socket.id && room.players.length > 0) {
            room.host = room.players[0].id;
          }
          io.to(roomId).emit('gameState', {
            players: room.players,
            host: room.host,
            category: room.category,
            difficulty: room.difficulty,
            started: room.started,
            currentQuestion: room.currentQuestion,
            questions: room.questions,
            answers: room.answers,
            timeLeft: room.timeLeft,
            showAnswer: room.showAnswer,
          });
        }
      }
    }

    // Handle FPS room disconnect
    if (fpsRoomId) {
      const room = rooms.get(`fps_${fpsRoomId}`);
      if (room) {
        room.players = room.players.filter(p => p.id !== socket.id);
        if (room.players.length === 0) {
          if (room.gameLoop) clearInterval(room.gameLoop);
          rooms.delete(`fps_${fpsRoomId}`);
          console.log(`FPS room ${fpsRoomId} deleted (empty)`);
        } else {
          io.to(fpsRoomId).emit('fpsGameState', { players: room.players, bullets: room.bullets || [] });
        }
      }
    }

    console.log('Client disconnected:', socket.id);
  });

  // ============================================
  // CASINO GAME HANDLERS
  // ============================================

  socket.on('casinoCreateLobby', ({ playerName, isPublic }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const player = {
      id: socket.id,
      name: playerName,
      balance: 1000,
      currentBet: 0,
      hand: [],
      handValue: 0,
      isStanding: false,
      isBusted: false
    };

    rooms.set(`casino_${roomId}`, {
      players: [player],
      dealer: { hand: [], value: 0 },
      deck: [],
      state: 'lobby', // lobby, betting, playing, results
      isPublic: true, // Always public
      currentTurn: null
    });

    socket.join(`casino_${roomId}`);
    socket.emit('casinoLobbyCreated', { roomId, players: [player] });
    console.log(`Casino lobby ${roomId} created by ${playerName} (public)`);
  });

  socket.on('getCasinoPublicLobbies', () => {
    const publicLobbies = [];
    rooms.forEach((room, key) => {
      if (key.startsWith('casino_') && room.isPublic && room.state === 'lobby') {
        const roomId = key.replace('casino_', '');
        publicLobbies.push({
          roomId,
          playerCount: room.players.length,
          maxPlayers: 4
        });
      }
    });
    socket.emit('casinoPublicLobbies', { lobbies: publicLobbies });
  });

  socket.on('casinoJoinLobby', ({ roomId, playerName }) => {
    const room = rooms.get(`casino_${roomId}`);
    if (!room) {
      socket.emit('error', { message: 'Lobby not found' });
      return;
    }

    if (room.players.length >= 3) {
      socket.emit('error', { message: 'Lobby is full (max 3 players)' });
      return;
    }

    const player = {
      id: socket.id,
      name: playerName,
      balance: 1000,
      currentBet: 0,
      hand: [],
      handValue: 0,
      isStanding: false,
      isBusted: false
    };

    room.players.push(player);
    socket.join(`casino_${roomId}`);
    io.to(`casino_${roomId}`).emit('casinoPlayerJoined', { players: room.players });
    console.log(`${playerName} joined casino lobby ${roomId}`);
  });

  socket.on('casinoStartGame', ({ roomId }) => {
    const room = rooms.get(`casino_${roomId}`);
    if (!room) return;

    room.state = 'betting';
    // Assign player positions (right to left)
    room.playerPositions = room.players.length;
    io.to(`casino_${roomId}`).emit('casinoGameStarted', { playerPositions: room.playerPositions });
    console.log(`Casino game started in ${roomId} with ${room.playerPositions} players`);
  });

  socket.on('casinoPlaceBet', ({ roomId, bet, sideBets }) => {
    const room = rooms.get(`casino_${roomId}`);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || bet > player.balance) return;

    player.currentBet = bet;
    player.balance -= bet;
    player.sideBets = sideBets || { perfectPairs: 0, twentyOnePlus3: 0 };

    // Check if all players have bet
    const allBet = room.players.every(p => p.currentBet > 0);
    if (allBet) {
      // Deal initial cards and set first player's turn (rightmost = last in array)
      dealBlackjackCards(roomId);
      room.currentTurn = room.players[room.players.length - 1].id;
      io.to(`casino_${roomId}`).emit('casinoTurnUpdate', { currentTurn: room.currentTurn });
    }
  });

  socket.on('casinoHit', ({ roomId }) => {
    const room = rooms.get(`casino_${roomId}`);
    if (!room || room.currentTurn !== socket.id) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isStanding || player.isBusted) return;

    const card = room.deck.pop();
    player.hand.push(card);
    player.handValue = calculateBlackjackValue(player.hand);

    if (player.handValue > 21) {
      player.isBusted = true;
      player.isStanding = true;
      moveToNextPlayer(roomId);
    }

    io.to(`casino_${roomId}`).emit('casinoCardDealt', {
      playerId: socket.id,
      card,
      handValue: player.handValue
    });

    io.to(`casino_${roomId}`).emit('casinoPlayersUpdate', { players: room.players });
  });

  socket.on('casinoStand', ({ roomId }) => {
    const room = rooms.get(`casino_${roomId}`);
    if (!room || room.currentTurn !== socket.id) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.isStanding = true;
    moveToNextPlayer(roomId);
    io.to(`casino_${roomId}`).emit('casinoPlayersUpdate', { players: room.players });
  });

  socket.on('casinoDoubleDown', ({ roomId }) => {
    const room = rooms.get(`casino_${roomId}`);
    if (!room || room.currentTurn !== socket.id) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.balance < player.currentBet) return;

    // Double the bet
    player.balance -= player.currentBet;
    player.currentBet *= 2;

    // Take one card and auto-stand
    const card = room.deck.pop();
    player.hand.push(card);
    player.handValue = calculateBlackjackValue(player.hand);
    player.isStanding = true;

    if (player.handValue > 21) {
      player.isBusted = true;
    }

    io.to(`casino_${roomId}`).emit('casinoCardDealt', {
      playerId: socket.id,
      card,
      handValue: player.handValue
    });

    moveToNextPlayer(roomId);
    io.to(`casino_${roomId}`).emit('casinoPlayersUpdate', { players: room.players });
  });

  socket.on('casinoLeave', ({ roomId }) => {
    const room = rooms.get(`casino_${roomId}`);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);
    
    if (room.players.length === 0) {
      rooms.delete(`casino_${roomId}`);
    } else {
      io.to(`casino_${roomId}`).emit('casinoPlayerJoined', { players: room.players });
    }

    socket.leave(`casino_${roomId}`);
  });
});

// Helper functions for Blackjack
function createBlackjackDeck() {
  const suits = ['♠️', '♥️', '♣️', '♦️'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];

  suits.forEach(suit => {
    values.forEach(value => {
      let numValue = parseInt(value);
      if (value === 'A') numValue = 11;
      else if (['J', 'Q', 'K'].includes(value)) numValue = 10;

      deck.push({ suit, value, numValue });
    });
  });

  return shuffleBlackjackDeck(deck);
}

function shuffleBlackjackDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function calculateBlackjackValue(hand) {
  let value = 0;
  let aces = 0;

  hand.forEach(card => {
    if (card.value === 'A') {
      aces++;
      value += 11;
    } else {
      value += card.numValue;
    }
  });

  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return value;
}

function dealBlackjackCards(roomId) {
  const room = rooms.get(`casino_${roomId}`);
  if (!room) return;

  room.deck = createBlackjackDeck();
  room.state = 'playing';

  // Reset player hands
  room.players.forEach(player => {
    player.hand = [];
    player.handValue = 0;
    player.isStanding = false;
    player.isBusted = false;

    // Deal 2 cards to each player
    const card1 = room.deck.pop();
    const card2 = room.deck.pop();
    player.hand = [card1, card2];
    player.handValue = calculateBlackjackValue(player.hand);
  });

  // Deal 2 cards to dealer (only show 1)
  const dealerCard1 = room.deck.pop();
  const dealerCard2 = room.deck.pop();
  room.dealer.hand = [dealerCard1, dealerCard2];
  room.dealer.value = calculateBlackjackValue(room.dealer.hand);

  // Send initial cards (hide dealer's second card)
  io.to(`casino_${roomId}`).emit('casinoDealCards', {
    players: room.players,
    dealer: {
      hand: [dealerCard1], // Only show first card
      value: dealerCard1.numValue
    },
    currentTurn: room.currentTurn
  });
}

function moveToNextPlayer(roomId) {
  const room = rooms.get(`casino_${roomId}`);
  if (!room) return;

  const currentIndex = room.players.findIndex(p => p.id === room.currentTurn);
  const nextIndex = currentIndex - 1; // Move left (right to left order)
  
  if (nextIndex >= 0) {
    room.currentTurn = room.players[nextIndex].id;
    io.to(`casino_${roomId}`).emit('casinoTurnUpdate', { currentTurn: room.currentTurn });
  } else {
    // All players done, play dealer
    checkBlackjackRoundEnd(roomId);
  }
}

function checkBlackjackRoundEnd(roomId) {
  const room = rooms.get(`casino_${roomId}`);
  if (!room) return;

  // Check if all players are done (standing or busted)
  const allDone = room.players.every(p => p.isStanding || p.isBusted);
  
  if (allDone) {
    // Play dealer's hand (hit until 17+)
    while (room.dealer.value < 17) {
      const card = room.deck.pop();
      room.dealer.hand.push(card);
      room.dealer.value = calculateBlackjackValue(room.dealer.hand);
    }

    // Determine winners and update balances
    const results = {};
    room.players.forEach(player => {
      if (player.isBusted) {
        results[player.id] = 'Bust! You lose.';
      } else if (room.dealer.value > 21) {
        results[player.id] = 'Dealer busts! You win!';
        player.balance += player.currentBet * 2;
      } else if (player.handValue > room.dealer.value) {
        results[player.id] = 'You win!';
        player.balance += player.currentBet * 2;
      } else if (player.handValue < room.dealer.value) {
        results[player.id] = 'Dealer wins.';
      } else {
        results[player.id] = 'Push! Bet returned.';
        player.balance += player.currentBet;
      }

      player.currentBet = 0;
    });

    room.state = 'results';
    io.to(`casino_${roomId}`).emit('casinoRoundEnd', {
      players: room.players,
      dealer: room.dealer,
      results
    });
  }
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.io server running on port ${PORT}`);
});