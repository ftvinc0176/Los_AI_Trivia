'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

// Risk levels with their payout tables
type RiskLevel = 'classic' | 'low' | 'medium' | 'high';

// Accurate Stake.us Keno payout tables
// Format: payouts[picks][hits] = multiplier
const PAYOUT_TABLES: Record<RiskLevel, Record<number, Record<number, number>>> = {
  classic: {
    1: { 1: 3.96 },
    2: { 1: 1, 2: 4.9 },
    3: { 1: 0.5, 2: 1.5, 3: 12 },
    4: { 1: 0.4, 2: 1, 3: 3.5, 4: 29 },
    5: { 1: 0.3, 2: 0.8, 3: 2, 4: 8, 5: 50 },
    6: { 2: 0.5, 3: 1.5, 4: 4, 5: 15, 6: 90 },
    7: { 2: 0.4, 3: 1, 4: 2.5, 5: 8, 6: 35, 7: 150 },
    8: { 3: 0.8, 4: 2, 5: 5, 6: 18, 7: 70, 8: 300 },
    9: { 3: 0.5, 4: 1.5, 5: 3, 6: 10, 7: 40, 8: 150, 9: 500 },
    10: { 3: 0.4, 4: 1, 5: 2, 6: 6, 7: 20, 8: 80, 9: 300, 10: 1000 }
  },
  low: {
    1: { 1: 3.96 },
    2: { 2: 5.8 },
    3: { 2: 1.8, 3: 5.5 },
    4: { 2: 1.2, 3: 2.5, 4: 14 },
    5: { 2: 0.8, 3: 1.8, 4: 5, 5: 23 },
    6: { 3: 1.3, 4: 3, 5: 10, 6: 43 },
    7: { 3: 1.1, 4: 2, 5: 5, 6: 20, 7: 80 },
    8: { 4: 1.5, 5: 3, 6: 10, 7: 40, 8: 150 },
    9: { 4: 1.3, 5: 2.5, 6: 6, 7: 24, 8: 90, 9: 300 },
    10: { 4: 1.1, 5: 2, 6: 4, 7: 14, 8: 55, 9: 200, 10: 500 }
  },
  medium: {
    1: { 1: 3.96 },
    2: { 2: 9 },
    3: { 2: 1.4, 3: 15 },
    4: { 2: 0.6, 3: 3, 4: 44 },
    5: { 3: 2, 4: 8, 5: 80 },
    6: { 3: 1.2, 4: 4, 5: 20, 6: 200 },
    7: { 4: 2, 5: 8, 6: 50, 7: 400 },
    8: { 4: 1.5, 5: 5, 6: 25, 7: 120, 8: 700 },
    9: { 5: 3, 6: 12, 7: 60, 8: 300, 9: 1500 },
    10: { 5: 2, 6: 8, 7: 35, 8: 150, 9: 700, 10: 3000 }
  },
  high: {
    1: { 1: 3.96 },
    2: { 2: 17 },
    3: { 3: 50 },
    4: { 3: 4, 4: 81.5 },
    5: { 4: 10, 5: 250 },
    6: { 4: 4, 5: 35, 6: 710 },
    7: { 4: 2, 5: 15, 6: 130, 7: 2000 },
    8: { 5: 8, 6: 50, 7: 400, 8: 5000 },
    9: { 5: 4, 6: 25, 7: 180, 8: 1500, 9: 10000 },
    10: { 6: 15, 7: 100, 8: 700, 9: 5000, 10: 25000 }
  }
};

const RISK_COLORS: Record<RiskLevel, { bg: string; border: string; text: string }> = {
  classic: { bg: 'from-blue-500 to-cyan-500', border: 'border-cyan-400', text: 'text-cyan-400' },
  low: { bg: 'from-green-500 to-emerald-500', border: 'border-green-400', text: 'text-green-400' },
  medium: { bg: 'from-yellow-500 to-orange-500', border: 'border-yellow-400', text: 'text-yellow-400' },
  high: { bg: 'from-red-500 to-pink-500', border: 'border-red-400', text: 'text-red-400' }
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
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('high');
  const [isPlaying, setIsPlaying] = useState(false);
  const [gamePhase, setGamePhase] = useState<'select' | 'drawing' | 'result'>('select');
  const [currentDrawIndex, setCurrentDrawIndex] = useState(0);
  const [winAmount, setWinAmount] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [autoPickCount, setAutoPickCount] = useState(5);
  const [fastSpins, setFastSpins] = useState(false);

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
    setWinAmount(0);
    setMultiplier(0);
    
    // Deduct bet
    setBalance(balance - betAmount);
    recordBet(betAmount);
    
    // Generate draw numbers
    const drawn = generateDrawNumbers();
    setDrawnNumbers([]);
    setHits([]);
    setCurrentDrawIndex(0);

    if (fastSpins) {
      // Instant reveal all
      setDrawnNumbers(drawn);
      const hitNumbers = drawn.filter(n => selectedNumbers.includes(n));
      setHits(hitNumbers);
      setCurrentDrawIndex(DRAW_COUNT);
    } else {
      // Animate the draw
      for (let i = 0; i < DRAW_COUNT; i++) {
        await new Promise(resolve => setTimeout(resolve, 120));
        setDrawnNumbers(prev => [...prev, drawn[i]]);
        setCurrentDrawIndex(i + 1);
        
        // Check if it's a hit
        if (selectedNumbers.includes(drawn[i])) {
          setHits(prev => [...prev, drawn[i]]);
        }
      }
    }

    // Calculate result
    await new Promise(resolve => setTimeout(resolve, fastSpins ? 100 : 300));
    
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
  }, [selectedNumbers, isPlaying, betAmount, balance, setBalance, recordBet, generateDrawNumbers, riskLevel, fastSpins]);

  // Get cell color based on state
  const getCellColor = (num: number) => {
    const isSelected = selectedNumbers.includes(num);
    const isDrawn = drawnNumbers.includes(num);
    const isHit = hits.includes(num);

    if (isHit) {
      return 'bg-gradient-to-br from-green-400 to-green-600 text-white shadow-lg shadow-green-500/50 scale-110 z-10';
    }
    if (isSelected && isDrawn) {
      // Selected but miss (drawn but didn't match our selection)
      return 'bg-gradient-to-br from-pink-500 to-pink-700 text-white';
    }
    if (isDrawn && !isSelected) {
      // Drawn but not selected
      return 'bg-gray-600/80 text-gray-300';
    }
    if (isSelected) {
      return 'bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg shadow-purple-500/30';
    }
    return 'bg-slate-800/80 hover:bg-slate-700/80 text-gray-400 hover:text-white';
  };

  // Get payout multipliers for current picks
  const getPayoutPreviews = () => {
    if (selectedNumbers.length === 0) return [];
    const payoutTable = PAYOUT_TABLES[riskLevel][selectedNumbers.length] || {};
    const previews: { hits: number; mult: number }[] = [];
    for (let i = 0; i <= selectedNumbers.length; i++) {
      previews.push({ hits: i, mult: payoutTable[i] || 0 });
    }
    return previews;
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-black/40 border-b border-purple-500/20 px-3 py-2">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/casino')} className="text-gray-400 hover:text-white text-sm">
            ← Back
          </button>
          <span className="text-purple-400 font-bold">KENO</span>
          <div className="text-green-400 font-bold text-sm">${balance.toLocaleString()}</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 p-3 min-h-0 overflow-hidden">
        
        {/* Left Panel - Controls */}
        <div className="lg:w-64 flex-shrink-0 space-y-2 order-2 lg:order-1 overflow-auto">
          {/* Bet Amount */}
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
            <label className="block text-xs text-gray-500 mb-1">Amount</label>
            <div className="flex items-center gap-1">
              <input 
                type="number" 
                value={betAmount} 
                onChange={(e) => setBetAmount(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isPlaying} 
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
              />
              <button onClick={() => !isPlaying && setBetAmount(Math.max(1, betAmount / 2))} disabled={isPlaying}
                className="px-2 py-2 bg-slate-700 rounded-lg text-xs text-gray-300 hover:text-white disabled:opacity-50">½</button>
              <button onClick={() => !isPlaying && setBetAmount(betAmount * 2)} disabled={isPlaying}
                className="px-2 py-2 bg-slate-700 rounded-lg text-xs text-gray-300 hover:text-white disabled:opacity-50">2×</button>
            </div>
          </div>

          {/* Risk Level */}
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
            <label className="block text-xs text-gray-500 mb-1">Difficulty</label>
            <div className="grid grid-cols-2 gap-1">
              {(['low', 'medium', 'high', 'classic'] as RiskLevel[]).map(level => (
                <button 
                  key={level} 
                  onClick={() => !isPlaying && setRiskLevel(level)} 
                  disabled={isPlaying}
                  className={`py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                    riskLevel === level 
                      ? `bg-gradient-to-r ${RISK_COLORS[level].bg} text-white` 
                      : 'bg-slate-700/50 text-gray-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Auto Pick */}
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 flex items-center gap-2">
            <input 
              type="range" 
              min="1" 
              max="10" 
              value={autoPickCount} 
              onChange={(e) => setAutoPickCount(parseInt(e.target.value))}
              disabled={isPlaying} 
              className="flex-1 accent-purple-500" 
            />
            <button 
              onClick={autoPick} 
              disabled={isPlaying}
              className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              Pick {autoPickCount}
            </button>
            <button 
              onClick={clearSelection} 
              disabled={isPlaying}
              className="px-2 py-1.5 bg-slate-700 rounded-lg text-xs text-gray-400 hover:text-white disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          {/* Fast Spins Toggle */}
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Fast spins</span>
              <button 
                onClick={() => setFastSpins(!fastSpins)}
                className={`w-12 h-6 rounded-full transition-all flex items-center px-0.5 ${fastSpins ? 'bg-purple-500' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-all ${fastSpins ? 'ml-6' : 'ml-0'}`} />
              </button>
            </div>
          </div>

          {/* Play Button */}
          <button 
            onClick={play} 
            disabled={selectedNumbers.length === 0 || isPlaying || betAmount > balance}
            className={`w-full py-3 rounded-xl font-bold text-base transition-all ${
              selectedNumbers.length > 0 && !isPlaying && betAmount <= balance
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 shadow-lg shadow-green-500/30 text-white'
                : 'bg-slate-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isPlaying ? 'Drawing...' : `Play (${selectedNumbers.length} picks)`}
          </button>
        </div>

        {/* Right Panel - Game Board */}
        <div className="flex-1 flex flex-col min-h-0 order-1 lg:order-2">
          {/* Result Banner */}
          {gamePhase === 'result' && (
            <div className={`flex-shrink-0 mb-2 py-2 px-4 rounded-xl text-center ${
              winAmount > 0 
                ? 'bg-gradient-to-r from-green-500/30 to-emerald-500/30 border border-green-500/50' 
                : 'bg-gradient-to-r from-red-500/30 to-pink-500/30 border border-red-500/50'
            }`}>
              {winAmount > 0 ? (
                <span className="text-lg font-bold text-green-400">
                  🎉 WIN {multiplier}× = +${winAmount.toLocaleString()}
                </span>
              ) : (
                <span className="text-red-400">No Win - {hits.length}/{selectedNumbers.length} hits</span>
              )}
            </div>
          )}

          {/* Drawing Progress */}
          {gamePhase === 'drawing' && !fastSpins && (
            <div className="flex-shrink-0 mb-2 p-2 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Drawing...</span>
                <span className="text-purple-400 font-mono">{currentDrawIndex}/{DRAW_COUNT}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
                <div 
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${(currentDrawIndex / DRAW_COUNT) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Numbers Grid */}
          <div className="flex-1 bg-slate-800/40 rounded-xl p-2 sm:p-3 border border-slate-700/50 min-h-0">
            <div className="grid grid-cols-8 gap-1 sm:gap-2 h-full auto-rows-fr">
              {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map(num => (
                <button
                  key={num}
                  onClick={() => toggleNumber(num)}
                  disabled={isPlaying}
                  className={`aspect-square rounded-lg font-bold text-sm sm:text-base transition-all duration-200 ${getCellColor(num)}`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Payout Preview Row */}
          <div className="flex-shrink-0 mt-2">
            {selectedNumbers.length > 0 ? (
              <div className="flex gap-1 overflow-x-auto pb-1">
                {getPayoutPreviews().map(({ hits: h, mult }) => (
                  <div 
                    key={h} 
                    className={`flex-1 min-w-[60px] bg-slate-800/60 rounded-lg py-2 text-center border ${
                      gamePhase === 'result' && hits.length === h && mult > 0
                        ? 'border-green-500 bg-green-500/20'
                        : 'border-slate-700/50'
                    }`}
                  >
                    <div className={`text-lg font-bold ${mult > 0 ? 'text-white' : 'text-gray-600'}`}>
                      {mult > 0 ? `${mult}×` : '0.00×'}
                    </div>
                    <div className="text-[10px] text-gray-500">{h} 🎯</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 text-sm py-4">
                Select 1 - 10 numbers to play
              </div>
            )}
          </div>

          {/* Stats Row */}
          <div className="flex-shrink-0 mt-2 grid grid-cols-4 gap-2">
            <div className="bg-slate-800/60 rounded-lg py-2 text-center border border-slate-700/50">
              <div className="text-xs text-gray-500">Selected</div>
              <div className="text-lg font-bold text-purple-400">{selectedNumbers.length}</div>
            </div>
            <div className="bg-slate-800/60 rounded-lg py-2 text-center border border-slate-700/50">
              <div className="text-xs text-gray-500">Drawn</div>
              <div className="text-lg font-bold text-blue-400">{drawnNumbers.length}</div>
            </div>
            <div className="bg-slate-800/60 rounded-lg py-2 text-center border border-slate-700/50">
              <div className="text-xs text-gray-500">Hits</div>
              <div className="text-lg font-bold text-green-400">{hits.length}</div>
            </div>
            <div className="bg-slate-800/60 rounded-lg py-2 text-center border border-slate-700/50">
              <div className="text-xs text-gray-500">Mult</div>
              <div className="text-lg font-bold text-yellow-400">{multiplier > 0 ? `${multiplier}×` : '-'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
