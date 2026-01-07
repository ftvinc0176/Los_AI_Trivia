'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

// Risk levels with their payout tables
// Payouts are based on picks made and hits achieved
// Format: payouts[picks][hits] = multiplier
type RiskLevel = 'classic' | 'low' | 'medium' | 'high';

// Stake.com Keno payout tables (approximate)
const PAYOUT_TABLES: Record<RiskLevel, Record<number, Record<number, number>>> = {
  classic: {
    1: { 1: 3.96 },
    2: { 1: 1, 2: 9 },
    3: { 1: 1, 2: 2, 3: 26 },
    4: { 2: 1, 3: 6, 4: 65 },
    5: { 2: 1, 3: 3, 4: 14, 5: 135 },
    6: { 3: 1, 4: 3, 5: 15, 6: 390 },
    7: { 3: 1, 4: 2, 5: 8, 6: 50, 7: 750 },
    8: { 4: 1, 5: 4, 6: 16, 7: 90, 8: 1000 },
    9: { 4: 1, 5: 2, 6: 7, 7: 30, 8: 200, 9: 2000 },
    10: { 5: 1, 6: 3, 7: 10, 8: 50, 9: 300, 10: 4000 }
  },
  low: {
    1: { 1: 3.8 },
    2: { 2: 7.5 },
    3: { 2: 1.5, 3: 16 },
    4: { 2: 1, 3: 4, 4: 45 },
    5: { 3: 1.5, 4: 8, 5: 100 },
    6: { 3: 1, 4: 3, 5: 15, 6: 250 },
    7: { 3: 1, 4: 2, 5: 6, 6: 40, 7: 500 },
    8: { 4: 1, 5: 3, 6: 12, 7: 70, 8: 800 },
    9: { 4: 1, 5: 2, 6: 5, 7: 25, 8: 150, 9: 1500 },
    10: { 5: 1, 6: 2, 7: 8, 8: 40, 9: 200, 10: 3000 }
  },
  medium: {
    1: { 1: 3.8 },
    2: { 2: 9 },
    3: { 2: 2, 3: 25 },
    4: { 3: 4, 4: 70 },
    5: { 3: 2, 4: 15, 5: 180 },
    6: { 4: 4, 5: 25, 6: 500 },
    7: { 4: 2, 5: 10, 6: 75, 7: 1000 },
    8: { 5: 4, 6: 20, 7: 120, 8: 2000 },
    9: { 5: 2, 6: 10, 7: 50, 8: 400, 9: 4000 },
    10: { 5: 1.5, 6: 5, 7: 25, 8: 150, 9: 1000, 10: 10000 }
  },
  high: {
    1: { 1: 3.96 },
    2: { 2: 17 },
    3: { 3: 80 },
    4: { 3: 2, 4: 200 },
    5: { 4: 12, 5: 500 },
    6: { 4: 4, 5: 50, 6: 1500 },
    7: { 5: 12, 6: 150, 7: 4000 },
    8: { 5: 5, 6: 50, 7: 400, 8: 10000 },
    9: { 6: 20, 7: 150, 8: 1500, 9: 25000 },
    10: { 6: 10, 7: 75, 8: 500, 9: 5000, 10: 100000 }
  }
};

const RISK_COLORS: Record<RiskLevel, string> = {
  classic: 'from-blue-500 to-cyan-500',
  low: 'from-green-500 to-emerald-500',
  medium: 'from-yellow-500 to-orange-500',
  high: 'from-red-500 to-pink-500'
};

export default function KenoGame() {
  const router = useRouter();
  const { balance, setBalance, recordBet, checkAndReload } = useCasino();
  
  // Game state
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [hits, setHits] = useState<number[]>([]);
  const [betAmount, setBetAmount] = useState(100);
  const [lastBet, setLastBet] = useState<number>(0);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('medium');
  const [isPlaying, setIsPlaying] = useState(false);
  const [gamePhase, setGamePhase] = useState<'select' | 'drawing' | 'result'>('select');
  const [currentDrawIndex, setCurrentDrawIndex] = useState(0);
  const [winAmount, setWinAmount] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [autoPickCount, setAutoPickCount] = useState(5);
  const [showPaytable, setShowPaytable] = useState(false);

  const TOTAL_NUMBERS = 40;
  const DRAW_COUNT = 10;
  const MAX_PICKS = 10;

  // Check for reload on balance change
  useEffect(() => {
    if (balance < 1000 && !isPlaying) {
      checkAndReload();
    }
  }, [balance, isPlaying, checkAndReload]);

  // Generate random numbers without duplicates
  const generateDrawNumbers = useCallback(() => {
    const numbers: number[] = [];
    while (numbers.length < DRAW_COUNT) {
      const num = Math.floor(Math.random() * TOTAL_NUMBERS) + 1;
      if (!numbers.includes(num)) {
        numbers.push(num);
      }
    }
    return numbers;
  }, []);

  // Handle number selection
  const toggleNumber = useCallback((num: number) => {
    if (isPlaying) return;
    
    setSelectedNumbers(prev => {
      if (prev.includes(num)) {
        return prev.filter(n => n !== num);
      } else if (prev.length < MAX_PICKS) {
        return [...prev, num];
      }
      return prev;
    });
  }, [isPlaying]);

  // Auto pick random numbers
  const autoPick = useCallback(() => {
    if (isPlaying) return;
    
    const numbers: number[] = [];
    while (numbers.length < autoPickCount) {
      const num = Math.floor(Math.random() * TOTAL_NUMBERS) + 1;
      if (!numbers.includes(num)) {
        numbers.push(num);
      }
    }
    setSelectedNumbers(numbers);
  }, [isPlaying, autoPickCount]);

  // Clear selections
  const clearSelection = useCallback(() => {
    if (isPlaying) return;
    setSelectedNumbers([]);
    setDrawnNumbers([]);
    setHits([]);
    setGamePhase('select');
    setWinAmount(0);
    setMultiplier(0);
  }, [isPlaying]);

  // Play the game
  const play = useCallback(async () => {
    if (selectedNumbers.length === 0 || isPlaying || betAmount > balance) return;

    setIsPlaying(true);
    setGamePhase('drawing');
    setLastBet(betAmount);
    
    // Deduct bet
    setBalance(balance - betAmount);
    recordBet(betAmount);
    
    // Generate draw numbers
    const drawn = generateDrawNumbers();
    setDrawnNumbers([]);
    setHits([]);
    setCurrentDrawIndex(0);

    // Animate the draw
    for (let i = 0; i < DRAW_COUNT; i++) {
      await new Promise(resolve => setTimeout(resolve, 150));
      setDrawnNumbers(prev => [...prev, drawn[i]]);
      setCurrentDrawIndex(i + 1);
      
      // Check if it's a hit
      if (selectedNumbers.includes(drawn[i])) {
        setHits(prev => [...prev, drawn[i]]);
      }
    }

    // Calculate result
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const hitCount = drawn.filter(n => selectedNumbers.includes(n)).length;
    const picks = selectedNumbers.length;
    const payoutTable = PAYOUT_TABLES[riskLevel][picks] || {};
    const mult = payoutTable[hitCount] || 0;
    const win = mult * betAmount;

    setMultiplier(mult);
    setWinAmount(win);
    
    if (win > 0) {
      setBalance(balance - betAmount + win);
    }

    setGamePhase('result');
    setIsPlaying(false);
  }, [selectedNumbers, isPlaying, betAmount, balance, setBalance, recordBet, generateDrawNumbers, riskLevel]);

  // Rebet with last bet
  const rebet = useCallback(() => {
    if (lastBet > 0 && lastBet <= balance && !isPlaying) {
      setBetAmount(lastBet);
    }
  }, [lastBet, balance, isPlaying]);

  // All in
  const allIn = useCallback(() => {
    if (!isPlaying) {
      setBetAmount(Math.floor(balance));
    }
  }, [balance, isPlaying]);

  // Get cell color based on state
  const getCellColor = (num: number) => {
    const isSelected = selectedNumbers.includes(num);
    const isDrawn = drawnNumbers.includes(num);
    const isHit = hits.includes(num);

    if (isHit) {
      return 'bg-gradient-to-br from-green-400 to-green-600 text-white shadow-lg shadow-green-500/50 scale-110';
    }
    if (isSelected && isDrawn) {
      return 'bg-gradient-to-br from-red-400 to-red-600 text-white';
    }
    if (isSelected) {
      return 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30';
    }
    if (isDrawn) {
      return 'bg-gradient-to-br from-gray-500 to-gray-700 text-white';
    }
    return 'bg-gray-800/50 hover:bg-gray-700/50 text-gray-300 hover:text-white border border-gray-700/50';
  };

  // Get payout for current selection at given hit count
  const getPayoutPreview = (hitCount: number) => {
    if (selectedNumbers.length === 0) return 0;
    const payoutTable = PAYOUT_TABLES[riskLevel][selectedNumbers.length] || {};
    return payoutTable[hitCount] || 0;
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 text-white overflow-hidden">
      {/* Compact Header */}
      <div className="flex-shrink-0 bg-black/40 border-b border-purple-500/20 px-2 sm:px-4 py-2">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/casino')}
            className="text-gray-400 hover:text-white text-sm"
          >
            ← Back
          </button>
          <span className="text-purple-400 font-bold text-sm sm:text-base">KENO</span>
          <div className="text-yellow-400 font-bold text-sm">${balance.toLocaleString()}</div>
        </div>
      </div>

      {/* Main Content - Scrollable only if needed */}
      <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-4 p-2 sm:p-4 min-h-0 overflow-auto">
        {/* Game Board - Primary Focus */}
        <div className="flex-1 flex flex-col min-h-0 order-1 lg:order-2">
          {/* Result Display */}
          {gamePhase === 'result' && (
            <div className={`flex-shrink-0 mb-2 p-2 sm:p-3 rounded-xl text-center ${
              winAmount > 0 
                ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30' 
                : 'bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30'
            }`}>
              {winAmount > 0 ? (
                <div className="text-lg sm:text-xl font-bold text-green-400">
                  🎉 WIN! {multiplier}× = +${winAmount.toLocaleString()}
                </div>
              ) : (
                <div className="text-base text-red-400">No Win - {hits.length}/{selectedNumbers.length} hits</div>
              )}
            </div>
          )}

          {/* Drawing Progress */}
          {gamePhase === 'drawing' && (
            <div className="flex-shrink-0 mb-2 p-2 bg-gray-800/50 rounded-xl border border-gray-700/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Drawing...</span>
                <span className="text-purple-400 font-mono">{currentDrawIndex}/{DRAW_COUNT}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
                <div 
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${(currentDrawIndex / DRAW_COUNT) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Numbers Grid - Fills available space */}
          <div className="flex-1 bg-gray-800/30 rounded-xl p-2 border border-gray-700/50 min-h-0">
            <div className="grid grid-cols-8 gap-1 sm:gap-1.5 h-full auto-rows-fr">
              {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map(num => (
                <button
                  key={num}
                  onClick={() => toggleNumber(num)}
                  disabled={isPlaying}
                  className={`aspect-square rounded-md sm:rounded-lg font-bold text-xs sm:text-sm transition-all ${getCellColor(num)}`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex-shrink-0 mt-2 grid grid-cols-4 gap-1 sm:gap-2">
            <div className="bg-gray-800/50 rounded-lg p-1.5 sm:p-2 text-center border border-gray-700/50">
              <div className="text-[9px] sm:text-xs text-gray-500">Selected</div>
              <div className="text-sm sm:text-lg font-bold text-purple-400">{selectedNumbers.length}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-1.5 sm:p-2 text-center border border-gray-700/50">
              <div className="text-[9px] sm:text-xs text-gray-500">Drawn</div>
              <div className="text-sm sm:text-lg font-bold text-blue-400">{drawnNumbers.length}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-1.5 sm:p-2 text-center border border-gray-700/50">
              <div className="text-[9px] sm:text-xs text-gray-500">Hits</div>
              <div className="text-sm sm:text-lg font-bold text-green-400">{hits.length}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-1.5 sm:p-2 text-center border border-gray-700/50">
              <div className="text-[9px] sm:text-xs text-gray-500">Mult</div>
              <div className="text-sm sm:text-lg font-bold text-yellow-400">{multiplier > 0 ? `${multiplier}×` : '-'}</div>
            </div>
          </div>
        </div>

        {/* Controls Panel - Compact on mobile */}
        <div className="flex-shrink-0 lg:w-72 space-y-2 order-2 lg:order-1">
          {/* Bet + Risk in one row on mobile */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            {/* Bet Amount */}
            <div className="bg-gray-800/50 rounded-xl p-2 sm:p-3 border border-gray-700/50">
              <label className="block text-xs text-gray-400 mb-1">Bet</label>
              <div className="flex items-center gap-1">
                <button onClick={() => setBetAmount(Math.max(10, betAmount / 2))} disabled={isPlaying}
                  className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50">½</button>
                <input type="number" value={betAmount} onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                  disabled={isPlaying} className="flex-1 w-full min-w-0 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-center text-sm" />
                <button onClick={() => setBetAmount(Math.min(balance, betAmount * 2))} disabled={isPlaying}
                  className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50">2×</button>
              </div>
            </div>

            {/* Risk Level */}
            <div className="bg-gray-800/50 rounded-xl p-2 sm:p-3 border border-gray-700/50">
              <label className="block text-xs text-gray-400 mb-1">Risk</label>
              <div className="grid grid-cols-2 gap-1">
                {(['low', 'medium', 'high', 'classic'] as RiskLevel[]).map(level => (
                  <button key={level} onClick={() => !isPlaying && setRiskLevel(level)} disabled={isPlaying}
                    className={`py-1 rounded text-xs font-semibold capitalize transition-all ${
                      riskLevel === level ? `bg-gradient-to-r ${RISK_COLORS[level]} text-white` : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                    }`}>
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Auto Pick */}
          <div className="bg-gray-800/50 rounded-xl p-2 sm:p-3 border border-gray-700/50">
            <div className="flex items-center gap-2">
              <input type="range" min="1" max="10" value={autoPickCount} onChange={(e) => setAutoPickCount(parseInt(e.target.value))}
                disabled={isPlaying} className="flex-1" />
              <button onClick={autoPick} disabled={isPlaying}
                className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50">
                Pick {autoPickCount}
              </button>
              <button onClick={clearSelection} disabled={isPlaying}
                className="px-2 py-1.5 bg-gray-700 rounded-lg text-xs text-gray-400 hover:text-white disabled:opacity-50">
                Clear
              </button>
            </div>
          </div>

          {/* Play Button */}
          <button onClick={play} disabled={selectedNumbers.length === 0 || isPlaying || betAmount > balance}
            className={`w-full py-3 rounded-xl font-bold text-base transition-all ${
              selectedNumbers.length > 0 && !isPlaying && betAmount <= balance
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/30'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}>
            {isPlaying ? 'Drawing...' : `Play (${selectedNumbers.length} picks)`}
          </button>
        </div>
      </div>
    </div>
  );
}
