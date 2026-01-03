'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Question {
  question: string;
  options: string[];
  correctAnswer: number;
}

const CATEGORIES = [
  'General Knowledge',
  'Science & Nature',
  'History',
  'Geography',
  'Sports',
  'Entertainment',
  'Technology',
  'Art & Literature',
];

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

export default function SinglePlayer() {
  const router = useRouter();
  const [gameState, setGameState] = useState<'setup' | 'playing' | 'results'>('setup');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[1]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(10);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(false);

  // Timer countdown
  useEffect(() => {
    if (gameState === 'playing' && !showAnswer && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !showAnswer) {
      handleAnswerReveal();
    }
  }, [timeLeft, showAnswer, gameState]);

  const startGame = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, difficulty, count: 10 }),
      });
      
      const data = await response.json();
      setQuestions(data.questions);
      setGameState('playing');
      setCurrentQuestion(0);
      setScore(0);
      setTimeLeft(10);
    } catch (error) {
      console.error('Error generating questions:', error);
      alert('Failed to generate questions. Please try again.');
    }
    setLoading(false);
  };

  const handleAnswerSelect = (index: number) => {
    if (!showAnswer) {
      setSelectedAnswer(index);
    }
  };

  const handleAnswerReveal = () => {
    setShowAnswer(true);
    if (selectedAnswer === questions[currentQuestion].correctAnswer) {
      setScore(score + 1);
    }
    
    setTimeout(() => {
      if (currentQuestion + 1 < questions.length) {
        setCurrentQuestion(currentQuestion + 1);
        setSelectedAnswer(null);
        setShowAnswer(false);
        setTimeLeft(10);
      } else {
        setGameState('results');
      }
    }, 3000);
  };

  if (gameState === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-5xl font-bold text-white mb-8 text-center">Single Player</h1>
          
          <div className="space-y-6 mb-8">
            <div>
              <label className="block text-white text-lg mb-3 font-medium">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-4 rounded-xl bg-white/20 text-white border border-white/30 focus:outline-none focus:border-white/50 text-lg"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} className="bg-purple-900">
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-white text-lg mb-3 font-medium">Difficulty</label>
              <div className="grid grid-cols-3 gap-4">
                {DIFFICULTIES.map((diff) => (
                  <button
                    key={diff}
                    onClick={() => setDifficulty(diff)}
                    className={`p-4 rounded-xl font-medium text-lg transition-all ${
                      difficulty === diff
                        ? 'bg-white text-purple-700'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => router.push('/')}
              className="flex-1 px-8 py-4 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all text-lg font-medium"
            >
              Back
            </button>
            <button
              onClick={startGame}
              disabled={loading}
              className="flex-1 px-8 py-4 bg-white text-purple-700 rounded-xl hover:bg-purple-50 transition-all text-lg font-bold disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Start Game'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'playing' && questions.length > 0) {
    const question = questions[currentQuestion];
    
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-4xl w-full">
          {/* Progress & Timer */}
          <div className="flex justify-between items-center mb-8 text-white">
            <div className="text-2xl font-bold">
              Question {currentQuestion + 1} / {questions.length}
            </div>
            <div className="text-2xl font-bold">Score: {score}</div>
            <div className={`text-4xl font-bold ${timeLeft <= 3 ? 'text-red-300 animate-pulse' : ''}`}>
              {timeLeft}s
            </div>
          </div>

          {/* Question */}
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-12 mb-8 border border-white/20">
            <h2 className="text-3xl font-bold text-white text-center leading-relaxed">
              {question.question}
            </h2>
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-6">
            {question.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswerSelect(index)}
                disabled={showAnswer}
                className={`p-8 rounded-2xl text-xl font-medium transition-all ${
                  showAnswer
                    ? index === question.correctAnswer
                      ? 'bg-green-500 text-white'
                      : selectedAnswer === index
                      ? 'bg-red-500 text-white'
                      : 'bg-white/20 text-white/50'
                    : selectedAnswer === index
                    ? 'bg-white text-purple-700'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'results') {
    const percentage = (score / questions.length) * 100;
    
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20 text-center">
          <h1 className="text-6xl font-bold text-white mb-8">Game Over!</h1>
          <div className="text-8xl font-bold text-white mb-8">
            {score} / {questions.length}
          </div>
          <p className="text-3xl text-purple-100 mb-12">
            {percentage >= 80 ? '🏆 Excellent!' : percentage >= 60 ? '👍 Good Job!' : '💪 Keep Practicing!'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-12 py-4 bg-white text-purple-700 rounded-xl hover:bg-purple-50 transition-all text-xl font-bold"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return null;
}
