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

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
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
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.io server running on port ${PORT}`);
});
