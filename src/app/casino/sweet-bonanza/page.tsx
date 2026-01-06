'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

// Symbol types
type SymbolType = 'banana' | 'apple' | 'watermelon' | 'plum' | 'grapes' | 'heart' | 'purple' | 'green' | 'blue' | 'scatter' | 'bomb';

interface Symbol {
  type: SymbolType;
  id: string;
  isWinning?: boolean;
  isNew?: boolean;
  multiplier?: number;
}

interface SymbolConfig {
  emoji: string;
  name: string;
  payouts: { [key: number]: number }; // count -> multiplier
  color: string;
}

const SYMBOLS: Record<SymbolType, SymbolConfig> = {
  // Low paying - Fruits
  banana: {
    emoji: '🍌',
    name: 'Banana',
    payouts: { 8: 0.5, 10: 1, 12: 2 },
    color: 'from-yellow-400 to-yellow-600'
  },
  apple: {
    emoji: '🍎',
    name: 'Apple',
    payouts: { 8: 0.5, 10: 1, 12: 2 },
    color: 'from-red-400 to-red-600'
  },
  watermelon: {
    emoji: '🍉',
    name: 'Watermelon',
    payouts: { 8: 0.6, 10: 1.2, 12: 2.5 },
    color: 'from-green-400 to-red-500'
  },
  plum: {
    emoji: '🍇',
    name: 'Plum',
    payouts: { 8: 0.8, 10: 1.5, 12: 3 },
    color: 'from-purple-400 to-purple-600'
  },
  grapes: {
    emoji: '🫐',
    name: 'Grapes',
    payouts: { 8: 1, 10: 2, 12: 4 },
    color: 'from-blue-400 to-purple-600'
  },
  // High paying - Candies
  blue: {
    emoji: '💎',
    name: 'Blue Candy',
    payouts: { 8: 1.5, 10: 3, 12: 6 },
    color: 'from-cyan-400 to-blue-600'
  },
  green: {
    emoji: '💚',
    name: 'Green Candy',
    payouts: { 8: 2, 10: 4, 12: 8 },
    color: 'from-emerald-400 to-green-600'
  },
  purple: {
    emoji: '💜',
    name: 'Purple Candy',
    payouts: { 8: 3, 10: 6, 12: 12 },
    color: 'from-violet-400 to-purple-600'
  },
  heart: {
    emoji: '❤️',
    name: 'Red Heart',
    payouts: { 8: 5, 10: 10, 12: 25 },
    color: 'from-red-500 to-pink-600'
  },
  // Special
  scatter: {
    emoji: '🍭',
    name: 'Lollipop',
    payouts: {},
    color: 'from-pink-400 via-yellow-400 to-cyan-400'
  },
  bomb: {
    emoji: '🌈',
    name: 'Rainbow Bomb',
    payouts: {},
    color: 'from-red-500 via-yellow-500 via-green-500 to-blue-500'
  }
};

const REGULAR_SYMBOLS: SymbolType[] = ['banana', 'apple', 'watermelon', 'plum', 'grapes', 'blue', 'green', 'purple', 'heart'];
const BOMB_MULTIPLIERS = [2, 3, 5, 8, 10, 15, 20, 25, 50, 100];

export default function SweetBonanza() {
  const router = useRouter();
  const { balance, setBalance, recordWin, checkAndReload } = useCasino();
  
  const [grid, setGrid] = useState<Symbol[][]>([]);
  const [betAmount, setBetAmount] = useState(1);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isTumbling, setIsTumbling] = useState(false);
  const [message, setMessage] = useState('Place your bet and spin!');
  const [totalWin, setTotalWin] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [freeSpins, setFreeSpins] = useState(0);
  const [isFreeSpinMode, setIsFreeSpinMode] = useState(false);
  const [currentMultipliers, setCurrentMultipliers] = useState<number[]>([]);
  const [tumbleCount, setTumbleCount] = useState(0);
  const [showPaytable, setShowPaytable] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [spinHistory, setSpinHistory] = useState<{ win: number; bet: number }[]>([]);

  // Initialize grid
  useEffect(() => {
    initializeGrid();
  }, []);

  const initializeGrid = () => {
    const newGrid: Symbol[][] = [];
    for (let col = 0; col < 6; col++) {
      const column: Symbol[] = [];
      for (let row = 0; row < 5; row++) {
        column.push(generateRandomSymbol());
      }
      newGrid.push(column);
    }
    setGrid(newGrid);
  };

  const generateRandomSymbol = (includeBombs = false): Symbol => {
    // During free spins, bombs can appear
    const availableSymbols = [...REGULAR_SYMBOLS];
    
    // Scatter appears less frequently
    const rand = Math.random();
    if (rand < 0.02) {
      return { type: 'scatter', id: crypto.randomUUID() };
    }
    
    // Bombs only during free spins
    if (includeBombs && rand < 0.08) {
      const multiplier = BOMB_MULTIPLIERS[Math.floor(Math.random() * BOMB_MULTIPLIERS.length)];
      return { type: 'bomb', id: crypto.randomUUID(), multiplier };
    }
    
    // Weight towards lower paying symbols
    const weights = [20, 20, 18, 16, 14, 5, 4, 2, 1]; // Matches REGULAR_SYMBOLS order
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < availableSymbols.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return { type: availableSymbols[i], id: crypto.randomUUID() };
      }
    }
    
    return { type: 'banana', id: crypto.randomUUID() };
  };

  const spin = useCallback(() => {
    if (isSpinning || isTumbling) return;
    
    if (!isFreeSpinMode) {
      if (balance < betAmount) {
        setMessage('Insufficient balance!');
        return;
      }
      setBalance(balance - betAmount);
    } else {
      setFreeSpins(prev => prev - 1);
    }
    
    setIsSpinning(true);
    setTotalWin(0);
    setLastWin(0);
    setTumbleCount(0);
    setCurrentMultipliers([]);
    setMessage(isFreeSpinMode ? `Free Spin! ${freeSpins - 1} remaining` : 'Spinning...');
    
    // Animate spin
    setTimeout(() => {
      const newGrid: Symbol[][] = [];
      for (let col = 0; col < 6; col++) {
        const column: Symbol[] = [];
        for (let row = 0; row < 5; row++) {
          column.push(generateRandomSymbol(isFreeSpinMode));
        }
        newGrid.push(column);
      }
      setGrid(newGrid);
      
      // Check for wins after spin (start with empty multipliers and 0 accumulated win)
      // Keep isSpinning true until finalizeRound completes
      setTimeout(() => {
        checkWins(newGrid, 0, [], 0);
      }, 300);
    }, 500);
  }, [isSpinning, isTumbling, balance, betAmount, isFreeSpinMode, freeSpins, currentMultipliers]);

  const checkWins = (currentGrid: Symbol[][], currentTumble: number, multipliers: number[], accumulatedWin: number) => {
    // Flatten grid to count symbols
    const allSymbols = currentGrid.flat();
    const symbolCounts: Record<string, { count: number; positions: [number, number][] }> = {};
    
    // Count each symbol type
    allSymbols.forEach((symbol, idx) => {
      const col = Math.floor(idx / 5);
      const row = idx % 5;
      if (!symbolCounts[symbol.type]) {
        symbolCounts[symbol.type] = { count: 0, positions: [] };
      }
      symbolCounts[symbol.type].count++;
      symbolCounts[symbol.type].positions.push([col, row]);
    });
    
    // Check for scatters (free spins trigger)
    const scatterCount = symbolCounts['scatter']?.count || 0;
    if (scatterCount >= 4) {
      if (!isFreeSpinMode) {
        setMessage(`🍭 ${scatterCount} Scatters! 10 Free Spins Awarded! 🍭`);
        setTimeout(() => {
          setIsFreeSpinMode(true);
          setFreeSpins(10);
          setCurrentMultipliers([]);
        }, 1500);
      } else {
        // Retrigger during free spins
        setFreeSpins(prev => prev + 5);
        setMessage(`🍭 +5 Free Spins! Total: ${freeSpins + 5} 🍭`);
      }
    }
    
    // Collect bomb multipliers during free spins
    const bombCount = symbolCounts['bomb']?.count || 0;
    if (bombCount > 0 && isFreeSpinMode) {
      const newMultipliers: number[] = [];
      symbolCounts['bomb'].positions.forEach(([col, row]) => {
        const symbol = currentGrid[col][row];
        if (symbol.multiplier) {
          newMultipliers.push(symbol.multiplier);
        }
      });
      multipliers = [...multipliers, ...newMultipliers];
      setCurrentMultipliers(multipliers);
    }
    
    // Calculate wins (8+ matching symbols)
    let spinWin = 0;
    const winningPositions: Set<string> = new Set();
    
    REGULAR_SYMBOLS.forEach(symbolType => {
      const count = symbolCounts[symbolType]?.count || 0;
      const config = SYMBOLS[symbolType];
      
      // Check each payout threshold
      let payout = 0;
      if (count >= 12) payout = config.payouts[12] || 0;
      else if (count >= 10) payout = config.payouts[10] || 0;
      else if (count >= 8) payout = config.payouts[8] || 0;
      
      if (payout > 0) {
        spinWin += payout * betAmount;
        symbolCounts[symbolType].positions.forEach(([col, row]) => {
          winningPositions.add(`${col}-${row}`);
        });
      }
    });
    
    if (spinWin > 0) {
      // Apply multipliers during free spins
      let totalMultiplier = 1;
      if (isFreeSpinMode && multipliers.length > 0) {
        totalMultiplier = multipliers.reduce((a, b) => a + b, 0);
        spinWin *= totalMultiplier;
      }
      
      // Mark winning symbols
      const markedGrid = currentGrid.map((col, colIdx) =>
        col.map((symbol, rowIdx) => ({
          ...symbol,
          isWinning: winningPositions.has(`${colIdx}-${rowIdx}`)
        }))
      );
      setGrid(markedGrid);
      
      // Accumulate win for display but don't pay yet
      const newAccumulatedWin = accumulatedWin + spinWin;
      setTotalWin(newAccumulatedWin);
      
      const multiplierText = totalMultiplier > 1 ? ` (${totalMultiplier}x multiplier!)` : '';
      setMessage(`Tumble Win! +$${spinWin.toFixed(2)}${multiplierText}`);
      
      // Tumble - remove winning symbols and drop new ones
      setTimeout(() => {
        tumble(markedGrid, currentTumble + 1, multipliers, newAccumulatedWin);
      }, 800);
    } else {
      // No more wins - finalize with accumulated total
      finalizeRound(currentTumble, multipliers, accumulatedWin);
    }
  };

  const tumble = (currentGrid: Symbol[][], tumbleNum: number, multipliers: number[], accumulatedWin: number) => {
    setIsTumbling(true);
    setTumbleCount(tumbleNum);
    
    // Remove winning symbols and let new ones fall
    const newGrid: Symbol[][] = [];
    
    for (let col = 0; col < 6; col++) {
      const remainingSymbols = currentGrid[col].filter(s => !s.isWinning);
      const newSymbolsNeeded = 5 - remainingSymbols.length;
      
      const newSymbols: Symbol[] = [];
      for (let i = 0; i < newSymbolsNeeded; i++) {
        const symbol = generateRandomSymbol(isFreeSpinMode);
        symbol.isNew = true;
        newSymbols.push(symbol);
      }
      
      // New symbols fall from top
      newGrid.push([...newSymbols, ...remainingSymbols.map(s => ({ ...s, isWinning: false }))]);
    }
    
    setTimeout(() => {
      setGrid(newGrid);
      setIsTumbling(false);
      
      // Check for more wins
      setTimeout(() => {
        checkWins(newGrid, tumbleNum, multipliers, accumulatedWin);
      }, 300);
    }, 400);
  };

  const finalizeRound = (tumbles: number, multipliers: number[], accumulatedWin: number) => {
    // Pay out the total accumulated win from all tumbles
    if (accumulatedWin > 0) {
      setBalance(balance + accumulatedWin);
      recordWin(accumulatedWin);
      setSpinHistory(prev => [...prev.slice(-9), { win: accumulatedWin, bet: betAmount }]);
      
      const tumbleText = tumbles > 1 ? ` (${tumbles} tumbles!)` : '';
      setMessage(`Total Win: $${accumulatedWin.toFixed(2)}${tumbleText}`);
    } else {
      setMessage(isFreeSpinMode ? 'No win this spin' : 'No win - try again!');
    }
    
    // Check if free spins ended
    if (isFreeSpinMode && freeSpins <= 1) {
      setTimeout(() => {
        setIsFreeSpinMode(false);
        setCurrentMultipliers([]);
        setMessage(`Free Spins Complete! Total Won: $${accumulatedWin.toFixed(2)}`);
      }, 1500);
    }
    
    // Mark spin as complete
    setIsSpinning(false);
    
    // Auto play
    if (autoPlay && !isFreeSpinMode && balance >= betAmount) {
      setTimeout(() => {
        spin();
      }, 1500);
    }
    
    checkAndReload();
  };

  const adjustBet = (amount: number) => {
    const newBet = Math.max(0.20, Math.min(125, betAmount + amount));
    setBetAmount(Math.round(newBet * 100) / 100);
  };

  const renderSymbol = (symbol: Symbol, colIdx: number, rowIdx: number) => {
    const config = SYMBOLS[symbol.type];
    
    return (
      <div
        key={symbol.id}
        className={`
          w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20 
          rounded-xl flex items-center justify-center text-3xl md:text-4xl lg:text-5xl
          bg-gradient-to-br ${config.color}
          border-2 border-white/30
          transition-all duration-300
          ${symbol.isWinning ? 'animate-pulse scale-110 ring-4 ring-yellow-400 shadow-lg shadow-yellow-400/50' : ''}
          ${symbol.isNew ? 'animate-bounce' : ''}
          ${isSpinning ? 'animate-spin opacity-50' : ''}
        `}
      >
        <span className="drop-shadow-lg">
          {config.emoji}
          {symbol.type === 'bomb' && symbol.multiplier && (
            <span className="absolute -bottom-1 -right-1 bg-yellow-400 text-black text-xs font-bold px-1 rounded">
              {symbol.multiplier}x
            </span>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-500 via-purple-600 to-indigo-800 p-2 md:p-4">
      {/* Candy Background Decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 text-6xl opacity-20 animate-bounce">🍬</div>
        <div className="absolute top-20 right-20 text-5xl opacity-20 animate-pulse">🍭</div>
        <div className="absolute bottom-20 left-20 text-7xl opacity-20 animate-bounce delay-100">🧁</div>
        <div className="absolute bottom-10 right-10 text-6xl opacity-20 animate-pulse delay-200">🍩</div>
      </div>

      {/* Header */}
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => router.push('/casino')}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-all backdrop-blur-sm"
          >
            ← Casino
          </button>
          <h1 className="text-3xl md:text-5xl font-bold text-white drop-shadow-lg">
            🍭 Sweet Bonanza 🍭
          </h1>
          <button
            onClick={() => setShowPaytable(!showPaytable)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-all backdrop-blur-sm"
          >
            {showPaytable ? 'Hide' : 'Paytable'}
          </button>
        </div>

        {/* Balance & Info Bar */}
        <div className="bg-black/40 backdrop-blur-lg rounded-2xl p-4 mb-4 border border-white/20">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div className="text-white">
              <span className="text-white/70">Balance:</span>
              <span className="text-2xl font-bold ml-2 text-yellow-400">${balance.toLocaleString()}</span>
            </div>
            
            {isFreeSpinMode && (
              <div className="bg-gradient-to-r from-pink-500 to-yellow-500 px-4 py-2 rounded-xl animate-pulse">
                <span className="text-white font-bold">🎰 FREE SPINS: {freeSpins} 🎰</span>
              </div>
            )}
            
            {currentMultipliers.length > 0 && (
              <div className="bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2 rounded-xl">
                <span className="text-white font-bold">
                  🌈 Multipliers: {currentMultipliers.join('x + ')}x = {currentMultipliers.reduce((a, b) => a + b, 0)}x
                </span>
              </div>
            )}
            
            <div className="text-white">
              <span className="text-white/70">Last Win:</span>
              <span className={`text-2xl font-bold ml-2 ${lastWin > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                ${lastWin.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="text-center mb-4">
          <div className={`text-xl md:text-2xl font-bold text-white drop-shadow-lg transition-all ${
            lastWin > betAmount * 10 ? 'text-yellow-300 animate-pulse text-3xl' : ''
          }`}>
            {message}
          </div>
          {tumbleCount > 0 && (
            <div className="text-white/70 text-sm mt-1">Tumble #{tumbleCount}</div>
          )}
        </div>

        {/* Game Grid */}
        <div className="bg-gradient-to-br from-pink-300/30 to-purple-400/30 backdrop-blur-lg rounded-3xl p-4 md:p-6 mb-4 border-4 border-white/30 shadow-2xl">
          <div className="flex justify-center gap-1 md:gap-2">
            {grid.map((column, colIdx) => (
              <div key={colIdx} className="flex flex-col gap-1 md:gap-2">
                {column.map((symbol, rowIdx) => (
                  <div key={`${colIdx}-${rowIdx}`} className="relative">
                    {renderSymbol(symbol, colIdx, rowIdx)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="bg-black/40 backdrop-blur-lg rounded-2xl p-4 border border-white/20">
          <div className="flex flex-wrap justify-center items-center gap-4">
            {/* Bet Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => adjustBet(-1)}
                disabled={isSpinning || isTumbling || isFreeSpinMode}
                className="w-10 h-10 bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-full text-white font-bold text-xl transition-all"
              >
                -
              </button>
              <div className="bg-white/10 px-4 py-2 rounded-xl min-w-24 text-center">
                <div className="text-white/70 text-xs">BET</div>
                <div className="text-white font-bold text-lg">${betAmount.toFixed(2)}</div>
              </div>
              <button
                onClick={() => adjustBet(1)}
                disabled={isSpinning || isTumbling || isFreeSpinMode}
                className="w-10 h-10 bg-green-500 hover:bg-green-600 disabled:opacity-50 rounded-full text-white font-bold text-xl transition-all"
              >
                +
              </button>
            </div>

            {/* Quick Bet Buttons */}
            <div className="flex gap-2">
              {[1, 5, 10, 25].map(amount => (
                <button
                  key={amount}
                  onClick={() => setBetAmount(amount)}
                  disabled={isSpinning || isTumbling || isFreeSpinMode}
                  className={`px-3 py-2 rounded-lg font-bold transition-all ${
                    betAmount === amount
                      ? 'bg-yellow-500 text-black'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  } disabled:opacity-50`}
                >
                  ${amount}
                </button>
              ))}
            </div>

            {/* Spin Button */}
            <button
              onClick={spin}
              disabled={isSpinning || isTumbling || (!isFreeSpinMode && balance < betAmount)}
              className={`
                px-8 py-4 rounded-2xl font-bold text-xl transition-all transform hover:scale-105
                ${isFreeSpinMode 
                  ? 'bg-gradient-to-r from-pink-500 to-yellow-500 animate-pulse' 
                  : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'}
                text-white shadow-lg disabled:opacity-50 disabled:transform-none
              `}
            >
              {isSpinning ? '🎰' : isTumbling ? '⬇️' : isFreeSpinMode ? `🎁 FREE SPIN (${freeSpins})` : '🎰 SPIN'}
            </button>

            {/* Auto Play Toggle */}
            <button
              onClick={() => setAutoPlay(!autoPlay)}
              disabled={isFreeSpinMode}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                autoPlay ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white hover:bg-white/20'
              } disabled:opacity-50`}
            >
              {autoPlay ? '⏹️ Stop Auto' : '▶️ Auto'}
            </button>
          </div>
        </div>

        {/* Paytable Modal */}
        {showPaytable && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-purple-900 to-pink-900 rounded-3xl p-6 max-w-4xl max-h-[90vh] overflow-y-auto border-4 border-white/30">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-white">🍭 Paytable 🍭</h2>
                <button
                  onClick={() => setShowPaytable(false)}
                  className="text-white text-3xl hover:text-gray-300"
                >
                  ✕
                </button>
              </div>
              
              {/* Rules */}
              <div className="bg-white/10 rounded-xl p-4 mb-6">
                <h3 className="text-xl font-bold text-yellow-400 mb-2">How to Win</h3>
                <ul className="text-white/90 space-y-2">
                  <li>• <b>8+ matching symbols anywhere</b> on the grid pays!</li>
                  <li>• Winning symbols disappear and new ones <b>tumble</b> down</li>
                  <li>• Tumbles continue until no more wins</li>
                  <li>• <b>4+ Lollipops 🍭</b> trigger 10 Free Spins</li>
                  <li>• During Free Spins, <b>Rainbow Bombs 🌈</b> add multipliers</li>
                  <li>• All multipliers are summed and applied to wins!</li>
                </ul>
              </div>

              {/* Symbol Payouts */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[...REGULAR_SYMBOLS, 'scatter' as SymbolType].map(symbolType => {
                  const config = SYMBOLS[symbolType];
                  return (
                    <div key={symbolType} className="bg-white/10 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-3xl">{config.emoji}</span>
                        <span className="text-white font-bold">{config.name}</span>
                      </div>
                      {symbolType === 'scatter' ? (
                        <div className="text-white/80 text-sm">
                          4+ = 10 Free Spins<br/>
                          +3 scatters = +5 spins
                        </div>
                      ) : (
                        <div className="text-white/80 text-sm">
                          8+ = {config.payouts[8]}x<br/>
                          10+ = {config.payouts[10]}x<br/>
                          12+ = {config.payouts[12]}x
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {/* Rainbow Bomb */}
                <div className="bg-white/10 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-3xl">🌈</span>
                    <span className="text-white font-bold">Rainbow Bomb</span>
                  </div>
                  <div className="text-white/80 text-sm">
                    Free Spins only!<br/>
                    Random 2x-100x<br/>
                    All multipliers sum!
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-6 bg-white/10 rounded-xl p-4">
                <h3 className="text-xl font-bold text-yellow-400 mb-2">Game Info</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-white/90">
                  <div><b>RTP:</b> 96.51%</div>
                  <div><b>Volatility:</b> High</div>
                  <div><b>Max Win:</b> 21,000x</div>
                  <div><b>Grid:</b> 6x5</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
