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
const drawBattleLobbies = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// Generate questions endpoint
app.post('/api/generate-questions', async (req, res) => {
  try {
    const { category, difficulty, count } = req.body;
    const OpenAI = require('openai').default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `Generate ${count} trivia questions about ${category} with ${difficulty} difficulty.
Return ONLY a valid JSON array with this exact structure:
[{"question": "question text", "options": ["A", "B", "C", "D"], "correctAnswer": 0}]
correctAnswer is the index (0-3) of the correct option.`;

    const response = await client.responses.create({
      model: 'gpt-5-nano',
      input: prompt
    });

    const text = response.output_text;
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
    const OpenAI = require('openai').default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `Generate ${count} trivia questions about ${category} with ${difficulty} difficulty.
Return ONLY a valid JSON array with this exact structure:
[{"question": "question text", "options": ["A", "B", "C", "D"], "correctAnswer": 0}]
correctAnswer is the index (0-3) of the correct option.`;

    const response = await client.responses.create({
      model: 'gpt-5-nano',
      input: prompt
    });

    const text = response.output_text;
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

  socket.on('startGame', async (data) => {
    // Handle trivia game start (has roomId and category parameters)
    if (data && data.roomId) {
      const { roomId, category } = data;
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

    // Handle Draw Battle disconnect
    if (socket.lobbyId) {
      const lobby = drawBattleLobbies.get(socket.lobbyId);
      if (lobby) {
        lobby.players = lobby.players.filter(p => p.id !== socket.id);
        
        if (lobby.players.length === 0) {
          drawBattleLobbies.delete(socket.lobbyId);
        } else if (lobby.host === socket.id) {
          lobby.host = lobby.players[0].id;
          lobby.players[0].ready = true;
        }

        if (lobby.players.length > 0) {
          io.to(socket.lobbyId).emit('lobbyUpdate', lobby);
          io.to(socket.lobbyId).emit('playerLeft', { playerId: socket.id });
        }

        io.emit('lobbiesUpdate', Array.from(drawBattleLobbies.values()));
      }
    }

    console.log('Client disconnected:', socket.id);
  });

  // ============================================
  // DRAW & GUESS GAME HANDLERS
  // ============================================

  socket.on('drawGuessCreateLobby', ({ playerName, isPublic = false }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const player = {
      id: socket.id,
      name: playerName,
      prompt: '',
      drawing: '',
      enhancedImage: '',
      guess: '',
      score: 0
    };

    rooms.set(`drawguess_${roomId}`, {
      players: [player],
      state: 'lobby',
      prompts: [],
      timeRemaining: 60,
      isPublic,
      hostName: playerName,
      maxPlayers: 4,
      currentRound: 1,
      maxRounds: 3,
      guesses: new Map() // Track guesses per player per drawing
    });

    socket.join(`drawguess_${roomId}`);
    socket.emit('drawGuessLobbyCreated', { roomId, players: [player] });
    console.log(`Draw & Guess lobby ${roomId} created by ${playerName}`);
  });

  socket.on('drawGuessJoinLobby', ({ roomId, playerName }) => {
    const room = rooms.get(`drawguess_${roomId}`);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    const player = {
      id: socket.id,
      name: playerName,
      prompt: '',
      drawing: '',
      enhancedImage: '',
      guess: '',
      score: 0
    };

    room.players.push(player);
    socket.join(`drawguess_${roomId}`);
    
    io.to(`drawguess_${roomId}`).emit('drawGuessPlayerJoined', { players: room.players });
    socket.emit('drawGuessJoinedLobby', { roomId, players: room.players });
  });

  socket.on('getDrawGuessPublicLobbies', () => {
    const publicLobbies = [];
    for (const [key, room] of rooms.entries()) {
      if (key.startsWith('drawguess_') && room.isPublic && room.state === 'lobby') {
        publicLobbies.push({
          roomId: key.replace('drawguess_', ''),
          hostName: room.hostName,
          playerCount: room.players.length,
          maxPlayers: room.maxPlayers
        });
      }
    }
    socket.emit('drawGuessPublicLobbies', { lobbies: publicLobbies });
  });

  socket.on('drawGuessStartGame', async ({ roomId }) => {
    const room = rooms.get(`drawguess_${roomId}`);
    if (!room) return;

    room.state = 'drawing';

    // Generate prompts for each player using OpenAI
    const prompts = [];
    for (let i = 0; i < room.players.length; i++) {
      const OpenAI = require('openai').default;
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await client.responses.create({
        model: 'gpt-5-nano',
        input: `Generate a single random object or thing for someone to draw. It should be simple enough to draw in 60 seconds and recognizable. Examples: "a cat", "a bicycle", "a tree". Respond with ONLY the thing to draw, nothing else.`
      });

      const prompt = response.output_text.trim();
      prompts.push(prompt);
    }

    room.players.forEach((player, index) => {
      player.prompt = prompts[index];
      io.to(player.id).emit('drawGuessYourPrompt', { prompt: prompts[index] });
    });

    io.to(`drawguess_${roomId}`).emit('drawGuessGameStarted', { state: 'drawing' });
    
    // Start 60 second timer
    let timeLeft = 60;
    const timerInterval = setInterval(() => {
      timeLeft--;
      io.to(`drawguess_${roomId}`).emit('drawGuessTimerUpdate', { timeRemaining: timeLeft });
      
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        room.state = 'guessing';
        io.to(`drawguess_${roomId}`).emit('drawGuessPhaseChange', { state: 'guessing' });
      }
    }, 1000);
  });

  socket.on('drawGuessSubmitDrawing', ({ roomId, drawing, enhancedImage }) => {
    const room = rooms.get(`drawguess_${roomId}`);
    if (!room) {
      console.log('❌ Room not found:', roomId);
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.drawing = drawing;
      player.enhancedImage = enhancedImage || drawing; // Fall back to original drawing if enhancement failed
      console.log(`✓ Player ${player.name} submitted drawing`);
    }

    // Check if all players have submitted their drawing
    const allSubmitted = room.players.every(p => p.drawing);
    const submittedCount = room.players.filter(p => p.drawing).length;
    console.log(`Draw submissions: ${submittedCount}/${room.players.length}`);
    
    if (allSubmitted) {
      console.log('✓ All players submitted! Moving to guessing phase...');
      room.state = 'guessing';
      room.currentDrawingIndex = 0; // Start at first drawing
      room.currentDrawingGuesses = new Map(); // Reset guesses
      io.to(`drawguess_${roomId}`).emit('drawGuessAllSubmitted', { players: room.players, state: 'guessing' });
    }
  });

  socket.on('drawGuessSubmitGuess', ({ roomId, guess, targetPlayerId }) => {
    const room = rooms.get(`drawguess_${roomId}`);
    if (!room) return;

    const targetPlayer = room.players.find(p => p.id === targetPlayerId);
    const guessingPlayer = room.players.find(p => p.id === socket.id);

    if (targetPlayer && guessingPlayer) {
      const targetPrompt = targetPlayer.prompt.toLowerCase().trim();
      const guessLower = guess.toLowerCase().trim();

      // Check if correct (exact match or very close)
      const correct = guessLower === targetPrompt || 
                     targetPrompt.includes(guessLower) || 
                     guessLower.includes(targetPrompt);

      if (correct) {
        guessingPlayer.score += 1; // 1 point per correct guess
      }

      // Track who has guessed for this drawing
      if (!room.currentDrawingGuesses) {
        room.currentDrawingGuesses = new Map();
      }
      room.currentDrawingGuesses.set(socket.id, { guess, correct });

      // Send immediate feedback to the guessing player
      io.to(socket.id).emit('drawGuessGuessFeedback', {
        correct,
        answer: targetPlayer.prompt,
        score: guessingPlayer.score
      });

      // Check if all players (except the drawer) have guessed
      const numPlayers = room.players.length;
      const numGuesses = room.currentDrawingGuesses.size + 1; // +1 for the drawer who doesn't guess
      
      if (numGuesses >= numPlayers) {
        // All players have guessed - move to next drawing
        room.currentDrawingGuesses.clear();
        const currentIndex = room.currentDrawingIndex || 0;
        
        setTimeout(() => {
          if (currentIndex < numPlayers - 1) {
            // Move to next drawing
            room.currentDrawingIndex = currentIndex + 1;
            io.to(`drawguess_${roomId}`).emit('drawGuessNextDrawing', { 
              drawingIndex: room.currentDrawingIndex,
              players: room.players
            });
          } else {
            // Round complete
            finishDrawGuessRound(roomId, room);
          }
        }, 2000); // 2 second delay to show results
      }
    }
  });

  function finishDrawGuessRound(roomId, room) {
    if (room.currentRound < room.maxRounds) {
      // Start next round
      room.currentRound++;
      room.currentDrawingIndex = 0;
      room.players.forEach(player => {
        player.drawing = '';
        player.enhancedImage = '';
        player.guess = '';
        player.prompt = '';
      });
      
      room.state = 'lobby';
      io.to(`drawguess_${roomId}`).emit('drawGuessRoundComplete', { 
        round: room.currentRound,
        players: room.players
      });
      
      // Auto-start next round after 5 seconds
      setTimeout(async () => {
        room.state = 'drawing';

        // Generate prompts for each player using OpenAI
        const prompts = [];
        for (let i = 0; i < room.players.length; i++) {
          const OpenAI = require('openai').default;
          const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

          const response = await client.responses.create({
            model: 'gpt-5-nano',
            input: `Generate a single random object or thing for someone to draw. It should be simple enough to draw in 60 seconds and recognizable. Examples: "a cat", "a bicycle", "a tree". Respond with ONLY the thing to draw, nothing else.`
          });

          const prompt = response.output_text.trim();
          prompts.push(prompt);
        }

        room.players.forEach((player, index) => {
          player.prompt = prompts[index];
          io.to(player.id).emit('drawGuessYourPrompt', { prompt: prompts[index] });
        });

        io.to(`drawguess_${roomId}`).emit('drawGuessGameStarted', { state: 'drawing' });
        
        // Start 60 second timer
        let timeLeft = 60;
        const timerInterval = setInterval(() => {
          timeLeft--;
          io.to(`drawguess_${roomId}`).emit('drawGuessTimerUpdate', { timeRemaining: timeLeft });
          
          if (timeLeft <= 0) {
            clearInterval(timerInterval);
            room.state = 'guessing';
            io.to(`drawguess_${roomId}`).emit('drawGuessPhaseChange', { state: 'guessing' });
          }
        }, 1000);
      }, 5000);
    } else {
      // Game over - show final results
      room.state = 'results';
      io.to(`drawguess_${roomId}`).emit('drawGuessResults', { 
        players: room.players, 
        state: 'results'
      });
    }
  }

  socket.on('drawGuessFinishRound', ({ roomId }) => {
    const room = rooms.get(`drawguess_${roomId}`);
    if (!room) return;
    finishDrawGuessRound(roomId, room);
  });

  socket.on('drawGuessPlayAgain', ({ roomId }) => {
    const room = rooms.get(`drawguess_${roomId}`);
    if (!room) return;

    // Reset for new game
    room.currentRound = 1;
    room.players.forEach(player => {
      player.prompt = '';
      player.drawing = '';
      player.enhancedImage = '';
      player.guess = '';
      player.score = 0;
    });

    room.state = 'lobby';
    io.to(`drawguess_${roomId}`).emit('drawGuessReset', { players: room.players, state: 'lobby' });
  });

  // ============================================
  // DRAW BATTLE GAME HANDLERS
  // ============================================

  socket.on('createLobby', ({ playerName, isPrivate, gameType }) => {
    console.log('Received createLobby:', { playerName, isPrivate, gameType, socketId: socket.id });
    if (gameType !== 'drawBattle') return;

    const lobbyId = Math.random().toString(36).substring(7);
    const lobby = {
      id: lobbyId,
      name: `${playerName}'s Lobby`,
      host: socket.id,
      players: [{
        id: socket.id,
        name: playerName,
        score: 0,
        ready: true,
        hasDrawn: false,
        hasGuessed: false
      }],
      isPrivate,
      maxPlayers: 4,
      inGame: false,
      gameType: 'drawBattle',
      currentRound: 0,
      drawings: [],
      guesses: {}
    };

    drawBattleLobbies.set(lobbyId, lobby);
    socket.join(lobbyId);
    socket.lobbyId = lobbyId;

    console.log('Created lobby:', lobbyId, 'Emitting lobbyUpdate to socket:', socket.id);
    socket.emit('lobbyUpdate', lobby);
    io.emit('lobbiesUpdate', Array.from(drawBattleLobbies.values()));
  });

  socket.on('joinLobby', ({ lobbyId, playerName, gameType }) => {
    if (gameType !== 'drawBattle') return;

    const lobby = drawBattleLobbies.get(lobbyId);
    if (!lobby || lobby.players.length >= lobby.maxPlayers || lobby.inGame) {
      socket.emit('error', 'Cannot join lobby');
      return;
    }

    lobby.players.push({
      id: socket.id,
      name: playerName,
      score: 0,
      ready: false,
      hasDrawn: false,
      hasGuessed: false
    });

    socket.join(lobbyId);
    socket.lobbyId = lobbyId;

    io.to(lobbyId).emit('lobbyUpdate', lobby);
    io.emit('lobbiesUpdate', Array.from(drawBattleLobbies.values()));
  });

  socket.on('toggleReady', () => {
    const lobbyId = socket.lobbyId;
    const lobby = drawBattleLobbies.get(lobbyId);
    if (!lobby) return;

    const player = lobby.players.find(p => p.id === socket.id);
    if (player && player.id !== lobby.host) {
      player.ready = !player.ready;
      io.to(lobbyId).emit('lobbyUpdate', lobby);
    }
  });

  socket.on('startGame', () => {
    const lobbyId = socket.lobbyId;
    const lobby = drawBattleLobbies.get(lobbyId);
    if (!lobby || lobby.host !== socket.id) return;

    const allReady = lobby.players.every(p => p.ready || p.id === lobby.host);
    if (lobby.players.length < 2 || !allReady) return;

    lobby.inGame = true;
    lobby.currentRound = 1;
    lobby.drawings = [];
    lobby.guesses = {};
    lobby.players.forEach(p => {
      p.hasDrawn = false;
      p.hasGuessed = false;
      p.score = 0;
    });

    io.to(lobbyId).emit('gameStart', { round: 1 });
    io.emit('lobbiesUpdate', Array.from(drawBattleLobbies.values()));
  });

  socket.on('submitDrawing', ({ imageData, enhancedImage, prompt }) => {
    const lobbyId = socket.lobbyId;
    console.log('submitDrawing called by socket', socket.id, 'lobbyId:', lobbyId);
    const lobby = drawBattleLobbies.get(lobbyId);
    if (!lobby) {
      console.log('submitDrawing: Lobby not found for socket', socket.id, 'lobbyId:', lobbyId);
      console.log('Available lobbies:', Array.from(drawBattleLobbies.keys()));
      return;
    }

    const player = lobby.players.find(p => p.id === socket.id);
    if (player) {
      console.log(`Before submission - Player ${player.name} hasDrawn:`, player.hasDrawn, 'Current drawings:', lobby.drawings.length);
      player.hasDrawn = true;
      lobby.drawings.push({
        playerId: socket.id,
        playerName: player.name,
        prompt,
        imageData,
        enhancedImage
      });

      console.log(`Player ${player.name} submitted drawing. Total: ${lobby.drawings.length}/${lobby.players.length}`);
      console.log('All players and their hasDrawn status:', lobby.players.map(p => ({ name: p.name, hasDrawn: p.hasDrawn })));
      io.to(lobbyId).emit('lobbyUpdate', lobby);

      // Check if all players have drawn
      const allDrawn = lobby.players.every(p => p.hasDrawn);
      console.log(`All players drawn? ${allDrawn}`);
      if (allDrawn) {
        console.log('All players have drawn! Waiting 20 seconds for AI enhancements to complete...');
        setTimeout(() => {
          console.log('Emitting allDrawingsReady with', lobby.drawings.length, 'drawings to lobby', lobbyId);
          io.to(lobbyId).emit('allDrawingsReady', lobby.drawings);
        }, 20000);
      }
    }
  });

  socket.on('updateDrawing', ({ enhancedImage }) => {
    const lobbyId = socket.lobbyId;
    const lobby = drawBattleLobbies.get(lobbyId);
    if (!lobby) return;

    // Find and update the drawing with enhanced version
    const drawing = lobby.drawings.find(d => d.playerId === socket.id);
    if (drawing) {
      drawing.enhancedImage = enhancedImage;
      console.log(`Updated enhanced image for player ${drawing.playerName}`);
      
      // Emit updated drawings to all players in case they're already in guessing phase
      io.to(lobbyId).emit('drawingsUpdated', lobby.drawings);
    }
  });

  socket.on('submitGuess', ({ drawingPlayerId, correct }) => {
    const lobbyId = socket.lobbyId;
    const lobby = drawBattleLobbies.get(lobbyId);
    if (!lobby) return;

    if (!lobby.guesses[socket.id]) {
      lobby.guesses[socket.id] = [];
    }
    
    lobby.guesses[socket.id].push({
      drawingPlayerId,
      correct
    });
  });

  socket.on('finishGuessing', () => {
    const lobbyId = socket.lobbyId;
    const lobby = drawBattleLobbies.get(lobbyId);
    if (!lobby) return;

    const player = lobby.players.find(p => p.id === socket.id);
    if (player) {
      player.hasGuessed = true;

      // Check if all players have finished guessing
      if (lobby.players.every(p => p.hasGuessed)) {
        // Calculate scores for this round
        const roundScores = {};
        
        lobby.players.forEach(player => {
          const playerGuesses = lobby.guesses[player.id] || [];
          const correctGuesses = playerGuesses.filter(g => g.correct).length;
          player.score += correctGuesses;
          roundScores[player.id] = correctGuesses;
        });

        io.to(lobbyId).emit('roundEnd', roundScores);
        io.to(lobbyId).emit('lobbyUpdate', lobby);

        // Start next round or end game
        setTimeout(() => {
          if (lobby.currentRound < 3) {
            lobby.currentRound++;
            lobby.drawings = [];
            lobby.guesses = {};
            lobby.players.forEach(p => {
              p.hasDrawn = false;
              p.hasGuessed = false;
            });

            io.to(lobbyId).emit('gameStart', { round: lobby.currentRound });
          } else {
            io.to(lobbyId).emit('gameEnd', lobby.players);
            lobby.inGame = false;
            io.emit('lobbiesUpdate', Array.from(drawBattleLobbies.values()));
          }
        }, 5000);
      }
    }
  });

  socket.on('leaveLobby', () => {
    const lobbyId = socket.lobbyId;
    const lobby = drawBattleLobbies.get(lobbyId);
    if (!lobby) return;

    lobby.players = lobby.players.filter(p => p.id !== socket.id);
    socket.leave(lobbyId);
    delete socket.lobbyId;

    if (lobby.players.length === 0) {
      drawBattleLobbies.delete(lobbyId);
    } else if (lobby.host === socket.id) {
      lobby.host = lobby.players[0].id;
      lobby.players[0].ready = true;
    }

    if (lobby.players.length > 0) {
      io.to(lobbyId).emit('lobbyUpdate', lobby);
      io.to(lobbyId).emit('playerLeft', { playerId: socket.id });
    }

    io.emit('lobbiesUpdate', Array.from(drawBattleLobbies.values()));
  });

  socket.on('getLobbies', ({ gameType }) => {
    if (gameType === 'drawBattle') {
      socket.emit('lobbiesUpdate', Array.from(drawBattleLobbies.values()));
    }
  });

  // ============================================
  // CASINO GAME HANDLERS
  // ============================================

  socket.on('casinoCreateLobby', ({ playerName, isPublic }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const player = {
      id: socket.id,
      name: playerName,
      balance: 25000,
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
      if (key.startsWith('casino_') && room.isPublic && room.players.length < 3) {
        const roomId = key.replace('casino_', '');
        publicLobbies.push({
          roomId,
          playerCount: room.players.length,
          maxPlayers: 3,
          state: room.state
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
      balance: 25000,
      currentBet: 0,
      hand: [],
      handValue: 0,
      isStanding: false,
      isBusted: false
    };

    room.players.push(player);
    socket.join(`casino_${roomId}`);
    
    // Tell everyone a player joined
    io.to(`casino_${roomId}`).emit('casinoPlayerJoined', { players: room.players });
    
    // Tell the new player what state the game is in
    socket.emit('casinoGameState', { 
      state: room.state,
      players: room.players,
      dealer: room.dealer 
    });
    
    console.log(`${playerName} joined casino lobby ${roomId} (state: ${room.state})`);
  });

  socket.on('casinoNextHand', ({ roomId }) => {
    const room = rooms.get(`casino_${roomId}`);
    if (!room) return;

    // Reset room state for new hand
    room.state = 'betting';
    room.dealer.hand = [];
    room.dealer.value = 0;
    room.currentTurn = null;
    
    // Reset all players for new hand
    room.players.forEach(player => {
      player.hand = [];
      player.handValue = 0;
      player.currentBet = 0;
      player.isStanding = false;
      player.isBusted = false;
      player.splitHands = null;
      player.currentSplitIndex = 0;
    });

    io.to(`casino_${roomId}`).emit('casinoNewHandStarted');
    console.log(`New hand started in casino ${roomId}`);
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

    // Calculate total bet including side bets
    const totalSideBets = (sideBets?.perfectPairs || 0) + (sideBets?.twentyOnePlus3 || 0);
    const totalBet = bet + totalSideBets;
    
    if (totalBet > player.balance) return;

    player.currentBet = bet;
    player.balance -= totalBet; // Deduct main bet + side bets
    player.sideBets = sideBets || { perfectPairs: 0, twentyOnePlus3: 0 };

    // Check if all players have bet
    const allBet = room.players.every(p => p.currentBet > 0);
    if (allBet) {
      // Deal initial cards and set first player's turn (rightmost = last in array)
      dealBlackjackCards(roomId);
      
      // Find first player (from right to left) who doesn't have blackjack
      const activePlayers = room.players.filter(p => p.currentBet > 0);
      let firstPlayerIndex = activePlayers.length - 1;
      while (firstPlayerIndex >= 0 && activePlayers[firstPlayerIndex].isStanding) {
        firstPlayerIndex--;
      }
      
      if (firstPlayerIndex >= 0) {
        room.currentTurn = activePlayers[firstPlayerIndex].id;
        io.to(`casino_${roomId}`).emit('casinoTurnUpdate', { currentTurn: room.currentTurn });
      } else {
        // All players have blackjack, go straight to dealer
        checkBlackjackRoundEnd(roomId);
      }
    }
  });

  socket.on('casinoHit', ({ roomId }) => {
    const room = rooms.get(`casino_${roomId}`);
    if (!room || room.currentTurn !== socket.id) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isStanding || player.isBusted) return;

    const card = room.deck.pop();
    
    // Handle split hands
    if (player.splitHands && player.splitHands.length > 0) {
      const currentSplit = player.splitHands[player.currentSplitIndex];
      currentSplit.hand.push(card);
      currentSplit.handValue = calculateBlackjackValue(currentSplit.hand);
      
      // Update main display
      player.hand = currentSplit.hand;
      player.handValue = currentSplit.handValue;

      if (currentSplit.handValue > 21) {
        currentSplit.isBusted = true;
        currentSplit.isStanding = true;
        
        // Move to next split hand or next player
        if (player.currentSplitIndex < player.splitHands.length - 1) {
          player.currentSplitIndex++;
          player.hand = player.splitHands[player.currentSplitIndex].hand;
          player.handValue = player.splitHands[player.currentSplitIndex].handValue;
        } else {
          player.isStanding = true;
          moveToNextPlayer(roomId);
        }
      }
    } else {
      // Normal hand (no splits)
      player.hand.push(card);
      player.handValue = calculateBlackjackValue(player.hand);

      if (player.handValue > 21) {
        player.isBusted = true;
        player.isStanding = true;
        moveToNextPlayer(roomId);
      }
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

    // Handle split hands
    if (player.splitHands && player.splitHands.length > 0) {
      const currentSplit = player.splitHands[player.currentSplitIndex];
      currentSplit.isStanding = true;
      
      // Move to next split hand or next player
      if (player.currentSplitIndex < player.splitHands.length - 1) {
        player.currentSplitIndex++;
        player.hand = player.splitHands[player.currentSplitIndex].hand;
        player.handValue = player.splitHands[player.currentSplitIndex].handValue;
      } else {
        player.isStanding = true;
        moveToNextPlayer(roomId);
      }
    } else {
      // Normal hand (no splits)
      player.isStanding = true;
      moveToNextPlayer(roomId);
    }
    
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

  socket.on('casinoSplit', ({ roomId }) => {
    const room = rooms.get(`casino_${roomId}`);
    if (!room || room.currentTurn !== socket.id) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.balance < player.currentBet) return;

    // Initialize split hands if first split
    if (!player.splitHands) {
      player.splitHands = [];
      player.currentSplitIndex = 0;
    }

    // Check if can split (max 4 hands, same card values)
    const currentHand = player.splitHands.length === 0 ? player.hand : player.splitHands[player.currentSplitIndex].hand;
    if (player.splitHands.length >= 3) return; // Already have 4 hands (original + 3 splits)
    if (currentHand.length !== 2) return;
    if (currentHand[0].value !== currentHand[1].value) return;

    // Deduct bet for new hand
    player.balance -= player.currentBet;

    // If first split, move original hand to splitHands
    if (player.splitHands.length === 0) {
      player.splitHands.push({
        hand: [currentHand[0]],
        handValue: currentHand[0].numValue,
        bet: player.currentBet,
        isStanding: false,
        isBusted: false
      });
      player.splitHands.push({
        hand: [currentHand[1]],
        handValue: currentHand[1].numValue,
        bet: player.currentBet,
        isStanding: false,
        isBusted: false
      });
      player.currentSplitIndex = 0;
    } else {
      // Splitting an already split hand
      const splitHand = player.splitHands[player.currentSplitIndex];
      const card1 = splitHand.hand[0];
      const card2 = splitHand.hand[1];
      
      // Replace current hand with first card
      splitHand.hand = [card1];
      splitHand.handValue = card1.numValue;
      
      // Insert new hand with second card after current
      player.splitHands.splice(player.currentSplitIndex + 1, 0, {
        hand: [card2],
        handValue: card2.numValue,
        bet: player.currentBet,
        isStanding: false,
        isBusted: false
      });
    }

    // Deal one card to current split hand
    const card = room.deck.pop();
    player.splitHands[player.currentSplitIndex].hand.push(card);
    player.splitHands[player.currentSplitIndex].handValue = calculateBlackjackValue(player.splitHands[player.currentSplitIndex].hand);

    // Update main hand display to show current split
    player.hand = player.splitHands[player.currentSplitIndex].hand;
    player.handValue = player.splitHands[player.currentSplitIndex].handValue;

    io.to(`casino_${roomId}`).emit('casinoSplit', {
      playerId: socket.id,
      splitHands: player.splitHands,
      currentSplitIndex: player.currentSplitIndex
    });

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
    
    // Auto-stand on blackjack (21 on initial deal)
    if (player.handValue === 21) {
      player.isStanding = true;
    }
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

function evaluatePerfectPairs(playerHand) {
  if (playerHand.length < 2) return { name: '', payout: 0 };
  
  const card1 = playerHand[0];
  const card2 = playerHand[1];
  
  // Perfect Pair - same rank and suit
  if (card1.value === card2.value && card1.suit === card2.suit) {
    return { name: 'Perfect Pair', payout: 25 };
  }
  
  // Colored Pair - same rank and color (both red or both black)
  const card1Red = card1.suit === '♥️' || card1.suit === '♦️';
  const card2Red = card2.suit === '♥️' || card2.suit === '♦️';
  if (card1.value === card2.value && card1Red === card2Red) {
    return { name: 'Colored Pair', payout: 12 };
  }
  
  // Mixed Pair - same rank, different colors
  if (card1.value === card2.value) {
    return { name: 'Mixed Pair', payout: 6 };
  }
  
  return { name: '', payout: 0 };
}

function evaluate21Plus3(playerHand, dealerUpCard) {
  if (playerHand.length < 2 || !dealerUpCard) return { name: '', payout: 0 };
  
  const cards = [playerHand[0], playerHand[1], dealerUpCard];
  const values = cards.map(c => c.value);
  const suits = cards.map(c => c.suit);
  
  // Suited Trips - all same rank and suit
  if (values[0] === values[1] && values[1] === values[2] && 
      suits[0] === suits[1] && suits[1] === suits[2]) {
    return { name: 'Suited Trips', payout: 100 };
  }
  
  // Straight Flush - consecutive ranks, same suit
  const allSameSuit = suits[0] === suits[1] && suits[1] === suits[2];
  const valueOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const indices = values.map(v => valueOrder.indexOf(v));
  const sortedIndices = [...indices].sort((a, b) => a - b);
  const isStraight = (sortedIndices[2] - sortedIndices[1] === 1 && sortedIndices[1] - sortedIndices[0] === 1) ||
                     (sortedIndices[0] === 0 && sortedIndices[1] === 11 && sortedIndices[2] === 12); // A-Q-K
  
  if (allSameSuit && isStraight) {
    return { name: 'Straight Flush', payout: 40 };
  }
  
  // Three of a Kind - all same rank
  if (values[0] === values[1] && values[1] === values[2]) {
    return { name: 'Three of a Kind', payout: 30 };
  }
  
  // Straight - consecutive ranks
  if (isStraight) {
    return { name: 'Straight', payout: 10 };
  }
  
  // Flush - all same suit
  if (allSameSuit) {
    return { name: 'Flush', payout: 5 };
  }
  
  return { name: '', payout: 0 };
}

function moveToNextPlayer(roomId) {
  const room = rooms.get(`casino_${roomId}`);
  if (!room) return;

  // Only consider players who have bet (exclude late joiners)
  const activePlayers = room.players.filter(p => p.currentBet > 0);
  let currentIndex = activePlayers.findIndex(p => p.id === room.currentTurn);
  let nextIndex = currentIndex - 1; // Move left (right to left order)
  
  // Skip players who are already standing (blackjack or manually stood)
  while (nextIndex >= 0 && activePlayers[nextIndex].isStanding) {
    nextIndex--;
  }
  
  if (nextIndex >= 0) {
    room.currentTurn = activePlayers[nextIndex].id;
    io.to(`casino_${roomId}`).emit('casinoTurnUpdate', { currentTurn: room.currentTurn });
  } else {
    // All players done, play dealer
    checkBlackjackRoundEnd(roomId);
  }
}

function checkBlackjackRoundEnd(roomId) {
  const room = rooms.get(`casino_${roomId}`);
  if (!room) return;

  // Only check active players (those who bet) - exclude late joiners
  const activePlayers = room.players.filter(p => p.currentBet > 0);
  const allDone = activePlayers.every(p => p.isStanding || p.isBusted);
  
  if (allDone) {
    // Play dealer's hand (hit until 17+)
    while (room.dealer.value < 17) {
      const card = room.deck.pop();
      room.dealer.hand.push(card);
      room.dealer.value = calculateBlackjackValue(room.dealer.hand);
    }

    // Determine winners and update balances (only for active players)
    const results = {};
    activePlayers.forEach(player => {
      const betAmount = player.currentBet;
      let winAmount = 0;
      let message = '';
      let mainHandWon = false;
      
      // Initialize side bet results
      const sideBetResults = {
        perfectPairs: null,
        twentyOnePlus3: null
      };
      
      // Evaluate side bets FIRST (they're independent of main hand)
      if (player.sideBets) {
        // Perfect Pairs
        if (player.sideBets.perfectPairs > 0) {
          const ppResult = evaluatePerfectPairs(player.hand);
          if (ppResult.payout > 0) {
            const ppWin = player.sideBets.perfectPairs * ppResult.payout + player.sideBets.perfectPairs;
            sideBetResults.perfectPairs = { 
              name: ppResult.name, 
              betAmount: player.sideBets.perfectPairs,
              win: ppWin, 
              lost: false 
            };
            player.balance += ppWin;
          } else {
            sideBetResults.perfectPairs = { 
              name: 'No Pair', 
              betAmount: player.sideBets.perfectPairs,
              win: 0, 
              lost: true 
            };
          }
        }
        
        // 21+3
        if (player.sideBets.twentyOnePlus3 > 0 && room.dealer.hand.length > 0) {
          const tp3Result = evaluate21Plus3(player.hand, room.dealer.hand[0]);
          if (tp3Result.payout > 0) {
            const tp3Win = player.sideBets.twentyOnePlus3 * tp3Result.payout + player.sideBets.twentyOnePlus3;
            sideBetResults.twentyOnePlus3 = { 
              name: tp3Result.name, 
              betAmount: player.sideBets.twentyOnePlus3,
              win: tp3Win, 
              lost: false 
            };
            player.balance += tp3Win;
          } else {
            sideBetResults.twentyOnePlus3 = { 
              name: 'No Hand', 
              betAmount: player.sideBets.twentyOnePlus3,
              win: 0, 
              lost: true 
            };
          }
        }
      }
      
      // Attach side bet results to player object for client
      player.sideBetResults = sideBetResults;
      
      console.log(`Player ${player.name} side bet results:`, JSON.stringify(sideBetResults));

      // Main hand results
      if (player.splitHands && player.splitHands.length > 0) {
        // Handle split hands - evaluate each separately
        let totalWinnings = 0;
        const handResults = [];
        
        player.splitHands.forEach((splitHand, index) => {
          let handWin = 0;
          let handMsg = '';
          
          if (splitHand.isBusted) {
            handMsg = `Hand ${index + 1}: Bust`;
          } else if (room.dealer.value > 21) {
            handMsg = `Hand ${index + 1}: Won ${splitHand.bet}`;
            handWin = splitHand.bet * 2;
          } else if (splitHand.handValue > room.dealer.value) {
            handMsg = `Hand ${index + 1}: Won ${splitHand.bet}`;
            handWin = splitHand.bet * 2;
          } else if (splitHand.handValue < room.dealer.value) {
            handMsg = `Hand ${index + 1}: Lost`;
          } else {
            handMsg = `Hand ${index + 1}: Push`;
            handWin = splitHand.bet;
          }
          
          totalWinnings += handWin;
          handResults.push(handMsg);
        });
        
        player.balance += totalWinnings;
        message = handResults.join(' | ');
        winAmount = totalWinnings;
        mainHandWon = totalWinnings > 0;
      } else {
        // Normal single hand
        if (player.isBusted) {
          message = `Main: Lost ${betAmount}`;
          winAmount = 0;
          mainHandWon = false;
        } else if (room.dealer.value > 21) {
          message = `Main: Won ${betAmount}`;
          winAmount = betAmount * 2;
          player.balance += winAmount;
          mainHandWon = true;
        } else if (player.handValue > room.dealer.value) {
          message = `Main: Won ${betAmount}`;
          winAmount = betAmount * 2;
          player.balance += winAmount;
          mainHandWon = true;
        } else if (player.handValue < room.dealer.value) {
          message = `Main: Lost ${betAmount}`;
          winAmount = 0;
          mainHandWon = false;
        } else {
          message = `Main: Push ${betAmount}`;
          winAmount = betAmount;
          player.balance += betAmount;
          mainHandWon = null; // Push is neither win nor loss
        }
      }

      results[player.id] = message;
      player.currentBet = 0;
    });

    // Kick players with 0 balance
    const brokePlayers = room.players.filter(p => p.balance <= 0);
    brokePlayers.forEach(player => {
      const playerSocket = io.sockets.sockets.get(player.id);
      if (playerSocket) {
        playerSocket.emit('casinoKicked', { reason: 'Insufficient balance' });
        playerSocket.leave(`casino_${roomId}`);
      }
    });
    
    // Remove broke players from room
    room.players = room.players.filter(p => p.balance > 0);
    
    // Check if room is now empty
    if (room.players.length === 0) {
      rooms.delete(`casino_${roomId}`);
      return;
    }

    room.state = 'results';
    
    console.log('Emitting casinoRoundEnd with players:', room.players.map(p => ({ 
      name: p.name, 
      sideBetResults: p.sideBetResults 
    })));
    
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