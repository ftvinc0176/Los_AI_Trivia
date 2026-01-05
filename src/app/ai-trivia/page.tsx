'use client';

import { useState } from 'react';
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
  'Custom',
];

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

export default function AITrivia() {
  const router = useRouter();
  const [gameStarted, setGameStarted] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('General Knowledge');
  const [selectedDifficulty, setSelectedDifficulty] = useState('Medium');
  const [customCategory, setCustomCategory] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);

  const startGame = async () => {
    setIsLoading(true);
    const category = selectedCategory === 'Custom' ? customCategory : selectedCategory;
    
    try {
      const response = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          difficulty: selectedDifficulty,
          count: 10,
        }),
      });

      const data = await response.json();
      setQuestions(data.questions);
      setGameStarted(true);
      setCurrentQuestion(0);
      setScore(0);
      setTimeLeft(10);
      startQuestionTimer();
    } catch (error) {
      console.error('Error generating questions:', error);
      alert('Failed to generate questions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const startQuestionTimer = () => {
    setTimeLeft(10);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleTimeUp = () => {
    setShowAnswer(true);
    setTimeout(() => {
      nextQuestion();
    }, 3000);
  };

  const handleAnswer = (answerIndex: number) => {
    if (showAnswer || selectedAnswer !== null) return;

    setSelectedAnswer(answerIndex);
    setShowAnswer(true);

    if (answerIndex === questions[currentQuestion].correctAnswer) {
      setScore(score + 1);
    }

    setTimeout(() => {
      nextQuestion();
    }, 3000);
  };

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedAnswer(null);
      setShowAnswer(false);
      startQuestionTimer();
    } else {
      setGameEnded(true);
    }
  };

  const restartGame = () => {
    setGameStarted(false);
    setGameEnded(false);
    setQuestions([]);
    setCurrentQuestion(0);
    setScore(0);
    setSelectedAnswer(null);
    setShowAnswer(false);
    setTimeLeft(10);
  };

  if (!gameStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="bg-black/50 backdrop-blur-xl rounded-3xl p-12 border border-white/10 max-w-2xl w-full">
          <button
            onClick={() => router.push('/')}
            className="mb-6 text-white/60 hover:text-white transition-colors"
          >
            ← Back to Home
          </button>

          <h1 className="text-5xl font-bold text-center mb-8 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            AI Trivia
          </h1>

          <div className="space-y-6">
            <div>
              <label className="block text-white text-lg mb-3 font-medium">Category</label>
              <div className="grid grid-cols-2 gap-3">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      if (cat !== 'Custom') setCustomCategory('');
                    }}
                    className={`p-4 rounded-xl font-medium transition-all ${
                      selectedCategory === cat
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {selectedCategory === 'Custom' && (
              <div>
                <label className="block text-white text-lg mb-3 font-medium">Custom Category</label>
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Enter custom category (e.g., Movies, Animals, 90s Pop Culture)"
                  className="w-full p-4 rounded-xl bg-white/20 text-white border border-white/30 focus:outline-none focus:border-white/50 text-lg placeholder-white/50"
                  maxLength={250}
                />
              </div>
            )}

            <div>
              <label className="block text-white text-lg mb-3 font-medium">Difficulty</label>
              <div className="grid grid-cols-3 gap-4">
                {DIFFICULTIES.map((diff) => (
                  <button
                    key={diff}
                    onClick={() => setSelectedDifficulty(diff)}
                    className={`p-4 rounded-xl font-medium transition-all ${
                      selectedDifficulty === diff
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={startGame}
              disabled={isLoading || (selectedCategory === 'Custom' && !customCategory.trim())}
              className="w-full py-5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-semibold text-xl hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Generating Questions...
                </div>
              ) : (
                'Start Game'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameEnded) {
    const percentage = Math.round((score / questions.length) * 100);
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="bg-black/50 backdrop-blur-xl rounded-3xl p-12 border border-white/10 max-w-2xl w-full text-center">
          <h1 className="text-5xl font-bold mb-8 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Game Complete!
          </h1>

          <div className="mb-8">
            <div className="text-7xl font-bold text-white mb-4">
              {score}/{questions.length}
            </div>
            <div className="text-3xl text-purple-200 mb-6">
              {percentage}% Correct
            </div>
            
            <div className="text-xl text-white/80">
              {percentage >= 80 ? '🏆 Excellent!' : percentage >= 60 ? '👍 Good job!' : percentage >= 40 ? '📚 Keep practicing!' : '💪 Try again!'}
            </div>
          </div>

          <div className="space-y-4">
            <button
              onClick={restartGame}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-semibold text-lg hover:from-purple-500 hover:to-pink-500 transition-all"
            >
              Play Again
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full py-4 bg-white/10 rounded-xl font-semibold text-lg hover:bg-white/20 transition-all"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const question = questions[currentQuestion];
  if (!question) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="bg-black/50 backdrop-blur-xl rounded-3xl p-12 border border-white/10 max-w-4xl w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="text-white text-xl">
            Question {currentQuestion + 1}/{questions.length}
          </div>
          <div className="text-white text-xl">
            Score: {score}
          </div>
          <div className={`text-2xl font-bold ${timeLeft <= 3 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
            ⏱️ {timeLeft}s
          </div>
        </div>

        {/* Question */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-6 text-center">
            {question.question}
          </h2>

          <div className="grid grid-cols-1 gap-4">
            {question.options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const isCorrect = index === question.correctAnswer;
              const showCorrect = showAnswer && isCorrect;
              const showWrong = showAnswer && isSelected && !isCorrect;

              return (
                <button
                  key={index}
                  onClick={() => handleAnswer(index)}
                  disabled={showAnswer}
                  className={`p-6 rounded-xl text-left text-lg font-medium transition-all ${
                    showCorrect
                      ? 'bg-green-500 text-white'
                      : showWrong
                      ? 'bg-red-500 text-white'
                      : isSelected
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  } ${showAnswer ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-white/10 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
