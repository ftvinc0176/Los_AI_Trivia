const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');
const fetch = require('cross-fetch');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const rooms = new Map();

async function generateQuestions(category, difficulty) {
  try {
    const response = await fetch(`http://${hostname}:${port}/api/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, difficulty, count: 10 }),
    });
    const data = await response.json();
    return data.questions;
  } catch (error) {
    console.error('Error generating questions:', error);
    return [];
  }
}

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Draw Battle lobbies Map (outside connection callback so it persists)
  const drawBattleLobbies = new Map();
  
  // FPS Arena players Map
  const fpsPlayers = new Map();
  const fpsTeamCounts = { T: 0, CT: 0 };

  // Wavelength lobbies Map
  const wavelengthLobbies = new Map();
  const WAVELENGTH_CONCEPTS = [
    ['Hot', 'Cold'], ['Good', 'Bad'], ['Old', 'New'], ['Big', 'Small'],
    ['Fast', 'Slow'], ['Loud', 'Quiet'], ['Easy', 'Hard'], ['Cheap', 'Expensive'],
    ['Famous', 'Unknown'], ['Healthy', 'Unhealthy'], ['Beautiful', 'Ugly'],
    ['Dangerous', 'Safe'], ['Common', 'Rare'], ['Boring', 'Exciting'],
    ['Real', 'Fictional'], ['Ancient', 'Modern'], ['Natural', 'Artificial'],
    ['Light', 'Heavy'], ['Simple', 'Complex'], ['Formal', 'Casual'],
  ];

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

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
    });

    socket.on('updateSettings', ({ roomId, category, difficulty }) => {
      const room = rooms.get(roomId);
      if (!room || room.host !== socket.id) return;

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
    });

    socket.on('startGame', async ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room || room.host !== socket.id) return;

      const questions = await generateQuestions(room.category, room.difficulty);
      
      if (!questions || questions.length === 0) {
        socket.emit('error', { message: 'Failed to generate questions. Please try again.' });
        return;
      }
      
      room.questions = questions;
      room.started = true;
      room.currentQuestion = 0;
      room.answers = {};
      room.timeLeft = 10;
      room.showAnswer = false;

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
    });

    socket.on('submitAnswer', ({ roomId, answer }) => {
      const room = rooms.get(roomId);
      if (!room || room.showAnswer) return;

      room.answers[socket.id] = answer;

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

    socket.on('returnToLobby', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room || room.host !== socket.id) return;

      // Clear timer
      if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
      }

      // Reset scores
      room.players.forEach(player => {
        player.score = 0;
      });

      // Reset game state
      room.started = false;
      room.currentQuestion = 0;
      room.questions = [];
      room.answers = {};
      room.timeLeft = 10;
      room.showAnswer = false;

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
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      room.players = room.players.filter((p) => p.id !== socket.id);

      if (room.players.length === 0) {
        if (room.timer) clearInterval(room.timer);
        rooms.delete(roomId);
      } else {
        if (room.host === socket.id) {
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
    });
  });

  // ==================== WAVELENGTH SOCKET HANDLERS ====================
  
  io.on('connection', (socket) => {
    // Wavelength: Create Lobby
    socket.on('wavelength:createLobby', ({ playerName, isPrivate }) => {
      const lobbyId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const pair = WAVELENGTH_CONCEPTS[Math.floor(Math.random() * WAVELENGTH_CONCEPTS.length)];
      const randomSwap = Math.random() > 0.5;
      
      const lobby = {
        id: lobbyId,
        host: socket.id,
        players: [{
          id: socket.id,
          name: playerName,
          score: 0,
        }],
        isPrivate,
        phase: 'waiting', // waiting, psychic, guessing, reveal, results
        round: 1,
        maxRounds: 5,
        psychicId: socket.id,
        targetAngle: Math.floor(Math.random() * 160) + 10,
        needleAngle: 90,
        clue: '',
        leftConcept: randomSwap ? pair[1] : pair[0],
        rightConcept: randomSwap ? pair[0] : pair[1],
      };
      
      wavelengthLobbies.set(lobbyId, lobby);
      socket.join(`wavelength:${lobbyId}`);
      socket.wavelengthLobbyId = lobbyId;
      
      socket.emit('wavelength:lobbyUpdate', lobby);
      io.emit('wavelength:lobbiesUpdate', Array.from(wavelengthLobbies.values()).filter(l => !l.isPrivate && l.phase === 'waiting'));
    });
    
    // Wavelength: Get Public Lobbies
    socket.on('wavelength:getLobbies', () => {
      const publicLobbies = Array.from(wavelengthLobbies.values()).filter(l => !l.isPrivate && l.phase === 'waiting' && l.players.length < 2);
      socket.emit('wavelength:lobbiesUpdate', publicLobbies);
    });
    
    // Wavelength: Join Lobby
    socket.on('wavelength:joinLobby', ({ lobbyId, playerName }) => {
      const lobby = wavelengthLobbies.get(lobbyId);
      if (!lobby || lobby.players.length >= 2 || lobby.phase !== 'waiting') {
        socket.emit('wavelength:error', { message: 'Cannot join lobby' });
        return;
      }
      
      lobby.players.push({
        id: socket.id,
        name: playerName,
        score: 0,
      });
      
      socket.join(`wavelength:${lobbyId}`);
      socket.wavelengthLobbyId = lobbyId;
      
      io.to(`wavelength:${lobbyId}`).emit('wavelength:lobbyUpdate', lobby);
      io.emit('wavelength:lobbiesUpdate', Array.from(wavelengthLobbies.values()).filter(l => !l.isPrivate && l.phase === 'waiting' && l.players.length < 2));
    });
    
    // Wavelength: Start Game
    socket.on('wavelength:startGame', ({ lobbyId }) => {
      const lobby = wavelengthLobbies.get(lobbyId);
      if (!lobby || lobby.host !== socket.id || lobby.players.length < 2) return;
      
      // Set up first round
      const pair = WAVELENGTH_CONCEPTS[Math.floor(Math.random() * WAVELENGTH_CONCEPTS.length)];
      const randomSwap = Math.random() > 0.5;
      
      lobby.phase = 'psychic';
      lobby.round = 1;
      lobby.psychicId = lobby.players[0].id;
      lobby.targetAngle = Math.floor(Math.random() * 160) + 10;
      lobby.needleAngle = 90;
      lobby.clue = '';
      lobby.leftConcept = randomSwap ? pair[1] : pair[0];
      lobby.rightConcept = randomSwap ? pair[0] : pair[1];
      
      io.to(`wavelength:${lobbyId}`).emit('wavelength:lobbyUpdate', lobby);
    });
    
    // Wavelength: Submit Clue
    socket.on('wavelength:submitClue', ({ lobbyId, clue }) => {
      const lobby = wavelengthLobbies.get(lobbyId);
      if (!lobby || lobby.psychicId !== socket.id || lobby.phase !== 'psychic') return;
      
      lobby.clue = clue;
      lobby.phase = 'guessing';
      
      io.to(`wavelength:${lobbyId}`).emit('wavelength:lobbyUpdate', lobby);
    });
    
    // Wavelength: Update Needle
    socket.on('wavelength:updateNeedle', ({ lobbyId, angle }) => {
      const lobby = wavelengthLobbies.get(lobbyId);
      if (!lobby || lobby.phase !== 'guessing') return;
      // Only non-psychic can move needle
      if (socket.id === lobby.psychicId) return;
      
      lobby.needleAngle = angle;
      io.to(`wavelength:${lobbyId}`).emit('wavelength:needleUpdate', { angle });
    });
    
    // Wavelength: Lock In Guess
    socket.on('wavelength:lockGuess', ({ lobbyId }) => {
      const lobby = wavelengthLobbies.get(lobbyId);
      if (!lobby || lobby.phase !== 'guessing') return;
      
      // Calculate score
      const diff = Math.abs(lobby.needleAngle - lobby.targetAngle);
      let points = 0;
      if (diff <= 9) points = 4;
      else if (diff <= 18) points = 3;
      else if (diff <= 27) points = 2;
      
      // Add points to both players (team game)
      lobby.players.forEach(p => {
        p.score += points;
      });
      
      lobby.phase = 'reveal';
      lobby.lastPoints = points;
      
      io.to(`wavelength:${lobbyId}`).emit('wavelength:lobbyUpdate', lobby);
    });
    
    // Wavelength: Next Round
    socket.on('wavelength:nextRound', ({ lobbyId }) => {
      const lobby = wavelengthLobbies.get(lobbyId);
      if (!lobby || lobby.host !== socket.id) return;
      
      if (lobby.round >= lobby.maxRounds) {
        lobby.phase = 'results';
        io.to(`wavelength:${lobbyId}`).emit('wavelength:lobbyUpdate', lobby);
        return;
      }
      
      // New round - swap psychic
      const pair = WAVELENGTH_CONCEPTS[Math.floor(Math.random() * WAVELENGTH_CONCEPTS.length)];
      const randomSwap = Math.random() > 0.5;
      
      lobby.round++;
      lobby.phase = 'psychic';
      // Swap psychic between the two players
      const currentPsychicIndex = lobby.players.findIndex(p => p.id === lobby.psychicId);
      lobby.psychicId = lobby.players[(currentPsychicIndex + 1) % lobby.players.length].id;
      lobby.targetAngle = Math.floor(Math.random() * 160) + 10;
      lobby.needleAngle = 90;
      lobby.clue = '';
      lobby.leftConcept = randomSwap ? pair[1] : pair[0];
      lobby.rightConcept = randomSwap ? pair[0] : pair[1];
      
      io.to(`wavelength:${lobbyId}`).emit('wavelength:lobbyUpdate', lobby);
    });
    
    // Wavelength: Play Again
    socket.on('wavelength:playAgain', ({ lobbyId }) => {
      const lobby = wavelengthLobbies.get(lobbyId);
      if (!lobby || lobby.host !== socket.id) return;
      
      const pair = WAVELENGTH_CONCEPTS[Math.floor(Math.random() * WAVELENGTH_CONCEPTS.length)];
      const randomSwap = Math.random() > 0.5;
      
      // Reset scores and game
      lobby.players.forEach(p => p.score = 0);
      lobby.phase = 'psychic';
      lobby.round = 1;
      lobby.psychicId = lobby.players[0].id;
      lobby.targetAngle = Math.floor(Math.random() * 160) + 10;
      lobby.needleAngle = 90;
      lobby.clue = '';
      lobby.leftConcept = randomSwap ? pair[1] : pair[0];
      lobby.rightConcept = randomSwap ? pair[0] : pair[1];
      
      io.to(`wavelength:${lobbyId}`).emit('wavelength:lobbyUpdate', lobby);
    });
    
    // Wavelength: Leave Lobby
    socket.on('wavelength:leaveLobby', () => {
      const lobbyId = socket.wavelengthLobbyId;
      if (!lobbyId) return;
      
      const lobby = wavelengthLobbies.get(lobbyId);
      if (!lobby) return;
      
      lobby.players = lobby.players.filter(p => p.id !== socket.id);
      socket.leave(`wavelength:${lobbyId}`);
      socket.wavelengthLobbyId = null;
      
      if (lobby.players.length === 0) {
        wavelengthLobbies.delete(lobbyId);
      } else {
        if (lobby.host === socket.id) {
          lobby.host = lobby.players[0].id;
        }
        if (lobby.psychicId === socket.id) {
          lobby.psychicId = lobby.players[0].id;
        }
        // Return to waiting if game was in progress
        lobby.phase = 'waiting';
        io.to(`wavelength:${lobbyId}`).emit('wavelength:lobbyUpdate', lobby);
      }
      
      io.emit('wavelength:lobbiesUpdate', Array.from(wavelengthLobbies.values()).filter(l => !l.isPrivate && l.phase === 'waiting' && l.players.length < 2));
    });
    
    // Handle wavelength disconnect in main disconnect handler
    socket.on('disconnect', () => {
      const lobbyId = socket.wavelengthLobbyId;
      if (lobbyId) {
        const lobby = wavelengthLobbies.get(lobbyId);
        if (lobby) {
          lobby.players = lobby.players.filter(p => p.id !== socket.id);
          
          if (lobby.players.length === 0) {
            wavelengthLobbies.delete(lobbyId);
          } else {
            if (lobby.host === socket.id) {
              lobby.host = lobby.players[0].id;
            }
            if (lobby.psychicId === socket.id) {
              lobby.psychicId = lobby.players[0].id;
            }
            lobby.phase = 'waiting';
            io.to(`wavelength:${lobbyId}`).emit('wavelength:lobbyUpdate', lobby);
            io.to(`wavelength:${lobbyId}`).emit('wavelength:playerLeft', { playerId: socket.id });
          }
          
          io.emit('wavelength:lobbiesUpdate', Array.from(wavelengthLobbies.values()).filter(l => !l.isPrivate && l.phase === 'waiting' && l.players.length < 2));
        }
      }
    });
  });

  function startQuestionTimer(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.timer) clearInterval(room.timer);

    room.timer = setInterval(() => {
      room.timeLeft--;

      io.to(roomId).emit('questionUpdate', {
        currentQuestion: room.currentQuestion,
        timeLeft: room.timeLeft,
        showAnswer: room.showAnswer,
      });

      if (room.timeLeft <= 0) {
        clearInterval(room.timer);
        room.showAnswer = true;

        // Update scores
        const question = room.questions[room.currentQuestion];
        room.players.forEach((player) => {
          if (room.answers[player.id] === question.correctAnswer) {
            player.score++;
          }
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
          timeLeft: room.timeLeft,
          showAnswer: room.showAnswer,
        });

        // Move to next question after 3 seconds
        setTimeout(() => {
          if (!room || !room.questions) return;
          
          if (room.currentQuestion + 1 < room.questions.length) {
            room.currentQuestion++;
            room.answers = {};
            room.timeLeft = 10;
            room.showAnswer = false;

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
          } else {
            io.to(roomId).emit('gameEnd');
          }
        }, 3000);
      }
    }, 1000);
  }

  // Draw Battle Socket handlers
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
    const lobby = drawBattleLobbies.get(lobbyId);
    if (!lobby) return;

    const player = lobby.players.find(p => p.id === socket.id);
    if (player) {
      player.hasDrawn = true;
      lobby.drawings.push({
        playerId: socket.id,
        playerName: player.name,
        prompt,
        imageData,
        enhancedImage
      });

      io.to(lobbyId).emit('lobbyUpdate', lobby);

      // Check if all players have drawn
      if (lobby.players.every(p => p.hasDrawn)) {
        setTimeout(() => {
          io.to(lobbyId).emit('allDrawingsReady', lobby.drawings);
        }, 2000);
      }
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

  // ============================================
  // FPS ARENA HANDLERS
  // ============================================
  
  socket.on('fpsJoin', ({ name, team }) => {
    console.log(`FPS Player joined: ${name} on team ${team}, socket: ${socket.id}`);
    
    fpsPlayers.set(socket.id, {
      name,
      team,
      position: [0, 0, 0],
      rotation: 0,
    });
    
    // Update team counts
    if (team === 'T') {
      fpsTeamCounts.T++;
    } else if (team === 'CT') {
      fpsTeamCounts.CT++;
    }
    
    console.log('Updated team counts:', fpsTeamCounts);
    
    // Broadcast updated team counts to all players
    io.emit('fpsTeamCounts', fpsTeamCounts);
    
    // Send current players to new joiner
    const playersData = {};
    fpsPlayers.forEach((player, id) => {
      playersData[id] = player;
    });
    socket.emit('fpsPlayers', playersData);
    
    // Notify others
    socket.broadcast.emit('fpsPlayerJoined', { id: socket.id, player: fpsPlayers.get(socket.id) });
  });
  
  socket.on('fpsMove', ({ position, rotation }) => {
    const player = fpsPlayers.get(socket.id);
    if (player) {
      player.position = position;
      player.rotation = rotation;
    }
  });
  
  socket.on('fpsShoot', ({ position, direction, damage }) => {
    socket.broadcast.emit('fpsShot', {
      id: socket.id,
      position,
      direction,
      damage,
    });
  });
  
  socket.on('fpsHit', ({ victim, damage }) => {
    io.to(victim).emit('fpsHit', { damage, victim });
    socket.emit('fpsHit', { damage, victim });
  });
  
  socket.on('fpsPlantBomb', ({ position, site }) => {
    io.emit('fpsBombPlanted', { position, site });
  });
  
  socket.on('fpsDefuseBomb', () => {
    io.emit('fpsBombDefused');
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Handle FPS Arena disconnect
    const fpsPlayer = fpsPlayers.get(socket.id);
    if (fpsPlayer) {
      if (fpsPlayer.team === 'T') {
        fpsTeamCounts.T = Math.max(0, fpsTeamCounts.T - 1);
      } else if (fpsPlayer.team === 'CT') {
        fpsTeamCounts.CT = Math.max(0, fpsTeamCounts.CT - 1);
      }
      fpsPlayers.delete(socket.id);
      io.emit('fpsTeamCounts', fpsTeamCounts);
      socket.broadcast.emit('fpsPlayerLeft', { id: socket.id });
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
    
    // Handle regular room disconnect
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(roomId);
    } else if (room.host === socket.id) {
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
  });

  expressApp.all('*', (req, res) => handler(req, res));

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
