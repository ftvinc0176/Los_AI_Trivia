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

  expressApp.all('*', (req, res) => handler(req, res));

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
