'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

interface GameResult {
  target: number;
  result: number;
  bet: number;
  profit: number;
  won: boolean;
  timestamp: number;
}

export default function LimboGame() {
  const router = useRouter();
  const { balance, setBalance, recordBet, checkAndReload } = useCasino();
  
  // Game state
  const [betAmount, setBetAmount] = useState(100);
  const [lastBet, setLastBet] = useState<number>(0);
  const [targetMultiplier, setTargetMultiplier] = useState(2);
  const [currentResult, setCurrentResult] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameHistory, setGameHistory] = useState<GameResult[]>([]);
  const [showWin, setShowWin] = useState(false);
  const [showLoss, setShowLoss] = useState(false);
  const [animatingNumber, setAnimatingNumber] = useState<number | null>(null);
  const animationRef = useRef<NodeJS.Timeout | null>(null);

  // Constants
  const MIN_MULTIPLIER = 1.01;
  const MAX_MULTIPLIER = 1000000;
  const HOUSE_EDGE = 0.01; // 1% house edge

  // Calculate win chance based on target
  const getWinChance = useCallback((target: number) => {
    return Math.min(99, (99 / target));
  }, []);

  // Calculate potential profit
  const getPotentialProfit = useCallback(() => {
    return (targetMultiplier - 1) * betAmount;
  }, [targetMultiplier, betAmount]);

  // Check for reload on balance change
  useEffect(() => {
    if (balance < 1000 && !isPlaying) {
      checkAndReload();
    }
  }, [balance, isPlaying, checkAndReload]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);

  // Generate a provably fair random result
  const generateResult = useCallback(() => {
    // Generate random result with house edge
    // The result distribution follows: result = 0.99 / random
    // Where random is between 0 and 1
    const random = Math.random() * (1 - HOUSE_EDGE);
    if (random === 0) return MAX_MULTIPLIER;
    
    const result = (1 - HOUSE_EDGE) / random;
    return Math.min(MAX_MULTIPLIER, Math.max(1.00, result));
  }, []);

  // Animate the result reveal
  const animateResult = useCallback(async (finalResult: number) => {
    const duration = 800;
    const steps = 20;
    const stepDuration = duration / steps;
    
    // Animate through random numbers
    for (let i = 0; i < steps; i++) {
      await new Promise(resolve => {
        animationRef.current = setTimeout(resolve, stepDuration);
      });
      
      // Generate random display numbers, gradually converging to result
      const progress = i / steps;
      const randomRange = (1 - progress) * 50 + 1;
      const displayNum = finalResult + (Math.random() - 0.5) * randomRange * (1 - progress);
      setAnimatingNumber(Math.max(1, displayNum));
    }
    
    // Show final result
    setAnimatingNumber(null);
    setCurrentResult(finalResult);
  }, []);

  // Play the game
  const play = useCallback(async () => {
    if (isPlaying || betAmount > balance || betAmount <= 0) return;

    setIsPlaying(true);
    setShowWin(false);
    setShowLoss(false);
    setCurrentResult(null);
    setLastBet(betAmount);

    // Deduct bet
    const newBalance = balance - betAmount;
    setBalance(newBalance);
    recordBet(betAmount);

    // Generate result
    const result = generateResult();

    // Animate the result
    await animateResult(result);

    // Determine win/loss
    const won = result >= targetMultiplier;
    let profit = 0;

    if (won) {
      profit = (targetMultiplier - 1) * betAmount;
      setBalance(newBalance + betAmount + profit);
      setShowWin(true);
    } else {
      profit = -betAmount;
      setShowLoss(true);
    }

    // Add to history
    setGameHistory(prev => [{
      target: targetMultiplier,
      result: result,
      bet: betAmount,
      profit: profit,
      won: won,
      timestamp: Date.now()
    }, ...prev].slice(0, 50));

    // Hide result after delay
    setTimeout(() => {
      setShowWin(false);
      setShowLoss(false);
    }, 2000);

    setIsPlaying(false);
  }, [isPlaying, betAmount, balance, setBalance, recordBet, generateResult, targetMultiplier, animateResult]);

  // Quick bet multipliers
  const quickMultipliers = [1.1, 1.5, 2, 3, 5, 10, 20, 50, 100];

  // All in / Rebet
  const rebet = useCallback(() => {
    if (lastBet > 0 && lastBet <= balance && !isPlaying) {
      setBetAmount(lastBet);
    }
  }, [lastBet, balance, isPlaying]);

  const allIn = useCallback(() => {
    if (!isPlaying) {
      setBetAmount(Math.floor(balance));
    }
  }, [balance, isPlaying]);

  // Get color based on multiplier
  const getMultiplierColor = (mult: number) => {
    if (mult >= 100) return 'text-purple-400';
    if (mult >= 10) return 'text-pink-400';
    if (mult >= 3) return 'text-yellow-400';
    if (mult >= 2) return 'text-green-400';
    return 'text-blue-400';
  };

  const displayNumber = animatingNumber ?? currentResult;

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-900 via-indigo-900/20 to-gray-900 text-white overflow-hidden">
      {/* Compact Header */}
      <div className="flex-shrink-0 bg-black/40 border-b border-indigo-500/20 px-2 py-1.5 sm:py-2 flex items-center justify-between">
        <button onClick={() => router.push('/casino')} className="text-gray-400 hover:text-white text-sm">
          ← Back
        </button>
        <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          ⚡ LIMBO ⚡
        </h1>
        <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 px-2 py-1 rounded-lg border border-yellow-500/30">
          <span className="text-yellow-400 font-bold text-sm">${balance.toLocaleString()}</span>
        </div>
      </div>

      {/* Main Area - No Scroll on Mobile */}
      <div className="flex-1 overflow-hidden p-2 sm:p-4">
        <div className="h-full max-w-5xl mx-auto flex flex-col lg:grid lg:grid-cols-3 gap-2 sm:gap-4">
          {/* Left Panel - Controls */}
          <div className="space-y-2 sm:space-y-3 order-2 lg:order-1">
            {/* Bet + Target Row on Mobile */}
            <div className="grid grid-cols-2 gap-2 lg:hidden">
              {/* Bet Amount Compact */}
              <div className="bg-gray-800/50 rounded-lg p-2 border border-gray-700/50">
                <label className="block text-xs text-gray-400 mb-1">Bet Amount</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => setBetAmount(Math.max(10, betAmount / 2))} disabled={isPlaying}
                    className="px-2 py-1 bg-gray-700 rounded text-sm hover:bg-gray-600 disabled:opacity-50">½</button>
                  <input type="number" value={betAmount}
                    onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                    disabled={isPlaying}
                    className="flex-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-center text-sm" />
                  <button onClick={() => setBetAmount(Math.min(balance, betAmount * 2))} disabled={isPlaying}
                    className="px-2 py-1 bg-gray-700 rounded text-sm hover:bg-gray-600 disabled:opacity-50">2×</button>
                </div>
              </div>
              {/* Target Multiplier Compact */}
              <div className="bg-gray-800/50 rounded-lg p-2 border border-gray-700/50">
                <label className="block text-xs text-gray-400 mb-1">Target Mult</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => setTargetMultiplier(Math.max(MIN_MULTIPLIER, targetMultiplier - 0.5))} disabled={isPlaying}
                    className="px-2 py-1 bg-gray-700 rounded text-sm hover:bg-gray-600 disabled:opacity-50">−</button>
                  <input type="number" step="0.01" value={targetMultiplier}
                    onChange={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val)) setTargetMultiplier(Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, val))); }}
                    disabled={isPlaying}
                    className="flex-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-center text-sm font-bold" />
                  <button onClick={() => setTargetMultiplier(Math.min(MAX_MULTIPLIER, targetMultiplier + 0.5))} disabled={isPlaying}
                    className="px-2 py-1 bg-gray-700 rounded text-sm hover:bg-gray-600 disabled:opacity-50">+</button>
                </div>
              </div>
            </div>

            {/* Quick Actions Row Mobile */}
            <div className="flex gap-2 lg:hidden">
              <button onClick={rebet} disabled={isPlaying || lastBet === 0}
                className="flex-1 px-2 py-2 bg-blue-600/50 rounded-lg hover:bg-blue-600 disabled:opacity-50 text-xs">
                Rebet ${lastBet}
              </button>
              <button onClick={allIn} disabled={isPlaying}
                className="flex-1 px-2 py-2 bg-red-600/50 rounded-lg hover:bg-red-600 disabled:opacity-50 text-xs">
                All In
              </button>
              <button onClick={play} disabled={isPlaying || betAmount > balance || betAmount <= 0}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                  !isPlaying && betAmount <= balance && betAmount > 0
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500'
                    : 'bg-gray-700 text-gray-500'
                }`}>
                ⚡ BET
              </button>
            </div>

            {/* Quick Multipliers Mobile */}
            <div className="grid grid-cols-5 gap-1 lg:hidden">
              {[1.5, 2, 3, 5, 10].map(mult => (
                <button key={mult} onClick={() => setTargetMultiplier(mult)} disabled={isPlaying}
                  className={`py-1.5 rounded text-xs font-semibold transition-all ${
                    targetMultiplier === mult ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                  }`}>
                  {mult}×
                </button>
              ))}
            </div>

            {/* Desktop Controls - Hidden on Mobile */}
            {/* Bet Amount */}
            <div className="hidden lg:block bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <label className="block text-sm text-gray-400 mb-2">Bet Amount</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBetAmount(Math.max(10, betAmount / 2))}
                  disabled={isPlaying}
                  className="px-3 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50"
                >
                  ½
                </button>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                  disabled={isPlaying}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-center"
                />
                <button
                  onClick={() => setBetAmount(Math.min(balance, betAmount * 2))}
                  disabled={isPlaying}
                  className="px-3 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50"
                >
                  2×
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={rebet}
                  disabled={isPlaying || lastBet === 0}
                  className="flex-1 px-3 py-2 bg-blue-600/50 rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm"
                >
                  Rebet (${lastBet})
                </button>
                <button
                  onClick={allIn}
                  disabled={isPlaying}
                  className="flex-1 px-3 py-2 bg-red-600/50 rounded-lg hover:bg-red-600 disabled:opacity-50 text-sm"
                >
                  All In
                </button>
              </div>
            </div>

            {/* Target Multiplier - Desktop */}
            <div className="hidden lg:block bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <label className="block text-sm text-gray-400 mb-2">Target Multiplier</label>
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setTargetMultiplier(Math.max(MIN_MULTIPLIER, targetMultiplier - 0.5))}
                  disabled={isPlaying}
                  className="px-3 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50"
                >
                  −
                </button>
                <input
                  type="number"
                  step="0.01"
                  value={targetMultiplier}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      setTargetMultiplier(Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, val)));
                    }
                  }}
                  disabled={isPlaying}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-center text-xl font-bold"
                />
                <button
                  onClick={() => setTargetMultiplier(Math.min(MAX_MULTIPLIER, targetMultiplier + 0.5))}
                  disabled={isPlaying}
                  className="px-3 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50"
                >
                  +
                </button>
              </div>
              
              {/* Quick multiplier buttons */}
              <div className="grid grid-cols-3 gap-1">
                {quickMultipliers.map(mult => (
                  <button
                    key={mult}
                    onClick={() => setTargetMultiplier(mult)}
                    disabled={isPlaying}
                    className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                      targetMultiplier === mult
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    {mult}×
                  </button>
                ))}
              </div>
            </div>

            {/* Stats - Desktop Only */}
            <div className="hidden lg:block bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Win Chance</span>
                <span className={`font-bold ${getWinChance(targetMultiplier) > 50 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {getWinChance(targetMultiplier).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Potential Profit</span>
                <span className="font-bold text-green-400">
                  +${getPotentialProfit().toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total Payout</span>
                <span className="font-bold text-white">
                  ${(betAmount * targetMultiplier).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Play Button - Desktop Only */}
            <button
              onClick={play}
              disabled={isPlaying || betAmount > balance || betAmount <= 0}
              className={`hidden lg:block w-full py-4 rounded-xl font-bold text-lg transition-all ${
                !isPlaying && betAmount <= balance && betAmount > 0
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg shadow-indigo-500/30'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isPlaying ? '⚡ Playing...' : '⚡ BET'}
            </button>
          </div>

          {/* Center - Main Game Display */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            {/* Result Display - Compact on mobile */}
            <div className={`relative bg-gray-800/50 rounded-xl sm:rounded-2xl p-3 sm:p-8 border transition-all duration-300 ${
              showWin ? 'border-green-500/50 shadow-lg shadow-green-500/20' :
              showLoss ? 'border-red-500/50 shadow-lg shadow-red-500/20' :
              'border-gray-700/50'
            }`}>
              {/* Background animation */}
              <div className={`absolute inset-0 rounded-2xl transition-opacity duration-300 ${
                showWin ? 'bg-gradient-to-br from-green-500/10 to-transparent opacity-100' :
                showLoss ? 'bg-gradient-to-br from-red-500/10 to-transparent opacity-100' :
                'opacity-0'
              }`} />

              <div className="relative text-center">
                {/* Target display */}
                <div className="mb-2 sm:mb-4">
                  <span className="text-gray-400 text-xs sm:text-sm">Target</span>
                  <div className={`text-xl sm:text-3xl font-bold ${getMultiplierColor(targetMultiplier)}`}>
                    {targetMultiplier.toFixed(2)}×
                  </div>
                </div>

                {/* Divider with vs */}
                <div className="flex items-center justify-center gap-2 sm:gap-4 mb-2 sm:mb-4">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent to-gray-600" />
                  <span className="text-gray-500 text-sm sm:text-lg font-bold">VS</span>
                  <div className="flex-1 h-px bg-gradient-to-l from-transparent to-gray-600" />
                </div>

                {/* Result display */}
                <div className="mb-2 sm:mb-6">
                  <span className="text-gray-400 text-xs sm:text-sm">Result</span>
                  <div className={`text-3xl sm:text-6xl font-bold transition-all duration-100 ${
                    displayNumber !== null 
                      ? (displayNumber >= targetMultiplier ? 'text-green-400' : 'text-red-400')
                      : 'text-gray-600'
                  } ${isPlaying ? 'animate-pulse' : ''}`}>
                    {displayNumber !== null 
                      ? displayNumber.toFixed(2) + '×' 
                      : '?.??×'}
                  </div>
                </div>

                {/* Win/Loss message */}
                {showWin && currentResult !== null && (
                  <div className="animate-bounce">
                    <div className="text-xl sm:text-3xl font-bold text-green-400 mb-1">
                      🎉 WIN! 🎉
                    </div>
                    <div className="text-sm sm:text-xl text-white">
                      +${((targetMultiplier - 1) * betAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                )}

                {showLoss && currentResult !== null && (
                  <div>
                    <div className="text-lg sm:text-2xl font-bold text-red-400">
                      Bust! {currentResult.toFixed(2)}× &lt; {targetMultiplier.toFixed(2)}×
                    </div>
                  </div>
                )}

                {!isPlaying && !showWin && !showLoss && currentResult === null && (
                  <div className="text-gray-500">
                    Set your target and bet!
                  </div>
                )}
              </div>
            </div>

            {/* Multiplier Scale Visual - Hidden on mobile */}
            <div className="hidden sm:block mt-4 bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-gray-400 text-sm">Multiplier Range</span>
              </div>
              <div className="relative h-8 bg-gray-900 rounded-lg overflow-hidden">
                {/* Gradient background */}
                <div className="absolute inset-0 bg-gradient-to-r from-green-500/30 via-yellow-500/30 to-red-500/30" />
                
                {/* Target marker */}
                <div 
                  className="absolute top-0 bottom-0 w-1 bg-white shadow-lg"
                  style={{ 
                    left: `${Math.min(95, Math.max(5, Math.log(targetMultiplier) / Math.log(100) * 100))}%` 
                  }}
                >
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-white whitespace-nowrap">
                    {targetMultiplier}×
                  </div>
                </div>

                {/* Result marker */}
                {currentResult && (
                  <div 
                    className={`absolute top-0 bottom-0 w-1 ${currentResult >= targetMultiplier ? 'bg-green-400' : 'bg-red-400'} shadow-lg transition-all duration-300`}
                    style={{ 
                      left: `${Math.min(95, Math.max(5, Math.log(currentResult) / Math.log(100) * 100))}%` 
                    }}
                  >
                    <div className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs ${currentResult >= targetMultiplier ? 'text-green-400' : 'text-red-400'} whitespace-nowrap`}>
                      {currentResult.toFixed(2)}×
                    </div>
                  </div>
                )}

                {/* Scale labels */}
                <div className="absolute inset-x-0 bottom-0 flex justify-between px-2 text-xs text-gray-500">
                  <span>1×</span>
                  <span>10×</span>
                  <span>100×</span>
                </div>
              </div>
            </div>

            {/* Game History - Hidden on mobile */}
            <div className="hidden sm:block mt-4 bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <h3 className="text-gray-400 text-sm mb-3">Recent Games</h3>
              {gameHistory.length === 0 ? (
                <div className="text-gray-600 text-center py-4">No games yet</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {gameHistory.slice(0, 20).map((game, i) => (
                    <div
                      key={game.timestamp}
                      className={`px-3 py-1 rounded-lg text-sm font-bold ${
                        game.won 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}
                      title={`Target: ${game.target}× | Result: ${game.result.toFixed(2)}× | ${game.won ? 'Won' : 'Lost'} $${Math.abs(game.profit).toFixed(2)}`}
                    >
                      {game.result.toFixed(2)}×
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Statistics - Hidden on mobile */}
            <div className="hidden sm:grid mt-3 sm:mt-4 grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="bg-gray-800/50 rounded-xl p-2 sm:p-3 text-center border border-gray-700/50">
                <div className="text-[10px] sm:text-xs text-gray-500">Games</div>
                <div className="text-lg sm:text-xl font-bold text-white">{gameHistory.length}</div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-2 sm:p-3 text-center border border-gray-700/50">
                <div className="text-[10px] sm:text-xs text-gray-500">Wins</div>
                <div className="text-lg sm:text-xl font-bold text-green-400">
                  {gameHistory.filter(g => g.won).length}
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-2 sm:p-3 text-center border border-gray-700/50">
                <div className="text-[10px] sm:text-xs text-gray-500">Win Rate</div>
                <div className="text-lg sm:text-xl font-bold text-yellow-400">
                  {gameHistory.length > 0 
                    ? ((gameHistory.filter(g => g.won).length / gameHistory.length) * 100).toFixed(1) 
                    : 0}%
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-2 sm:p-3 text-center border border-gray-700/50">
                <div className="text-[10px] sm:text-xs text-gray-500">Net Profit</div>
                <div className={`text-lg sm:text-xl font-bold ${
                  gameHistory.reduce((sum, g) => sum + g.profit, 0) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  ${gameHistory.reduce((sum, g) => sum + g.profit, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
