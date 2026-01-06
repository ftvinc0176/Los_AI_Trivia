'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

// Symbol types for Madame Destiny Megaways
type SymbolType = 'nine' | 'ten' | 'jack' | 'queen' | 'king' | 'ace' | 'owl' | 'cat' | 'candle' | 'book' | 'madame' | 'scatter';

interface Symbol {
  type: SymbolType;
  id: string;
  isWinning?: boolean;
  isNew?: boolean;
}

interface SymbolConfig {
  emoji: string;
  name: string;
  payouts: { [key: number]: number }; // count -> multiplier (for 6 of a kind down to 3)
  color: string;
}

// Payouts based on ways wins (3, 4, 5, 6 of a kind)
const SYMBOLS: Record<SymbolType, SymbolConfig> = {
  // Low paying - Card symbols
  nine: {
    emoji: '9️⃣',
    name: 'Nine',
    payouts: { 3: 0.1, 4: 0.2, 5: 0.5, 6: 1 },
    color: 'from-blue-400 to-blue-600'
  },
  ten: {
    emoji: '🔟',
    name: 'Ten',
    payouts: { 3: 0.1, 4: 0.2, 5: 0.5, 6: 1 },
    color: 'from-blue-500 to-blue-700'
  },
  jack: {
    emoji: '🃏',
    name: 'Jack',
    payouts: { 3: 0.15, 4: 0.3, 5: 0.75, 6: 1.5 },
    color: 'from-green-400 to-green-600'
  },
  queen: {
    emoji: '👸',
    name: 'Queen',
    payouts: { 3: 0.2, 4: 0.4, 5: 1, 6: 2 },
    color: 'from-pink-400 to-pink-600'
  },
  king: {
    emoji: '🤴',
    name: 'King',
    payouts: { 3: 0.25, 4: 0.5, 5: 1.25, 6: 2.5 },
    color: 'from-yellow-400 to-yellow-600'
  },
  ace: {
    emoji: '🅰️',
    name: 'Ace',
    payouts: { 3: 0.3, 4: 0.6, 5: 1.5, 6: 3 },
    color: 'from-red-400 to-red-600'
  },
  // High paying - Theme symbols
  owl: {
    emoji: '🦉',
    name: 'Owl',
    payouts: { 3: 0.5, 4: 1, 5: 2.5, 6: 5 },
    color: 'from-amber-500 to-amber-700'
  },
  cat: {
    emoji: '🐱',
    name: 'Black Cat',
    payouts: { 3: 0.75, 4: 1.5, 5: 4, 6: 7.5 },
    color: 'from-gray-600 to-gray-800'
  },
  candle: {
    emoji: '🕯️',
    name: 'Candle',
    payouts: { 3: 1, 4: 2, 5: 5, 6: 10 },
    color: 'from-orange-400 to-orange-600'
  },
  book: {
    emoji: '📕',
    name: 'Spell Book',
    payouts: { 3: 1.5, 4: 3, 5: 7.5, 6: 15 },
    color: 'from-purple-500 to-purple-700'
  },
  // Wild - Madame Destiny (2x multiplier)
  madame: {
    emoji: '🔮',
    name: 'Madame Destiny',
    payouts: { 3: 2, 4: 5, 5: 12.5, 6: 25 },
    color: 'from-violet-500 via-purple-500 to-indigo-600'
  },
  // Scatter - Crystal Ball
  scatter: {
    emoji: '🔴',
    name: 'Crystal Ball',
    payouts: { 3: 5, 4: 10, 5: 20, 6: 100 }, // Scatter pays
    color: 'from-red-500 via-pink-500 to-red-600'
  }
};

const REGULAR_SYMBOLS: SymbolType[] = ['nine', 'ten', 'jack', 'queen', 'king', 'ace', 'owl', 'cat', 'candle', 'book', 'madame'];
const REEL_MAX_ROWS = [7, 8, 8, 8, 8, 7]; // Max symbols per reel (Megaways style)

export default function MadameDestinyMegaways() {
  const router = useRouter();
  const { balance, setBalance, recordWin, checkAndReload } = useCasino();
  
  const [grid, setGrid] = useState<Symbol[][]>([]);
  const [reelSizes, setReelSizes] = useState<number[]>([4, 4, 4, 4, 4, 4]);
  const [betAmount, setBetAmount] = useState(20);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isTumbling, setIsTumbling] = useState(false);
  const [message, setMessage] = useState('Gaze into your destiny...');
  const [totalWin, setTotalWin] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [freeSpins, setFreeSpins] = useState(0);
  const [isFreeSpinMode, setIsFreeSpinMode] = useState(false);
  const [freeSpinMultiplier, setFreeSpinMultiplier] = useState(1);
  const [tumbleCount, setTumbleCount] = useState(0);
  const [showPaytable, setShowPaytable] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [anteBet, setAnteBet] = useState(false);
  const [showBonusWheel, setShowBonusWheel] = useState(false);
  const [bonusWheelSpinning, setBonusWheelSpinning] = useState(false);
  const [totalBonusWin, setTotalBonusWin] = useState(0);
  const [showHugeWin, setShowHugeWin] = useState(false);
  const [totalWays, setTotalWays] = useState(0);
  const [revealedReels, setRevealedReels] = useState<number>(6); // Track how many reels are revealed (6 = all shown)

  // Initialize grid
  useEffect(() => {
    initializeGrid();
  }, []);

  const initializeGrid = () => {
    const newReelSizes = REEL_MAX_ROWS.map(max => Math.floor(Math.random() * (max - 2)) + 2);
    setReelSizes(newReelSizes);
    
    const ways = newReelSizes.reduce((a, b) => a * b, 1);
    setTotalWays(ways);
    
    const newGrid: Symbol[][] = [];
    for (let col = 0; col < 6; col++) {
      const column: Symbol[] = [];
      for (let row = 0; row < newReelSizes[col]; row++) {
        column.push(generateRandomSymbol());
      }
      newGrid.push(column);
    }
    setGrid(newGrid);
  };

  const generateRandomSymbol = (): Symbol => {
    const rand = Math.random();
    
    // Scatter appears rarely
    if (rand < 0.015) {
      return { type: 'scatter', id: crypto.randomUUID() };
    }
    
    // Madame (wild) appears rarely
    if (rand < 0.03) {
      return { type: 'madame', id: crypto.randomUUID() };
    }
    
    // Weight towards lower paying symbols
    const weights = [20, 20, 18, 16, 14, 12, 6, 4, 3, 2]; // Regular symbols (no madame)
    const availableSymbols = REGULAR_SYMBOLS.filter(s => s !== 'madame');
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < availableSymbols.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return { type: availableSymbols[i], id: crypto.randomUUID() };
      }
    }
    
    return { type: 'nine', id: crypto.randomUUID() };
  };

  const getEffectiveBet = () => {
    return anteBet ? betAmount * 1.25 : betAmount;
  };

  const spin = useCallback(() => {
    if (isSpinning || isTumbling) return;
    
    const effectiveBet = getEffectiveBet();
    
    if (!isFreeSpinMode) {
      if (balance < effectiveBet) {
        setMessage('Insufficient balance!');
        return;
      }
      setBalance(balance - effectiveBet);
    } else {
      setFreeSpins(prev => prev - 1);
    }
    
    setIsSpinning(true);
    setTotalWin(0);
    setLastWin(0);
    setTumbleCount(0);
    setMessage(isFreeSpinMode ? `Free Spin! ${freeSpins - 1} remaining (${freeSpinMultiplier}x)` : 'The spirits reveal...');
    
    // Generate new reel sizes (Megaways mechanic)
    const newReelSizes = REEL_MAX_ROWS.map(max => Math.floor(Math.random() * (max - 2)) + 2);
    setReelSizes(newReelSizes);
    
    const ways = newReelSizes.reduce((a, b) => a * b, 1);
    setTotalWays(ways);
    
    // Generate new grid
    const newGrid: Symbol[][] = [];
    for (let col = 0; col < 6; col++) {
      const column: Symbol[] = [];
      for (let row = 0; row < newReelSizes[col]; row++) {
        column.push(generateRandomSymbol());
      }
      newGrid.push(column);
    }
    
    // Reset revealed reels and start sequential reveal
    setRevealedReels(0);
    setGrid(newGrid);
    
    // Reveal reels one at a time with 400ms delay
    const revealReel = (reelIndex: number) => {
      if (reelIndex <= 6) {
        setRevealedReels(reelIndex);
        if (reelIndex < 6) {
          setTimeout(() => revealReel(reelIndex + 1), 350);
        } else {
          // All reels revealed, check for wins
          setTimeout(() => {
            checkWins(newGrid, 0, 0);
          }, 300);
        }
      }
    };
    
    // Start revealing after initial spin animation
    setTimeout(() => {
      revealReel(1);
    }, 300);
  }, [isSpinning, isTumbling, balance, betAmount, isFreeSpinMode, freeSpins, freeSpinMultiplier, anteBet]);

  const checkWins = (currentGrid: Symbol[][], currentTumble: number, accumulatedWin: number) => {
    // Count scatters
    let scatterCount = 0;
    currentGrid.forEach(col => {
      col.forEach(symbol => {
        if (symbol.type === 'scatter') scatterCount++;
      });
    });
    
    // Scatter pays
    let scatterPay = 0;
    if (scatterCount >= 3) {
      scatterPay = SYMBOLS.scatter.payouts[Math.min(scatterCount, 6)] * betAmount;
    }
    
    // Check for free spins trigger (3+ scatters)
    if (scatterCount >= 3 && !isFreeSpinMode) {
      setMessage(`🔮 ${scatterCount} Crystal Balls! Bonus Wheel! 🔮`);
      setTimeout(() => {
        setShowBonusWheel(true);
      }, 1500);
    } else if (scatterCount >= 3 && isFreeSpinMode) {
      // Retrigger - add more spins
      setFreeSpins(prev => prev + 5);
      setMessage(`🔮 +5 Free Spins! 🔮`);
    }
    
    // Calculate ways wins
    const { totalPayout, winningPositions, hasWild } = calculateWaysWins(currentGrid);
    
    let spinWin = totalPayout * betAmount + scatterPay;
    
    // Apply free spin multiplier
    if (isFreeSpinMode && spinWin > 0) {
      spinWin *= freeSpinMultiplier;
    }
    
    // Apply wild 2x multiplier if wild was part of win
    if (hasWild && spinWin > 0) {
      spinWin *= 2;
    }
    
    if (spinWin > 0 || winningPositions.size > 0) {
      // Mark winning symbols
      const markedGrid = currentGrid.map((col, colIdx) =>
        col.map((symbol, rowIdx) => ({
          ...symbol,
          isWinning: winningPositions.has(`${colIdx}-${rowIdx}`)
        }))
      );
      setGrid(markedGrid);
      
      const newAccumulatedWin = accumulatedWin + spinWin;
      setTotalWin(newAccumulatedWin);
      
      const wildText = hasWild ? ' (2x Wild!)' : '';
      const multiplierText = isFreeSpinMode ? ` (${freeSpinMultiplier}x)` : '';
      setMessage(`Win! +$${spinWin.toFixed(2)}${wildText}${multiplierText}`);
      
      // Tumble
      setTimeout(() => {
        tumble(markedGrid, currentTumble + 1, newAccumulatedWin);
      }, 800);
    } else {
      // No wins - finalize
      finalizeRound(currentTumble, accumulatedWin);
    }
  };

  const calculateWaysWins = (currentGrid: Symbol[][]): { totalPayout: number; winningPositions: Set<string>; hasWild: boolean } => {
    let totalPayout = 0;
    const winningPositions = new Set<string>();
    let hasWild = false;
    
    // For each symbol type, check for ways wins
    REGULAR_SYMBOLS.forEach(symbolType => {
      const result = checkSymbolWays(currentGrid, symbolType);
      if (result.ways > 0) {
        const count = result.matchedReels;
        const config = SYMBOLS[symbolType];
        const payout = config.payouts[count] || 0;
        
        if (payout > 0) {
          // Ways payout = base payout * number of ways
          totalPayout += payout * result.ways;
          result.positions.forEach(pos => winningPositions.add(pos));
          if (result.hasWild) hasWild = true;
        }
      }
    });
    
    return { totalPayout, winningPositions, hasWild };
  };

  const checkSymbolWays = (currentGrid: Symbol[][], targetSymbol: SymbolType): { ways: number; matchedReels: number; positions: string[]; hasWild: boolean } => {
    // Check consecutive reels from left to right
    let waysPerReel: number[] = [];
    let positions: string[] = [];
    let hasWild = false;
    
    for (let col = 0; col < 6; col++) {
      let matchesInReel = 0;
      const reelPositions: string[] = [];
      
      for (let row = 0; row < currentGrid[col].length; row++) {
        const symbol = currentGrid[col][row];
        if (symbol.type === targetSymbol || (symbol.type === 'madame' && targetSymbol !== 'scatter')) {
          matchesInReel++;
          reelPositions.push(`${col}-${row}`);
          if (symbol.type === 'madame') hasWild = true;
        }
      }
      
      if (matchesInReel === 0) break; // Must be consecutive from left
      
      waysPerReel.push(matchesInReel);
      positions.push(...reelPositions);
    }
    
    if (waysPerReel.length < 3) {
      return { ways: 0, matchedReels: 0, positions: [], hasWild: false };
    }
    
    // Calculate total ways
    const ways = waysPerReel.reduce((a, b) => a * b, 1);
    
    return { ways, matchedReels: waysPerReel.length, positions, hasWild };
  };

  const tumble = (currentGrid: Symbol[][], tumbleNum: number, accumulatedWin: number) => {
    setIsTumbling(true);
    setTumbleCount(tumbleNum);
    
    // Remove winning symbols and let new ones fall
    const newGrid: Symbol[][] = [];
    
    for (let col = 0; col < 6; col++) {
      const remainingSymbols = currentGrid[col].filter(s => !s.isWinning);
      const newSymbolsNeeded = currentGrid[col].length - remainingSymbols.length;
      
      const newSymbols: Symbol[] = [];
      for (let i = 0; i < newSymbolsNeeded; i++) {
        const symbol = generateRandomSymbol();
        symbol.isNew = true;
        newSymbols.push(symbol);
      }
      
      // New symbols fall from top
      newGrid.push([...newSymbols, ...remainingSymbols.map(s => ({ ...s, isWinning: false }))]);
    }
    
    setTimeout(() => {
      // Clear isNew flag after animation
      const clearedGrid = newGrid.map(col => 
        col.map(s => ({ ...s, isNew: false }))
      );
      setGrid(clearedGrid);
      setIsTumbling(false);
      
      // Check for more wins
      setTimeout(() => {
        checkWins(clearedGrid, tumbleNum, accumulatedWin);
      }, 300);
    }, 400);
  };

  const finalizeRound = (tumbles: number, accumulatedWin: number) => {
    setTotalWin(accumulatedWin);
    setLastWin(accumulatedWin);
    
    if (accumulatedWin > 0) {
      setBalance(balance + accumulatedWin);
      recordWin(accumulatedWin);
      
      if (isFreeSpinMode) {
        setTotalBonusWin(prev => prev + accumulatedWin);
      }
      
      // Show huge win for 20x+
      if (accumulatedWin >= betAmount * 20) {
        setShowHugeWin(true);
        setTimeout(() => setShowHugeWin(false), 3000);
      }
      
      const tumbleText = tumbles > 1 ? ` (${tumbles} tumbles!)` : '';
      setMessage(`Total Win: $${accumulatedWin.toFixed(2)}${tumbleText}`);
    } else {
      setMessage(isFreeSpinMode ? 'No win this spin' : 'The spirits are silent...');
    }
    
    // Check if free spins ended
    if (isFreeSpinMode && freeSpins <= 1) {
      const bonusTotal = totalBonusWin + accumulatedWin;
      setTimeout(() => {
        setIsFreeSpinMode(false);
        setFreeSpinMultiplier(1);
        setMessage(`Free Spins Complete! Total Won: $${bonusTotal.toFixed(2)}`);
        setTotalBonusWin(0);
      }, 1500);
    }
    
    setIsSpinning(false);
    
    // Auto play
    if (autoPlay && !isFreeSpinMode && balance >= getEffectiveBet()) {
      setTimeout(() => {
        spin();
      }, 1500);
    }
    
    checkAndReload();
  };

  const spinBonusWheel = () => {
    setBonusWheelSpinning(true);
    
    // Determine free spins (5-12)
    const spinsOptions = [5, 6, 7, 8, 9, 10, 11, 12];
    const spins = spinsOptions[Math.floor(Math.random() * spinsOptions.length)];
    
    // Determine multiplier (2x-25x) with weights
    const multiplierOptions = [
      { value: 2, weight: 25 },
      { value: 3, weight: 20 },
      { value: 5, weight: 15 },
      { value: 7, weight: 12 },
      { value: 10, weight: 10 },
      { value: 15, weight: 8 },
      { value: 20, weight: 6 },
      { value: 25, weight: 4 }
    ];
    
    const totalWeight = multiplierOptions.reduce((sum, opt) => sum + opt.weight, 0);
    let rand = Math.random() * totalWeight;
    let selectedMultiplier = 2;
    
    for (const opt of multiplierOptions) {
      rand -= opt.weight;
      if (rand <= 0) {
        selectedMultiplier = opt.value;
        break;
      }
    }
    
    setTimeout(() => {
      setBonusWheelSpinning(false);
      setShowBonusWheel(false);
      setFreeSpins(spins);
      setFreeSpinMultiplier(selectedMultiplier);
      setIsFreeSpinMode(true);
      setTotalBonusWin(0);
      setMessage(`🎉 ${spins} Free Spins with ${selectedMultiplier}x Multiplier! 🎉`);
    }, 2000);
  };

  const buyBonus = () => {
    const cost = betAmount * 100;
    if (balance < cost) {
      setMessage(`Insufficient balance! Need $${cost.toFixed(2)}`);
      return;
    }
    if (isSpinning || isTumbling || isFreeSpinMode) return;
    
    setBalance(balance - cost);
    setMessage(`🔮 Bonus Bought for $${cost.toFixed(2)}!`);
    setShowBonusWheel(true);
  };

  const adjustBet = (amount: number) => {
    const newBet = Math.max(20, Math.min(500, betAmount + amount));
    setBetAmount(Math.round(newBet * 100) / 100);
  };

  const renderSymbol = (symbol: Symbol, colIdx: number, rowIdx: number, reelSize: number) => {
    const config = SYMBOLS[symbol.type];
    const size = reelSize > 5 ? 'w-10 h-10 text-xl' : reelSize > 4 ? 'w-12 h-12 text-2xl' : 'w-14 h-14 text-3xl';
    const isReelSpinning = isSpinning && colIdx >= revealedReels;
    
    return (
      <div
        key={symbol.id}
        className={`
          ${size}
          rounded-lg flex items-center justify-center
          bg-gradient-to-br ${config.color}
          border border-white/30
          transition-all duration-300
          ${symbol.isWinning ? 'animate-pulse scale-110 ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/50' : ''}
          ${symbol.isNew ? 'animate-bounce' : ''}
          ${isReelSpinning ? 'animate-spin opacity-50' : ''}
          ${symbol.type === 'madame' ? 'ring-2 ring-purple-400' : ''}
        `}
      >
        <span className="drop-shadow-lg">{isReelSpinning ? '❓' : config.emoji}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-violet-950 p-2 md:p-4">
      {/* Huge Win Popup */}
      {showHugeWin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 p-8 rounded-3xl border-4 border-white shadow-2xl animate-bounce">
            <div className="text-center">
              <div className="text-6xl mb-4">🔮✨🔮</div>
              <h2 className="text-4xl md:text-6xl font-black text-white drop-shadow-lg animate-pulse">
                HUGE WIN LIL BRO
              </h2>
              <div className="text-3xl md:text-5xl font-bold text-yellow-300 mt-4">
                ${lastWin.toFixed(2)}
              </div>
              <div className="text-xl text-white/80 mt-2">
                {(lastWin / betAmount).toFixed(1)}x your bet!
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bonus Wheel Modal */}
      {showBonusWheel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-gradient-to-br from-purple-800 to-indigo-900 p-8 rounded-3xl border-4 border-yellow-400 shadow-2xl">
            <h2 className="text-3xl font-bold text-white text-center mb-6">🔮 Bonus Wheel 🔮</h2>
            
            {bonusWheelSpinning ? (
              <div className="text-center">
                <div className="text-8xl animate-spin mb-4">🎡</div>
                <p className="text-white text-xl">The wheel of destiny spins...</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-white/80 mb-6">Spin to reveal your Free Spins and Multiplier!</p>
                <button
                  onClick={spinBonusWheel}
                  className="px-8 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold text-xl rounded-2xl transition-all transform hover:scale-105"
                >
                  🎡 SPIN THE WHEEL
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mystic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 text-6xl opacity-20 animate-pulse">🌙</div>
        <div className="absolute top-20 right-20 text-5xl opacity-20 animate-bounce">⭐</div>
        <div className="absolute bottom-20 left-20 text-7xl opacity-20 animate-pulse delay-100">🔮</div>
        <div className="absolute bottom-10 right-10 text-6xl opacity-20 animate-bounce delay-200">✨</div>
      </div>

      {/* Header */}
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => router.push('/casino')}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-all backdrop-blur-sm"
          >
            ← Casino
          </button>
          <h1 className="text-2xl md:text-4xl font-bold text-white drop-shadow-lg text-center">
            🔮 Madame Destiny Megaways 🔮
          </h1>
          <button
            onClick={() => setShowPaytable(!showPaytable)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-all backdrop-blur-sm"
          >
            {showPaytable ? 'Hide' : 'Paytable'}
          </button>
        </div>

        {/* Balance & Info Bar */}
        <div className="bg-black/40 backdrop-blur-lg rounded-2xl p-3 mb-4 border border-white/20">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="text-white">
              <span className="text-white/70">Balance:</span>
              <span className="text-2xl font-bold text-green-400 ml-2">${balance.toLocaleString()}</span>
            </div>
            
            <div className="bg-purple-500/30 px-4 py-2 rounded-xl">
              <span className="text-white font-bold">Ways: {totalWays.toLocaleString()}</span>
            </div>
            
            {isFreeSpinMode && (
              <div className="bg-gradient-to-r from-yellow-500 to-orange-500 px-4 py-2 rounded-xl animate-pulse">
                <span className="text-black font-bold">
                  🎁 FREE SPINS: {freeSpins} | {freeSpinMultiplier}x 🎁
                </span>
              </div>
            )}
            
            <div className="text-white">
              <span className="text-white/70">{isFreeSpinMode ? 'Bonus Total:' : 'Last Win:'}</span>
              <span className={`text-2xl font-bold ml-2 ${(isFreeSpinMode ? totalBonusWin : lastWin) > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                ${(isFreeSpinMode ? totalBonusWin + totalWin : lastWin).toFixed(2)}
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

        {/* Game Grid - Megaways Style */}
        <div className="bg-gradient-to-br from-indigo-800/40 to-purple-900/40 backdrop-blur-lg rounded-3xl p-4 mb-4 border-2 border-purple-400/30 shadow-2xl">
          <div className="flex justify-center gap-1 items-end">
            {grid.map((column, colIdx) => (
              <div key={colIdx} className="flex flex-col gap-1">
                {column.map((symbol, rowIdx) => (
                  <div key={`${colIdx}-${rowIdx}`}>
                    {renderSymbol(symbol, colIdx, rowIdx, column.length)}
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
                onClick={() => adjustBet(-20)}
                disabled={isSpinning || isTumbling || isFreeSpinMode}
                className="w-10 h-10 bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-full text-white font-bold text-xl transition-all"
              >
                -
              </button>
              <div className="bg-white/10 px-4 py-2 rounded-xl min-w-24 text-center">
                <div className="text-white/70 text-xs">BET</div>
                <div className="text-white font-bold text-lg">${betAmount.toFixed(2)}</div>
                {anteBet && <div className="text-yellow-400 text-xs">+25% Ante</div>}
              </div>
              <button
                onClick={() => adjustBet(20)}
                disabled={isSpinning || isTumbling || isFreeSpinMode}
                className="w-10 h-10 bg-green-500 hover:bg-green-600 disabled:opacity-50 rounded-full text-white font-bold text-xl transition-all"
              >
                +
              </button>
            </div>

            {/* Ante Bet Toggle */}
            <button
              onClick={() => setAnteBet(!anteBet)}
              disabled={isSpinning || isTumbling || isFreeSpinMode}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                anteBet ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white hover:bg-white/20'
              } disabled:opacity-50`}
              title="2x Free Spins chance for +25% bet"
            >
              {anteBet ? '⚡ Ante ON' : '⚡ Ante'}
            </button>

            {/* Spin Button */}
            <button
              onClick={spin}
              disabled={isSpinning || isTumbling || (!isFreeSpinMode && balance < getEffectiveBet())}
              className={`
                px-8 py-4 rounded-2xl font-bold text-xl transition-all transform hover:scale-105
                ${isFreeSpinMode 
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-500 animate-pulse' 
                  : 'bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700'}
                text-white shadow-lg disabled:opacity-50 disabled:transform-none
              `}
            >
              {isSpinning ? '🔮' : isTumbling ? '⬇️' : isFreeSpinMode ? `🎁 FREE (${freeSpins})` : '🔮 SPIN'}
            </button>

            {/* Auto Play Toggle */}
            <button
              onClick={() => setAutoPlay(!autoPlay)}
              disabled={isFreeSpinMode}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                autoPlay ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white hover:bg-white/20'
              } disabled:opacity-50`}
            >
              {autoPlay ? '⏹️ Stop' : '▶️ Auto'}
            </button>

            {/* Buy Bonus Button */}
            <button
              onClick={buyBonus}
              disabled={isSpinning || isTumbling || isFreeSpinMode || balance < betAmount * 100}
              className="px-4 py-2 rounded-xl font-bold transition-all bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black disabled:opacity-50"
              title={`Cost: $${(betAmount * 100).toFixed(2)}`}
            >
              🎁 Buy Bonus (100x)
            </button>
          </div>
        </div>

        {/* Paytable Modal */}
        {showPaytable && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-3xl p-6 max-w-4xl max-h-[90vh] overflow-y-auto border-4 border-purple-400/30">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-white">🔮 Paytable 🔮</h2>
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
                  <li>• <b>Megaways</b> - Up to 200,704 ways to win!</li>
                  <li>• Match symbols on <b>consecutive reels from left</b></li>
                  <li>• <b>Tumble Feature</b> - Wins disappear, new symbols fall</li>
                  <li>• <b>Madame Destiny 🔮</b> is Wild and <b>doubles all wins</b></li>
                  <li>• <b>3+ Crystal Balls 🔴</b> trigger Bonus Wheel</li>
                  <li>• Bonus Wheel awards <b>5-12 Free Spins</b> and <b>2x-25x Multiplier</b></li>
                  <li>• Free Spin multiplier is <b>fixed</b> for the entire bonus</li>
                </ul>
              </div>

              {/* Symbol Payouts */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[...REGULAR_SYMBOLS, 'scatter' as SymbolType].map(symbolType => {
                  const config = SYMBOLS[symbolType];
                  return (
                    <div key={symbolType} className={`bg-gradient-to-br ${config.color} rounded-xl p-3 border border-white/20`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-3xl">{config.emoji}</span>
                        <span className="text-white font-bold">{config.name}</span>
                      </div>
                      <div className="text-white/90 text-sm">
                        {Object.entries(config.payouts).map(([count, mult]) => (
                          <div key={count}>{count}x: {mult}x bet</div>
                        ))}
                      </div>
                      {symbolType === 'madame' && (
                        <div className="text-yellow-300 text-xs mt-1">Wild + 2x Multiplier!</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
