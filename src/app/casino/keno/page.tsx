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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 text-white">
      {/* Header */}
      <div className="bg-black/40 border-b border-purple-500/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push('/casino')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <span className="text-xl">←</span>
            <span>Back to Casino</span>
          </button>
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 px-4 py-2 rounded-lg border border-yellow-500/30">
              <span className="text-yellow-400 font-bold">${balance.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="space-y-4">
            {/* Bet Amount */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
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

            {/* Risk Level */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <label className="block text-sm text-gray-400 mb-2">Risk Level</label>
              <div className="grid grid-cols-2 gap-2">
                {(['classic', 'low', 'medium', 'high'] as RiskLevel[]).map(level => (
                  <button
                    key={level}
                    onClick={() => !isPlaying && setRiskLevel(level)}
                    disabled={isPlaying}
                    className={`py-2 rounded-lg font-semibold capitalize transition-all ${
                      riskLevel === level
                        ? `bg-gradient-to-r ${RISK_COLORS[level]} text-white shadow-lg`
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Pick */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <label className="block text-sm text-gray-400 mb-2">Auto Pick ({autoPickCount} numbers)</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={autoPickCount}
                  onChange={(e) => setAutoPickCount(parseInt(e.target.value))}
                  disabled={isPlaying}
                  className="flex-1"
                />
                <button
                  onClick={autoPick}
                  disabled={isPlaying}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  Auto Pick
                </button>
              </div>
              <button
                onClick={clearSelection}
                disabled={isPlaying}
                className="w-full mt-2 py-2 bg-gray-700/50 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50"
              >
                Clear All
              </button>
            </div>

            {/* Play Button */}
            <button
              onClick={play}
              disabled={selectedNumbers.length === 0 || isPlaying || betAmount > balance}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                selectedNumbers.length > 0 && !isPlaying && betAmount <= balance
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/30'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isPlaying ? 'Drawing...' : `Play (${selectedNumbers.length} picks)`}
            </button>

            {/* Current Payout Preview */}
            {selectedNumbers.length > 0 && (
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-400">Potential Payouts</span>
                  <button
                    onClick={() => setShowPaytable(!showPaytable)}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    {showPaytable ? 'Hide' : 'Show'} Full Paytable
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1 text-xs">
                  {Array.from({ length: selectedNumbers.length + 1 }, (_, i) => i).map(hits => {
                    const payout = getPayoutPreview(hits);
                    if (payout === 0 && hits < selectedNumbers.length) return null;
                    return (
                      <div key={hits} className={`text-center p-1 rounded ${payout > 0 ? 'bg-green-900/30' : 'bg-gray-900/30'}`}>
                        <div className="text-gray-500">{hits} hit{hits !== 1 ? 's' : ''}</div>
                        <div className={payout > 0 ? 'text-green-400 font-bold' : 'text-gray-600'}>
                          {payout > 0 ? `${payout}×` : '-'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Center - Game Board */}
          <div className="lg:col-span-2">
            {/* Result Display */}
            {gamePhase === 'result' && (
              <div className={`mb-4 p-4 rounded-xl text-center ${
                winAmount > 0 
                  ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30' 
                  : 'bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30'
              }`}>
                {winAmount > 0 ? (
                  <>
                    <div className="text-2xl font-bold text-green-400">
                      🎉 WIN! {multiplier}× 🎉
                    </div>
                    <div className="text-3xl font-bold text-white mt-1">
                      +${winAmount.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      {hits.length} of {selectedNumbers.length} hits
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xl text-red-400">No Win</div>
                    <div className="text-sm text-gray-400 mt-1">
                      {hits.length} of {selectedNumbers.length} hits - needed more matches
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Drawing Progress */}
            {gamePhase === 'drawing' && (
              <div className="mb-4 p-3 bg-gray-800/50 rounded-xl border border-gray-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400">Drawing numbers...</span>
                  <span className="text-purple-400 font-mono">{currentDrawIndex}/{DRAW_COUNT}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-150"
                    style={{ width: `${(currentDrawIndex / DRAW_COUNT) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Numbers Grid */}
            <div className="bg-gray-800/30 rounded-2xl p-4 border border-gray-700/50">
              <div className="grid grid-cols-8 gap-2">
                {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map(num => (
                  <button
                    key={num}
                    onClick={() => toggleNumber(num)}
                    disabled={isPlaying}
                    className={`aspect-square rounded-lg font-bold text-lg transition-all duration-200 ${getCellColor(num)}`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats Row */}
            <div className="mt-4 grid grid-cols-4 gap-3">
              <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700/50">
                <div className="text-xs text-gray-500">Selected</div>
                <div className="text-xl font-bold text-purple-400">{selectedNumbers.length}</div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700/50">
                <div className="text-xs text-gray-500">Drawn</div>
                <div className="text-xl font-bold text-blue-400">{drawnNumbers.length}</div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700/50">
                <div className="text-xs text-gray-500">Hits</div>
                <div className="text-xl font-bold text-green-400">{hits.length}</div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700/50">
                <div className="text-xs text-gray-500">Multiplier</div>
                <div className="text-xl font-bold text-yellow-400">{multiplier > 0 ? `${multiplier}×` : '-'}</div>
              </div>
            </div>

            {/* Full Paytable */}
            {showPaytable && (
              <div className="mt-4 bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                <h3 className="text-lg font-bold text-center mb-3 capitalize">{riskLevel} Risk Paytable</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="py-2 px-2 text-left text-gray-400">Picks</th>
                        {[...Array(11)].map((_, i) => (
                          <th key={i} className="py-2 px-2 text-center text-gray-400">{i} hits</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(picks => (
                        <tr key={picks} className="border-b border-gray-800">
                          <td className="py-2 px-2 font-bold text-purple-400">{picks}</td>
                          {[...Array(11)].map((_, hits) => {
                            const payout = PAYOUT_TABLES[riskLevel][picks]?.[hits] || 0;
                            return (
                              <td key={hits} className={`py-2 px-2 text-center ${
                                payout > 0 ? 'text-green-400' : 'text-gray-700'
                              }`}>
                                {payout > 0 ? `${payout}×` : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gradient-to-br from-purple-500 to-pink-500" />
                <span className="text-gray-400">Your Selection</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gradient-to-br from-gray-500 to-gray-700" />
                <span className="text-gray-400">Drawn (Miss)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gradient-to-br from-green-400 to-green-600" />
                <span className="text-gray-400">Hit!</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
