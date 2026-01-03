'use client';

import { useState, useEffect, useCallback } from 'react';
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

const CASE_LADDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function SinglePlayer() {
  const router = useRouter();
  const [gameState, setGameState] = useState<'setup' | 'playing' | 'decision' | 'results'>('setup');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[1]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [casesWon, setCasesWon] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fiftyFiftyLeft, setFiftyFiftyLeft] = useState(2);
  const [aiHintLeft, setAiHintLeft] = useState(1);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [aiHint, setAiHint] = useState<string>('');
  const [gameOver, setGameOver] = useState(false);
  const [wonGame, setWonGame] = useState(false);

  const handleAnswerReveal = useCallback(() => {
    setShowAnswer(true);
    const isCorrect = selectedAnswer === questions[currentQuestion]?.correctAnswer;
    
    if (!isCorrect) {
      // Wrong answer - lose everything
      setGameOver(true);
      setCasesWon(0);
      setTimeout(() => setGameState('results'), 2000);
    } else {
      // Correct answer - show decision screen
      setTimeout(() => setGameState('decision'), 2000);
    }
  }, [selectedAnswer, questions, currentQuestion]);

  // Timer countdown
  useEffect(() => {
    if (gameState === 'playing' && !showAnswer && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !showAnswer) {
      handleAnswerReveal();
    }
  }, [timeLeft, showAnswer, gameState, handleAnswerReveal]);

  const startGame = async () => {
    setLoading(true);
    setQuestions([]); // Clear old questions immediately
    
    try {
      // Generate all 10 questions in one API call with progressive difficulty
      // Add timestamp to prevent any caching
      const response = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store', // Prevent caching
        body: JSON.stringify({ 
          category: 'Mixed - use all categories',
          difficulty: 'Progressive',
          count: 10,
          progressive: true,
          categories: CATEGORIES,
          timestamp: Date.now() // Cache buster
        }),
      });
      
      const data = await response.json();
      
      // Ensure we got fresh questions
      if (!data.questions || data.questions.length !== 10) {
        throw new Error('Invalid questions received');
      }
      
      setQuestions(data.questions);
      setGameState('playing');
      setCurrentQuestion(0);
      setCasesWon(0);
      setTimeLeft(30);
      setFiftyFiftyLeft(2);
      setAiHintLeft(1);
      setEliminatedOptions([]);
      setAiHint('');
      setGameOver(false);
      setWonGame(false);
    } catch (error) {
      console.error('Error generating questions:', error);
      alert('Failed to generate questions. Please try again.');
      setGameState('setup'); // Return to setup on error
    }
    setLoading(false);
  };

  const handleAnswerSelect = (index: number) => {
    if (!showAnswer && !eliminatedOptions.includes(index)) {
      setSelectedAnswer(index);
    }
  };

  const useFiftyFifty = () => {
    if (fiftyFiftyLeft > 0 && !showAnswer) {
      const correctAnswer = questions[currentQuestion].correctAnswer;
      const wrongOptions = [0, 1, 2, 3].filter(i => i !== correctAnswer);
      const toEliminate = wrongOptions.sort(() => Math.random() - 0.5).slice(0, 2);
      setEliminatedOptions(toEliminate);
      setFiftyFiftyLeft(fiftyFiftyLeft - 1);
    }
  };

  const useAiHint = async () => {
    if (aiHintLeft > 0 && !showAnswer && !aiHint) {
      setLoading(true);
      try {
        const currentQ = questions[currentQuestion];
        const response = await fetch('/api/generate-hint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ 
            question: currentQ.question,
            options: currentQ.options,
            correctAnswer: currentQ.correctAnswer
          }),
        });
        
        const data = await response.json();
        
        if (data.hint) {
          setAiHint(data.hint);
        } else {
          setAiHint('Think carefully about the question and eliminate obviously wrong answers.');
        }
        setAiHintLeft(0);
      } catch (error) {
        console.error('Error getting hint:', error);
        setAiHint('Consider what you know about this topic and use logic to narrow down your choices.');
        setAiHintLeft(0);
      }
      setLoading(false);
    }
  };

  const continueToNextQuestion = () => {
    setCasesWon(casesWon + 1);
    
    if (currentQuestion + 1 < questions.length) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedAnswer(null);
      setShowAnswer(false);
      setTimeLeft(30);
      setEliminatedOptions([]);
      setAiHint('');
      setGameState('playing');
    } else {
      // Won all 10 questions!
      setWonGame(true);
      setGameState('results');
    }
  };

  const cashOut = () => {
    setCasesWon(casesWon + 1);
    setGameState('results');
  };

  if (gameState === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-5xl font-bold text-white mb-4 text-center bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            Who Wants to Be a Caseonaire? 💼
          </h1>
          <p className="text-white/80 text-center mb-8 text-lg">Win up to 10 Fever Cases! But one wrong answer and you lose everything...</p>
          
          <div className="bg-blue-500/20 border border-blue-400 rounded-xl p-6 mb-8">
            <h3 className="text-white font-bold text-xl mb-3">Game Rules:</h3>
            <ul className="text-white/90 space-y-2">
              <li>📊 Questions start at Medium and get progressively harder</li>
              <li>🎲 Each question is from a random category</li>
              <li>⏱️ 30 seconds per question</li>
              <li>💡 Use 2 Fifty-Fifties and 1 AI Hint wisely!</li>
              <li>⚠️ One wrong answer = lose everything</li>
              <li>💰 Cash out anytime or risk it for more cases!</li>
            </ul>
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
              className="flex-1 px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl hover:from-yellow-500 hover:to-orange-600 transition-all text-lg font-bold disabled:opacity-50"
            >
              {loading ? 'Generating Questions...' : 'Play for Cases!'}
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
        <div className="max-w-6xl w-full">
          <div className="grid grid-cols-4 gap-4 mb-8">
            {/* Case Ladder */}
            <div className="col-span-1 space-y-2">
              {[...CASE_LADDER].reverse().map((cases) => {
                const questionNum = cases - 1;
                const isCurrent = questionNum === currentQuestion;
                const isPassed = questionNum < currentQuestion;
                
                return (
                  <div
                    key={cases}
                    className={`p-3 rounded-xl text-center font-bold transition-all ${
                      isCurrent
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white scale-110'
                        : isPassed
                        ? 'bg-green-500/30 text-green-200'
                        : 'bg-white/10 text-white/50'
                    }`}
                  >
                    💼 {cases} {cases === 1 ? 'Case' : 'Cases'}
                  </div>
                );
              })}
            </div>

            {/* Main Game Area */}
            <div className="col-span-3">
              {/* Timer & Lifelines */}
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-3">
                  <button
                    onClick={useFiftyFifty}
                    disabled={fiftyFiftyLeft === 0 || showAnswer}
                    className={`px-6 py-3 rounded-xl font-bold transition-all ${
                      fiftyFiftyLeft > 0 && !showAnswer
                        ? 'bg-blue-500 hover:bg-blue-600 text-white'
                        : 'bg-gray-500/30 text-gray-400'
                    }`}
                  >
                    50/50 ({fiftyFiftyLeft})
                  </button>
                  <button
                    onClick={useAiHint}
                    disabled={aiHintLeft === 0 || showAnswer || aiHint !== ''}
                    className={`px-6 py-3 rounded-xl font-bold transition-all ${
                      aiHintLeft > 0 && !showAnswer && aiHint === ''
                        ? 'bg-purple-500 hover:bg-purple-600 text-white'
                        : 'bg-gray-500/30 text-gray-400'
                    }`}
                  >
                    🤖 AI Hint ({aiHintLeft})
                  </button>
                </div>
                <div className={`text-4xl font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
                  ⏱️ {timeLeft}s
                </div>
              </div>

              {/* AI Hint Display */}
              {aiHint && (
                <div className="bg-purple-500/20 border border-purple-400 rounded-xl p-4 mb-6">
                  <p className="text-purple-200 text-lg">💡 <span className="font-bold">AI Hint:</span> {aiHint}</p>
                </div>
              )}

              {/* Question */}
              <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 backdrop-blur-lg rounded-3xl p-8 mb-6 border-2 border-yellow-400/50">
                <h2 className="text-2xl font-bold text-white text-center leading-relaxed">
                  {question.question}
                </h2>
              </div>

              {/* Answers */}
              <div className="grid grid-cols-1 gap-4">
                {question.options.map((option, index) => {
                  const isSelected = selectedAnswer === index;
                  const isCorrect = index === question.correctAnswer;
                  const isEliminated = eliminatedOptions.includes(index);
                  
                  let buttonClass = 'bg-white/10 hover:bg-white/20 text-white border-white/30';
                  
                  if (isEliminated) {
                    buttonClass = 'bg-gray-800/50 text-gray-600 border-gray-700 opacity-40';
                  } else if (showAnswer) {
                    if (isCorrect) {
                      buttonClass = 'bg-green-500 text-white border-green-400';
                    } else if (isSelected) {
                      buttonClass = 'bg-red-500 text-white border-red-400';
                    }
                  } else if (isSelected) {
                    buttonClass = 'bg-yellow-400 text-black border-yellow-300';
                  }

                  const labels = ['A', 'B', 'C', 'D'];

                  return (
                    <button
                      key={index}
                      onClick={() => handleAnswerSelect(index)}
                      disabled={showAnswer || isEliminated}
                      className={`p-6 rounded-2xl border-2 transition-all text-left font-medium text-lg flex items-center gap-4 ${buttonClass} ${
                        !showAnswer && !isEliminated ? 'hover:scale-105' : ''
                      }`}
                    >
                      <span className="font-bold text-xl">{labels[index]}:</span>
                      <span className={isEliminated ? 'line-through' : ''}>{option}</span>
                      {showAnswer && isCorrect && <span className="ml-auto text-2xl">✓</span>}
                      {showAnswer && isSelected && !isCorrect && <span className="ml-auto text-2xl">✗</span>}
                    </button>
                  );
                })}
              </div>

              {/* Submit Button */}
              {!showAnswer && selectedAnswer !== null && (
                <button
                  onClick={handleAnswerReveal}
                  className="w-full mt-6 px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl hover:from-yellow-500 hover:to-orange-600 transition-all text-xl font-bold"
                >
                  Lock in Answer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Decision Screen - Cash Out or Continue
  if (gameState === 'decision') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-gradient-to-r from-green-900/40 to-blue-900/40 backdrop-blur-lg rounded-3xl p-12 border-2 border-green-400">
          <h1 className="text-5xl font-bold text-white mb-6 text-center">
            Correct! 🎉
          </h1>
          <p className="text-3xl text-green-300 text-center mb-8">
            You&apos;ve won {casesWon + 1} {casesWon + 1 === 1 ? 'Case' : 'Cases'} so far!
          </p>

          <div className="bg-white/10 rounded-2xl p-6 mb-8">
            <p className="text-white text-xl text-center mb-4">
              You&apos;re on question {currentQuestion + 1} of {questions.length}
            </p>
            <p className="text-yellow-300 text-lg text-center">
              ⚠️ If you answer the next question wrong, you lose everything!
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={cashOut}
              className="px-8 py-6 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-all text-2xl font-bold"
            >
              💼 Cash Out<br/>
              <span className="text-lg">Take {casesWon + 1} {casesWon + 1 === 1 ? 'Case' : 'Cases'}</span>
            </button>
            <button
              onClick={continueToNextQuestion}
              className="px-8 py-6 bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white rounded-xl transition-all text-2xl font-bold"
            >
              🎲 Continue<br/>
              <span className="text-lg">Risk it all!</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Results Screen
  if (gameState === 'results') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          {wonGame ? (
            <>
              <h1 className="text-6xl font-bold text-center mb-6 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                CASEONAIRE! 🏆
              </h1>
              <p className="text-4xl text-white text-center mb-8">
                You won all {casesWon} Fever Cases!
              </p>
              <div className="text-center text-6xl mb-8">
                💼💼💼💼💼💼💼💼💼💼
              </div>
            </>
          ) : gameOver ? (
            <>
              <h1 className="text-6xl font-bold text-center mb-6 text-red-400">
                Game Over 😢
              </h1>
              <p className="text-3xl text-white text-center mb-8">
                You lost everything and walk away with 0 cases
              </p>
              <p className="text-xl text-white/70 text-center mb-8">
                You made it to question {currentQuestion + 1} but got it wrong
              </p>
            </>
          ) : (
            <>
              <h1 className="text-6xl font-bold text-center mb-6 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
                Cashed Out! 💰
              </h1>
              <p className="text-4xl text-white text-center mb-8">
                You won {casesWon} Fever {casesWon === 1 ? 'Case' : 'Cases'}!
              </p>
              <div className="text-center text-5xl mb-8">
                {'💼'.repeat(casesWon)}
              </div>
            </>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => {
                setGameState('setup');
                setQuestions([]);
                setCasesWon(0);
                setCurrentQuestion(0);
                setSelectedAnswer(null);
                setShowAnswer(false);
                setTimeLeft(30);
                setFiftyFiftyLeft(2);
                setAiHintLeft(1);
                setEliminatedOptions([]);
                setAiHint('');
                setGameOver(false);
                setWonGame(false);
              }}
              className="flex-1 px-8 py-4 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all text-lg font-bold"
            >
              Play Again
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl hover:from-yellow-500 hover:to-orange-600 transition-all text-lg font-bold"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
