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
  const { balance, setBalance, recordBet, checkAndReload } = useCasino();
  
  const [grid, setGrid] = useState<Symbol[][]>([]);
  const [reelSizes, setReelSizes] = useState<number[]>([4, 4, 4, 4, 4, 4]);
  const [betAmount, setBetAmount] = useState(500);
  const [lastBet, setLastBet] = useState(500);
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
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelResult, setWheelResult] = useState<{ spins: number; multiplier: number } | null>(null);
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
      recordBet(effectiveBet); // Track wager for leaderboard
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
    
    // Reveal reels one at a time with 500ms delay
    const revealReel = (reelIndex: number) => {
      if (reelIndex <= 6) {
        setRevealedReels(reelIndex);
        if (reelIndex < 6) {
          setTimeout(() => revealReel(reelIndex + 1), 500);
        } else {
          // All reels revealed, check for wins
          setTimeout(() => {
            checkWins(newGrid, 0, 0);
          }, 400);
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
    
    // totalPayout is a multiplier representing total return (bet + profit)
    // Since bet is already deducted, we only add the profit portion
    let spinWin = (totalPayout - 1) * betAmount + scatterPay;
    
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
      // accumulatedWin is the total payout which includes the original bet
      // Add it back since bet was already deducted
      setBalance(balance + accumulatedWin);
      
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

  // Wheel segments - each has spins + multiplier combo
  const wheelSegments = [
    { spins: 5, multiplier: 2, color: '#e74c3c' },
    { spins: 8, multiplier: 3, color: '#9b59b6' },
    { spins: 6, multiplier: 5, color: '#3498db' },
    { spins: 10, multiplier: 2, color: '#e67e22' },
    { spins: 7, multiplier: 7, color: '#1abc9c' },
    { spins: 12, multiplier: 3, color: '#f39c12' },
    { spins: 8, multiplier: 10, color: '#2ecc71' },
    { spins: 5, multiplier: 15, color: '#e91e63' },
    { spins: 10, multiplier: 5, color: '#00bcd4' },
    { spins: 6, multiplier: 20, color: '#ff5722' },
    { spins: 12, multiplier: 10, color: '#673ab7' },
    { spins: 8, multiplier: 25, color: '#ffd700' },
  ];

  const spinBonusWheel = () => {
    if (bonusWheelSpinning) return;
    setBonusWheelSpinning(true);
    setWheelResult(null);
    
    // Pick random segment
    const selectedIndex = Math.floor(Math.random() * wheelSegments.length);
    const segment = wheelSegments[selectedIndex];
    
    // Calculate rotation: multiple full spins + land on selected segment
    // Each segment is 360/12 = 30 degrees
    // The pointer is at the top (0 degrees), so we need to rotate so the segment is at top
    const segmentAngle = 30; // 360 / 12 segments
    const segmentCenter = selectedIndex * segmentAngle + (segmentAngle / 2);
    // We want this segment to end up at the top (0 degrees)
    // So we rotate (360 - segmentCenter) to bring it to top, plus extra full rotations
    const fullRotations = 5 + Math.floor(Math.random() * 3); // 5-7 full spins
    const finalRotation = (fullRotations * 360) + (360 - segmentCenter);
    
    setWheelRotation(prev => prev + finalRotation);
    
    // After spin animation completes, show result and start bonus
    setTimeout(() => {
      setWheelResult(segment);
    }, 4000); // Wheel spin animation takes 4 seconds
    
    setTimeout(() => {
      setBonusWheelSpinning(false);
      setShowBonusWheel(false);
      setWheelRotation(0);
      setWheelResult(null);
      setFreeSpins(segment.spins);
      setFreeSpinMultiplier(segment.multiplier);
      setIsFreeSpinMode(true);
      setTotalBonusWin(0);
      setMessage(`🎉 ${segment.spins} Free Spins with ${segment.multiplier}x Multiplier! 🎉`);
    }, 6000); // Wait for result display then start
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

  const adjustBet = (direction: 'up' | 'down') => {
    const newBet = direction === 'up' ? betAmount * 2 : Math.max(1, betAmount / 2);
    setBetAmount(Math.round(newBet * 100) / 100);
  };

  const renderSymbol = (symbol: Symbol, colIdx: number, rowIdx: number, reelSize: number) => {
    const config = SYMBOLS[symbol.type];
    const size = reelSize > 5 ? 'w-10 h-10 text-xl' : reelSize > 4 ? 'w-12 h-12 text-2xl' : 'w-14 h-14 text-3xl';
    const isReelHidden = isSpinning && colIdx >= revealedReels;
    const isReelJustRevealed = isSpinning && colIdx === revealedReels - 1;
    
    // Hidden reel - empty placeholder
    if (isReelHidden) {
      return (
        <div
          key={symbol.id}
          className={`
            ${size}
            rounded-lg flex items-center justify-center
            bg-gray-800/50
            border border-white/10
          `}
        >
          <span className="text-white/20">•</span>
        </div>
      );
    }
    
    return (
      <div
        key={symbol.id}
        style={{
          animation: isReelJustRevealed ? `dropIn 0.6s ease-out` : undefined,
          animationDelay: isReelJustRevealed ? `${rowIdx * 80}ms` : undefined,
          animationFillMode: 'both'
        }}
        className={`
          ${size}
          rounded-lg flex items-center justify-center
          bg-gradient-to-br ${config.color}
          border border-white/30
          transition-all duration-300
          ${symbol.isWinning ? 'animate-pulse scale-110 ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/50' : ''}
          ${symbol.isNew ? 'animate-bounce' : ''}
          ${symbol.type === 'madame' ? 'ring-2 ring-purple-400' : ''}
        `}
      >
        <span className="drop-shadow-lg">{config.emoji}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-indigo-900 via-purple-900 to-violet-950 relative overflow-hidden">
      {/* Drop animation keyframes */}
      <style jsx>{`
        @keyframes dropIn {
          0% {
            transform: translateY(-120px);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          70% {
            transform: translateY(8px);
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      {/* Mystic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 text-4xl opacity-20 animate-pulse">🌙</div>
        <div className="absolute top-20 right-20 text-3xl opacity-20 animate-bounce">⭐</div>
        <div className="absolute bottom-20 left-20 text-5xl opacity-20 animate-pulse delay-100">🔮</div>
        <div className="absolute bottom-10 right-10 text-4xl opacity-20 animate-bounce delay-200">✨</div>
      </div>

      {/* Huge Win Popup */}
      {showHugeWin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 p-6 sm:p-8 rounded-3xl border-4 border-white shadow-2xl animate-bounce">
            <div className="text-center">
              <div className="text-4xl sm:text-6xl mb-2 sm:mb-4">🔮✨🔮</div>
              <h2 className="text-2xl sm:text-4xl md:text-6xl font-black text-white drop-shadow-lg animate-pulse">
                HUGE WIN LIL BRO
              </h2>
              <div className="text-xl sm:text-3xl md:text-5xl font-bold text-yellow-300 mt-2 sm:mt-4">
                ${lastWin.toFixed(2)}
              </div>
              <div className="text-sm sm:text-xl text-white/80 mt-1 sm:mt-2">
                {(lastWin / betAmount).toFixed(1)}x your bet!
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bonus Wheel Modal */}
      {showBonusWheel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="bg-gradient-to-br from-purple-900 to-indigo-950 p-4 sm:p-8 rounded-3xl border-4 border-yellow-400 shadow-2xl max-w-lg w-full">
            <h2 className="text-xl sm:text-3xl font-bold text-white text-center mb-4 sm:mb-6">🔮 Wheel of Destiny 🔮</h2>
            
            {/* The Wheel */}
            <div className="relative w-48 h-48 sm:w-80 sm:h-80 mx-auto mb-4 sm:mb-6">
              {/* Pointer at top */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-20">
                <div className="w-0 h-0 border-l-[10px] sm:border-l-[15px] border-r-[10px] sm:border-r-[15px] border-t-[18px] sm:border-t-[25px] border-l-transparent border-r-transparent border-t-yellow-400 drop-shadow-lg" />
              </div>
              
              {/* Spinning wheel */}
              <div 
                className="w-full h-full rounded-full border-4 sm:border-8 border-yellow-500 shadow-2xl overflow-hidden relative"
                style={{
                  transform: `rotate(${wheelRotation}deg)`,
                  transition: bonusWheelSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none'
                }}
              >
                {/* SVG Wheel */}
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  {wheelSegments.map((seg, i) => {
                    const angle = 360 / wheelSegments.length;
                    const startAngle = i * angle - 90;
                    const endAngle = startAngle + angle;
                    const startRad = (startAngle * Math.PI) / 180;
                    const endRad = (endAngle * Math.PI) / 180;
                    const x1 = 100 + 100 * Math.cos(startRad);
                    const y1 = 100 + 100 * Math.sin(startRad);
                    const x2 = 100 + 100 * Math.cos(endRad);
                    const y2 = 100 + 100 * Math.sin(endRad);
                    const largeArc = angle > 180 ? 1 : 0;
                    const textAngle = startAngle + angle / 2;
                    const textRad = (textAngle * Math.PI) / 180;
                    const textX = 100 + 60 * Math.cos(textRad);
                    const textY = 100 + 60 * Math.sin(textRad);
                    
                    return (
                      <g key={i}>
                        <path
                          d={`M 100 100 L ${x1} ${y1} A 100 100 0 ${largeArc} 1 ${x2} ${y2} Z`}
                          fill={seg.color}
                          stroke="#1a1a2e"
                          strokeWidth="1"
                        />
                        <text
                          x={textX}
                          y={textY}
                          fill="white"
                          fontSize="8"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}
                        >
                          <tspan x={textX} dy="-4">{seg.spins}FS</tspan>
                          <tspan x={textX} dy="10">{seg.multiplier}x</tspan>
                        </text>
                      </g>
                    );
                  })}
                  <circle cx="100" cy="100" r="20" fill="#1a1a2e" stroke="#ffd700" strokeWidth="3" />
                  <text x="100" y="100" fill="#ffd700" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">🔮</text>
                </svg>
              </div>
            </div>
            
            {/* Result or Spin Button */}
            {wheelResult ? (
              <div className="text-center animate-pulse">
                <p className="text-lg sm:text-2xl font-bold text-yellow-400 mb-2">🎉 YOU WON! 🎉</p>
                <p className="text-xl sm:text-3xl font-bold text-white">
                  {wheelResult.spins} Free Spins @ {wheelResult.multiplier}x!
                </p>
                <p className="text-white/60 mt-2 text-sm">Starting bonus...</p>
              </div>
            ) : bonusWheelSpinning ? (
              <div className="text-center">
                <p className="text-base sm:text-xl text-white animate-pulse">🔮 The wheel of destiny spins... 🔮</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-white/80 mb-4 text-sm sm:text-base">Spin to reveal your Free Spins and Multiplier!</p>
                <button
                  onClick={spinBonusWheel}
                  className="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold text-lg sm:text-xl rounded-2xl transition-all transform hover:scale-105 shadow-lg"
                >
                  🎡 SPIN THE WHEEL
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="flex-shrink-0 bg-gradient-to-r from-purple-800 via-indigo-700 to-purple-800 px-2 py-2 sm:py-3 relative z-10">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/casino')}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors text-sm sm:text-base"
          >
            ← Back
          </button>
          
          <h1 className="text-sm sm:text-xl font-bold text-white drop-shadow-lg flex items-center gap-1 sm:gap-2">
            🔮 Madame Destiny 🔮
          </h1>
          
          <button
            onClick={() => setShowPaytable(true)}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors text-xs sm:text-sm"
          >
            Paytable
          </button>
        </div>
      </div>

      {/* Free Spins Banner */}
      {isFreeSpinMode && (
        <div className="flex-shrink-0 bg-gradient-to-r from-purple-500 via-indigo-400 to-purple-500 px-4 py-2 text-center relative z-10">
          <span className="text-base sm:text-xl font-bold text-white drop-shadow animate-pulse">
            🎰 FREE SPINS: {freeSpins} | {freeSpinMultiplier}x MULTIPLIER 🎰
          </span>
        </div>
      )}

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-1 sm:p-2 md:p-4 relative z-10 min-h-0">
        {/* Info Row */}
        <div className="w-full max-w-[95vw] sm:max-w-[85vw] md:max-w-2xl lg:max-w-3xl mb-2">
          <div className="flex justify-between items-center bg-black/30 rounded-xl px-3 py-2 backdrop-blur-sm">
            <div className="text-white">
              <span className="text-white/70 text-xs">Balance:</span>
              <span className="text-lg sm:text-xl font-bold text-green-400 ml-1">${balance.toLocaleString()}</span>
            </div>
            <div className="bg-purple-500/30 px-3 py-1 rounded-lg">
              <span className="text-white font-bold text-xs sm:text-sm">Ways: {totalWays.toLocaleString()}</span>
            </div>
            <div className="text-white">
              <span className="text-white/70 text-xs">{isFreeSpinMode ? 'Bonus:' : 'Win:'}</span>
              <span className={`text-lg sm:text-xl font-bold ml-1 ${(isFreeSpinMode ? totalBonusWin + totalWin : lastWin) > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                ${(isFreeSpinMode ? totalBonusWin + totalWin : lastWin).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Slot Frame - Mystic Border */}
        <div className="relative rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-[95vw] sm:max-w-[85vw] md:max-w-2xl lg:max-w-3xl" 
             style={{ 
               background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #6366f1)',
               padding: 'clamp(6px, 1.5vw, 12px)'
             }}>
          <div className="bg-gradient-to-b from-indigo-950 via-purple-950 to-indigo-950 rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4">
            {/* Win Display */}
            <div className="text-center mb-1 sm:mb-2 min-h-[2rem] sm:min-h-[2.5rem]">
              {lastWin > 0 && (
                <div className="text-lg sm:text-2xl md:text-3xl font-bold text-yellow-400 animate-pulse">
                  WIN: ${lastWin.toFixed(2)}
                </div>
              )}
              {tumbleCount > 0 && (
                <div className="text-xs sm:text-sm text-purple-400">
                  Tumble #{tumbleCount}
                </div>
              )}
              {message && !lastWin && (
                <div className="text-sm sm:text-lg md:text-xl text-purple-400 font-bold">
                  {message}
                </div>
              )}
            </div>

            {/* Megaways Grid - Responsive sizing */}
            <div className="bg-indigo-950/80 rounded-lg sm:rounded-xl p-1 sm:p-2 md:p-3 overflow-hidden">
              <div className="flex justify-center gap-1 sm:gap-2 items-end">
                {grid.map((column, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-0.5 sm:gap-1">
                    {column.map((symbol, rowIdx) => (
                      <div key={`${colIdx}-${rowIdx}`}>
                        {renderSymbol(symbol, colIdx, rowIdx, column.length)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Total Win Display */}
            {totalWin > 0 && (
              <div className="text-center mt-2 py-2 bg-gradient-to-r from-transparent via-purple-600/50 to-transparent rounded">
                <div className="text-lg sm:text-2xl md:text-3xl font-bold text-yellow-300">
                  TOTAL WIN: ${totalWin.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="flex-shrink-0 bg-gradient-to-t from-indigo-900 via-purple-800 to-purple-700 border-t-4 border-purple-500 px-2 sm:px-4 py-2 sm:py-3 relative z-10">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Buy Feature Button */}
          <button
            onClick={buyBonus}
            disabled={isSpinning || isTumbling || balance < betAmount * 100 || isFreeSpinMode}
            className="px-2 sm:px-4 py-2 sm:py-3 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 border-2 border-purple-400 text-[10px] sm:text-xs font-bold text-white disabled:opacity-50 hover:scale-105 transition-transform flex-shrink-0 shadow-lg"
          >
            BUY BONUS<br/>
            <span className="text-purple-200">${(betAmount * 100).toFixed(0)}</span>
          </button>

          {/* Ante Toggle - Mobile Compact */}
          <button
            onClick={() => setAnteBet(!anteBet)}
            disabled={isSpinning || isTumbling || isFreeSpinMode}
            className={`px-2 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex-shrink-0 ${
              anteBet ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white hover:bg-white/20'
            } disabled:opacity-50`}
          >
            ⚡{anteBet ? 'ON' : 'Ante'}
          </button>

          {/* Bet Amount */}
          <div className="flex items-center gap-1 sm:gap-2 bg-purple-900/80 rounded-lg px-2 sm:px-3 py-1 flex-shrink-0">
            <button
              onClick={() => adjustBet('down')}
              disabled={isSpinning || isTumbling || isFreeSpinMode}
              className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-purple-600 flex items-center justify-center text-white hover:bg-purple-500 disabled:opacity-50 text-lg sm:text-xl font-bold"
            >
              −
            </button>
            <div className="text-center min-w-[50px] sm:min-w-[70px]">
              <div className="text-[8px] sm:text-xs text-purple-300">BET</div>
              <div className="text-xs sm:text-base font-bold text-white">${betAmount}</div>
              {anteBet && <div className="text-yellow-400 text-[8px] sm:text-xs">+25%</div>}
            </div>
            <button
              onClick={() => adjustBet('up')}
              disabled={isSpinning || isTumbling || isFreeSpinMode}
              className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-purple-600 flex items-center justify-center text-white hover:bg-purple-500 disabled:opacity-50 text-lg sm:text-xl font-bold"
            >
              +
            </button>
          </div>

          {/* Spin Button */}
          <button
            onClick={spin}
            disabled={isSpinning || isTumbling || (!isFreeSpinMode && balance < getEffectiveBet())}
            className={`
              px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-base sm:text-xl transition-all flex-shrink-0
              ${isFreeSpinMode 
                ? 'bg-gradient-to-r from-purple-500 to-indigo-500 animate-pulse' 
                : 'bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700'}
              text-white shadow-lg disabled:opacity-50
            `}
          >
            {isSpinning ? '🔮' : isTumbling ? '⬇️' : isFreeSpinMode ? `🎁 ${freeSpins}` : '🔮 SPIN'}
          </button>

          {/* Auto Play Toggle */}
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            disabled={isFreeSpinMode}
            className={`px-2 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex-shrink-0 ${
              autoPlay ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white hover:bg-white/20'
            } disabled:opacity-50`}
          >
            {autoPlay ? '⏹️' : '▶️'}
          </button>
        </div>
      </div>

      {/* Paytable Modal */}
      {showPaytable && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-4xl max-h-[90vh] overflow-y-auto border-4 border-purple-400/30 w-full">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-3xl font-bold text-white">🔮 Paytable 🔮</h2>
              <button
                onClick={() => setShowPaytable(false)}
                className="text-white text-2xl sm:text-3xl hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            
            {/* Rules */}
            <div className="bg-white/10 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
              <h3 className="text-lg sm:text-xl font-bold text-yellow-400 mb-2">How to Win</h3>
              <ul className="text-white/90 space-y-1 sm:space-y-2 text-sm sm:text-base">
                <li>• <b>Megaways</b> - Up to 200,704 ways to win!</li>
                <li>• Match symbols on <b>consecutive reels from left</b></li>
                <li>• <b>Tumble Feature</b> - Wins disappear, new symbols fall</li>
                <li>• <b>Madame Destiny 🔮</b> is Wild and <b>doubles all wins</b></li>
                <li>• <b>3+ Crystal Balls 🔴</b> trigger Bonus Wheel</li>
                <li>• Bonus Wheel awards <b>5-12 Free Spins</b> and <b>2x-25x Multiplier</b></li>
              </ul>
            </div>

            {/* Symbol Payouts */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
              {[...REGULAR_SYMBOLS, 'scatter' as SymbolType].map(symbolType => {
                const config = SYMBOLS[symbolType];
                return (
                  <div key={symbolType} className={`bg-gradient-to-br ${config.color} rounded-xl p-2 sm:p-3 border border-white/20`}>
                    <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                      <span className="text-xl sm:text-3xl">{config.emoji}</span>
                      <span className="text-white font-bold text-xs sm:text-base">{config.name}</span>
                    </div>
                    <div className="text-white/90 text-[10px] sm:text-sm">
                      {Object.entries(config.payouts).map(([count, mult]) => (
                        <div key={count}>{count}x: {mult}x</div>
                      ))}
                    </div>
                    {symbolType === 'madame' && (
                      <div className="text-yellow-300 text-[9px] sm:text-xs mt-1">Wild + 2x!</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
