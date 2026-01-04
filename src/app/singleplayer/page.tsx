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

const CASE_LADDER = [1, 2, 3, 4, 5];

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
  const [timerPaused, setTimerPaused] = useState(false);
  const [loadingHint, setLoadingHint] = useState(false);
  const [loadingRemainingQuestions, setLoadingRemainingQuestions] = useState(false);

  // Load next 2 questions in background based on current progress
  const loadNextQuestions = useCallback(async () => {
    if (loadingRemainingQuestions || questions.length >= 10) return;
    
    setLoadingRemainingQuestions(true);
    
    try {
      const response = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ 
          progressive: true,
          categories: CATEGORIES,
          questionNumber: questions.length + 1,
          timestamp: Date.now()
        }),
      });
      
      const data = await response.json();
      
      if (data.questions && data.questions.length === 2) {
        setQuestions(prev => [...prev, ...data.questions]);
      }
    } catch (error) {
      console.error('Error loading next questions:', error);
    }
    
    setLoadingRemainingQuestions(false);
  }, [loadingRemainingQuestions, questions.length]);

  const handleAnswerReveal = useCallback(() => {
    setShowAnswer(true);
    const isCorrect = selectedAnswer === questions[currentQuestion]?.correctAnswer;
    
    if (!isCorrect) {
      // Wrong answer - lose everything
      setGameOver(true);
      setCasesWon(0);
      setTimeout(() => setGameState('results'), 2000);
    } else {
      // Trigger background loading of next 2 questions at appropriate times
      // Load after Q1 (index 0), Q3 (index 2), Q5 (index 4), Q7 (index 6)
      if (currentQuestion % 2 === 0 && questions.length < 10) {
        loadNextQuestions();
      }
      
      // Correct answer - show decision screen only every 2 questions
      const questionNum = currentQuestion + 1;
      if (questionNum % 2 === 0) {
        setTimeout(() => setGameState('decision'), 2000);
      } else {
        // Auto-continue on odd questions
        setTimeout(() => {
          setCurrentQuestion(currentQuestion + 1);
          setSelectedAnswer(null);
          setShowAnswer(false);
          setTimeLeft(30);
          setEliminatedOptions([]);
          setAiHint('');
          setGameState('playing');
        }, 2000);
      }
    }
  }, [selectedAnswer, questions, currentQuestion, loadNextQuestions]);

  // Timer countdown
  useEffect(() => {
    if (gameState === 'playing' && !showAnswer && !timerPaused && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !showAnswer) {
      handleAnswerReveal();
    }
  }, [timeLeft, showAnswer, gameState, timerPaused, handleAnswerReveal]);

  const startGame = async () => {
    setLoading(true);
    setQuestions([]);
    
    try {
      // Generate only first 4 questions initially for fast game start
      const response = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ 
          progressive: true,
          categories: CATEGORIES,
          questionNumber: 1,
          timestamp: Date.now()
        }),
      });
      
      const data = await response.json();
      
      if (!data.questions || data.questions.length !== 2) {
        throw new Error('Invalid questions received');
      }
      
      setQuestions(data.questions);
      setGameState('playing');
      // Start loading next 2 questions in background immediately
      setTimeout(() => loadNextQuestions(), 100);
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
      setGameState('setup');
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
      setTimerPaused(true);
      const correctAnswer = questions[currentQuestion].correctAnswer;
      const wrongOptions = [0, 1, 2, 3].filter(i => i !== correctAnswer);
      const toEliminate = wrongOptions.sort(() => Math.random() - 0.5).slice(0, 2);
      setEliminatedOptions(toEliminate);
      setFiftyFiftyLeft(fiftyFiftyLeft - 1);
      // Resume timer after 2 seconds
      setTimeout(() => setTimerPaused(false), 2000);
    }
  };

  const useAiHint = async () => {
    if (aiHintLeft > 0 && !showAnswer && !aiHint) {
      setTimerPaused(true);
      setLoadingHint(true);
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
      setLoadingHint(false);
      // Resume timer after hint loads
      setTimeout(() => setTimerPaused(false), 3000);
    }
  };

  const continueToNextQuestion = () => {
    // Award case since we're at a cashout milestone
    setCasesWon(casesWon + 1);
    
    // Check against total expected questions (10), not current array length
    if (currentQuestion + 1 < 10) {
      const nextQuestion = currentQuestion + 1;
      setCurrentQuestion(nextQuestion);
      setSelectedAnswer(null);
      setShowAnswer(false);
      setTimeLeft(30);
      setEliminatedOptions([]);
      setAiHint('');
      setTimerPaused(false);
      setGameState('playing');
      
      // Load next batch of 2 questions when starting questions 2, 4, 6, 8
      if (nextQuestion === 2 || nextQuestion === 4 || nextQuestion === 6 || nextQuestion === 8) {
        setTimeout(() => loadNextQuestions(), 100);
      }
    } else {
      // Won all 10 questions!
      setWonGame(true);
      setGameState('results');
    }
  };

  const cashOut = () => {
    // Award case for reaching this milestone, then cash out
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
          <p className="text-white/80 text-center mb-8 text-lg">Win up to 5 Fever Cases! Answer 10 questions, but one wrong answer and you lose everything...</p>
          
          <div className="bg-blue-500/20 border border-blue-400 rounded-xl p-6 mb-8">
            <h3 className="text-white font-bold text-xl mb-3">Game Rules:</h3>
            <ul className="text-white/90 space-y-2">
              <li>📊 10 questions total, progressively harder</li>
              <li>💼 Earn 1 case every 2 correct answers (5 cases total)</li>
              <li>🎲 Each question is from a random category</li>
              <li>⏱️ 30 seconds per question</li>
              <li>💡 Use 2 Fifty-Fifties and 1 AI Hint wisely!</li>
              <li>⚠️ One wrong answer = lose everything</li>
              <li>💰 Cash out at questions 2, 4, 6, 8, or 10!</li>
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
              {loading ? (
                <div>
                  <div>Generating Questions...</div>
                  <div className="text-sm">(may take up to 30 seconds)</div>
                </div>
              ) : 'Play for Cases!'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'playing' && questions.length > 0) {
    const question = questions[currentQuestion];
    
    return (
      <div className="min-h-screen flex items-center justify-center p-2 sm:p-4 overflow-x-hidden">
        <div className="max-w-6xl w-full px-2 sm:px-0">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-8">
            {/* Case Ladder */}
            <div className="md:col-span-1 col-span-1 space-y-2 md:space-y-2 flex md:flex-col flex-row md:justify-start justify-around overflow-x-auto md:overflow-x-visible">
              {[...CASE_LADDER].reverse().map((cases) => {
                const questionNum = cases * 2; // Each case = 2 questions
                const isCurrent = currentQuestion >= (cases - 1) * 2 && currentQuestion < cases * 2;
                const isPassed = currentQuestion >= cases * 2;
                
                return (
                  <div
                    key={cases}
                    className={`p-2 sm:p-3 rounded-xl text-center font-bold transition-all text-xs sm:text-base min-w-[60px] md:min-w-0 ${
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
            <div className="md:col-span-3 col-span-1">
              {/* Timer & Lifelines */}
              <div className="flex flex-wrap justify-between items-center mb-3 sm:mb-6 gap-2">
                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={useFiftyFifty}
                    disabled={fiftyFiftyLeft === 0 || showAnswer}
                    className={`px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-bold text-xs sm:text-base transition-all ${
                      fiftyFiftyLeft > 0 && !showAnswer
                        ? 'bg-blue-500 hover:bg-blue-600 text-white'
                        : 'bg-gray-500/30 text-gray-400'
                    }`}
                  >
                    50/50 ({fiftyFiftyLeft})
                  </button>
                  <button
                    onClick={useAiHint}
                    disabled={aiHintLeft === 0 || showAnswer || aiHint !== '' || loadingHint}
                    className={`px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-bold text-xs sm:text-base transition-all ${
                      aiHintLeft > 0 && !showAnswer && aiHint === '' && !loadingHint
                        ? 'bg-purple-500 hover:bg-purple-600 text-white'
                        : 'bg-gray-500/30 text-gray-400'
                    }`}
                  >
                    {loadingHint ? 'Loading...' : `🤖 Hint (${aiHintLeft})`}
                  </button>
                </div>
                <div className={`text-2xl sm:text-4xl font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
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
            You can earn Case {casesWon + 1} of 5!
          </p>

          <div className="bg-white/10 rounded-2xl p-6 mb-8">
            <p className="text-white text-xl text-center mb-4">
              You&apos;re on question {currentQuestion + 1} of {questions.length}
            </p>
            <p className="text-yellow-300 text-lg text-center">
              ⚠️ If you answer the next question wrong, you lose everything!
            </p>
            {currentQuestion + 1 < 10 && (
              <p className="text-green-300 text-lg text-center mt-2">
                ✨ Next cashout opportunity at question {currentQuestion + 3}!
              </p>
            )}
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
