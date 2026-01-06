'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

type BetType = 
  | 'pass' | 'dontPass' 
  | 'come' | 'dontCome'
  | 'field'
  | 'place2' | 'place3' | 'place4' | 'place5' | 'place6' | 'place8' | 'place9' | 'place10' | 'place11' | 'place12'
  | 'hard4' | 'hard6' | 'hard8' | 'hard10'
  | 'anyCraps' | 'any7' | 'c&e'
  | 'horn2' | 'horn3' | 'horn11' | 'horn12';

interface Bet {
  type: BetType;
  amount: number;
  odds?: number; // For odds bets on pass/come
}

interface Die {
  value: number;
  rolling: boolean;
}

export default function Craps() {
  const router = useRouter();
  const { balance, setBalance, recordWin, checkAndReload } = useCasino();

  const [dice, setDice] = useState<Die[]>([
    { value: 1, rolling: false },
    { value: 1, rolling: false }
  ]);
  const [point, setPoint] = useState<number | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [betAmount, setBetAmount] = useState(10);
  const [selectedBet, setSelectedBet] = useState<BetType | null>(null);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState('Place your bets!');
  const [history, setHistory] = useState<number[]>([]);
  const [showPayoutTable, setShowPayoutTable] = useState(false);

  const rollDice = () => {
    if (rolling || bets.length === 0) return;
    
    setRolling(true);
    setMessage('Rolling...');
    
    // Animate dice rolling
    const rollInterval = setInterval(() => {
      setDice([
        { value: Math.floor(Math.random() * 6) + 1, rolling: true },
        { value: Math.floor(Math.random() * 6) + 1, rolling: true }
      ]);
    }, 100);

    setTimeout(() => {
      clearInterval(rollInterval);
      
      const die1 = Math.floor(Math.random() * 6) + 1;
      const die2 = Math.floor(Math.random() * 6) + 1;
      const total = die1 + die2;
      
      setDice([
        { value: die1, rolling: false },
        { value: die2, rolling: false }
      ]);
      
      setHistory([...history, total]);
      processRoll(total, die1, die2);
      setRolling(false);
    }, 1000);
  };

  const processRoll = (total: number, die1: number, die2: number) => {
    let winnings = 0;
    let losses = 0;
    let newBets = [...bets];
    let msg = '';

    // Come-out roll (no point established)
    if (point === null) {
      // CRAPLESS CRAPS: Only 7 wins on come-out, 2,3,11,12 become points
      if (total === 7) {
        msg = '7 - Winner! Pass Line wins!';
        newBets = newBets.filter(bet => {
          if (bet.type === 'pass') {
            winnings += bet.amount * 2; // Return bet + winnings
            return false; // Remove bet
          } else if (bet.type === 'dontPass') {
            losses += bet.amount; // Lose the bet
            return false; // Remove bet
          }
          return true; // Keep other bets
        });
      } else {
        // All other numbers (2,3,4,5,6,8,9,10,11,12) become the point
        setPoint(total);
        msg = `Point is ${total}`;
      }
    } 
    // Point is established
    else {
      if (total === point) {
        msg = `${total} - Winner! Point made!`;
        newBets = newBets.filter(bet => {
          if (bet.type === 'pass') {
            winnings += bet.amount * 2; // 1:1 on pass line
            if (bet.odds) {
              // Odds payouts based on point number
              winnings += bet.odds + (bet.odds * (getOddsMultiplier(point) - 1));
            }
            return false; // Remove bet
          } else if (bet.type === 'dontPass') {
            losses += bet.amount;
            if (bet.odds) losses += bet.odds;
            return false; // Remove bet
          }
          return true; // Keep other bets
        });
        setPoint(null);
      } else if (total === 7) {
        msg = '7 out! Don&apos;t Pass wins!';
        newBets = newBets.filter(bet => {
          if (bet.type === 'dontPass') {
            winnings += bet.amount * 2; // 1:1 payout
            if (bet.odds) {
              winnings += bet.odds * 2; // Even money on don't pass odds
            }
            return false;
          } else if (bet.type === 'pass') {
            losses += bet.amount;
            if (bet.odds) losses += bet.odds;
            return false;
          }
          return true;
        });
        setPoint(null);
      } else {
        msg = `Rolled ${total}`;
      }
    }

    // Process place bets - they stay up unless they win or 7 out
    if (total === 7 && point !== null) {
      // 7 out - all place bets lose
      newBets = newBets.filter(bet => {
        if (bet.type.startsWith('place')) {
          losses += bet.amount;
          return false;
        }
        return true;
      });
    } else {
      newBets = newBets.filter(bet => {
        if (bet.type.startsWith('place')) {
          const placeNum = parseInt(bet.type.replace('place', ''));
          if (total === placeNum) {
            winnings += getPlaceBetPayout(placeNum, bet.amount);
            msg += ` - Place ${placeNum} wins!`;
            return false; // Take bet down after win
          }
        }
        return true;
      });
    }

    // Process field bet (one roll bet)
    newBets = newBets.filter(bet => {
      if (bet.type === 'field') {
        if ([2, 3, 4, 9, 10, 11, 12].includes(total)) {
          if (total === 2) {
            winnings += bet.amount * 3; // 2:1 payout (bet + 2x)
            msg += ' - Field pays 2:1!';
          } else if (total === 12) {
            winnings += bet.amount * 4; // 3:1 payout (bet + 3x)
            msg += ' - Field pays 3:1!';
          } else {
            winnings += bet.amount * 2; // 1:1 payout
            msg += ' - Field wins!';
          }
        } else {
          // Field loses on 5,6,7,8
          losses += bet.amount;
          msg += ' - Field loses';
        }
        return false; // Always remove field bet after roll
      }
      return true;
    });

    // Process hardways
    if (die1 === die2) { // Hard way rolled
      const hardNum = total;
      newBets = newBets.filter(bet => {
        if (bet.type === `hard${hardNum}`) {
          winnings += getHardwayPayout(hardNum, bet.amount);
          msg += ` - Hard ${hardNum} wins!`;
          return false;
        }
        return true;
      });
    } else {
      // Easy way rolled - hardway loses
      if ([4, 6, 8, 10].includes(total)) {
        newBets = newBets.filter(bet => {
          if (bet.type === `hard${total}`) {
            losses += bet.amount;
            return false;
          }
          return true;
        });
      }
    }
    
    // Check if 7 was rolled (kills all hardways)
    if (total === 7) {
      newBets = newBets.filter(bet => {
        if (bet.type.startsWith('hard')) {
          losses += bet.amount;
          return false;
        }
        return true;
      });
    }

    // Process proposition bets (all one-roll)
    newBets = newBets.filter(bet => {
      if (bet.type === 'anyCraps') {
        if ([2, 3, 12].includes(total)) {
          winnings += bet.amount * 8; // 7:1 payout
          msg += ' - Any Craps wins!';
        } else {
          losses += bet.amount;
        }
        return false;
      }
      
      if (bet.type === 'any7') {
        if (total === 7) {
          winnings += bet.amount * 5; // 4:1 payout
          msg += ' - Any 7 wins!';
        } else {
          losses += bet.amount;
        }
        return false;
      }

      // Horn bets
      if (bet.type.startsWith('horn')) {
        const hornNum = parseInt(bet.type.replace('horn', ''));
        if (total === hornNum) {
          winnings += getHornPayout(hornNum, bet.amount);
          msg += ` - Horn ${hornNum} wins!`;
        } else {
          losses += bet.amount;
        }
        return false;
      }

      return true;
    });

    const netChange = winnings - losses;
    setBalance(balance + netChange);
    setBets(newBets);
    setMessage(msg);

    if (winnings > losses) {
      recordWin(netChange);
    }

    // Check if reload needed
    setTimeout(() => checkAndReload(), 100);
  };

  const getOddsMultiplier = (point: number): number => {
    // True odds payouts for crapless craps
    switch (point) {
      case 2:
      case 12:
        return 7; // 6:1 true odds
      case 3:
      case 11:
        return 4; // 3:1 true odds
      case 4:
      case 10:
        return 3; // 2:1 true odds
      case 5:
      case 9:
        return 2.5; // 3:2 true odds
      case 6:
      case 8:
        return 2.2; // 6:5 true odds
      default:
        return 2;
    }
  };

  const getPlaceBetPayout = (num: number, amount: number): number => {
    // Returns total amount including original bet
    switch (num) {
      case 2:
      case 12:
        return amount * 12; // 11:1 payout
      case 3:
      case 11:
        return amount * 12; // 11:1 payout
      case 4:
      case 10:
        return amount * 3; // 2:1 payout
      case 5:
      case 9:
        return amount * 2.5; // 3:2 payout
      case 6:
      case 8:
        return amount * 2.2; // 6:5 payout
      default:
        return amount;
    }
  };

  const getHardwayPayout = (num: number, amount: number): number => {
    // Returns total amount including original bet
    switch (num) {
      case 4:
      case 10:
        return amount * 8; // 7:1 payout
      case 6:
      case 8:
        return amount * 10; // 9:1 payout
      default:
        return amount;
    }
  };

  const getHornPayout = (num: number, amount: number): number => {
    // Returns total amount including original bet
    switch (num) {
      case 2:
      case 12:
        return amount * 31; // 30:1 payout
      case 3:
      case 11:
        return amount * 16; // 15:1 payout
      default:
        return amount;
    }
  };

  const placeBet = (type: BetType) => {
    if (balance < betAmount) {
      setMessage('Insufficient balance!');
      return;
    }

    // Check if bet already exists, add to it
    const existingBetIndex = bets.findIndex(bet => bet.type === type);
    if (existingBetIndex >= 0) {
      const newBets = [...bets];
      newBets[existingBetIndex].amount += betAmount;
      setBets(newBets);
    } else {
      setBets([...bets, { type, amount: betAmount }]);
    }
    
    setBalance(balance - betAmount);
    setMessage(`$${betAmount} on ${formatBetName(type)}`);
  };

  const clearBets = () => {
    const totalBetAmount = bets.reduce((sum, bet) => sum + bet.amount + (bet.odds || 0), 0);
    setBalance(balance + totalBetAmount);
    setBets([]);
    setMessage('Bets cleared');
  };

  const formatBetName = (type: BetType): string => {
    const names: Record<BetType, string> = {
      pass: 'Pass Line',
      dontPass: "Don't Pass",
      come: 'Come',
      dontCome: "Don't Come",
      field: 'Field',
      place2: 'Place 2',
      place3: 'Place 3',
      place4: 'Place 4',
      place5: 'Place 5',
      place6: 'Place 6',
      place8: 'Place 8',
      place9: 'Place 9',
      place10: 'Place 10',
      place11: 'Place 11',
      place12: 'Place 12',
      hard4: 'Hard 4',
      hard6: 'Hard 6',
      hard8: 'Hard 8',
      hard10: 'Hard 10',
      anyCraps: 'Any Craps',
      any7: 'Any 7',
      'c&e': 'C & E',
      horn2: 'Horn 2',
      horn3: 'Horn 3',
      horn11: 'Horn 11',
      horn12: 'Horn 12'
    };
    return names[type] || type;
  };

  const getBetTotal = (type: BetType): number => {
    return bets
      .filter(bet => bet.type === type)
      .reduce((sum, bet) => sum + bet.amount, 0);
  };

  const renderDie = (die: Die) => {
    const dots: Record<number, number[][]> = {
      1: [[1, 1]],
      2: [[0, 0], [2, 2]],
      3: [[0, 0], [1, 1], [2, 2]],
      4: [[0, 0], [0, 2], [2, 0], [2, 2]],
      5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
      6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]]
    };

    return (
      <div className={`relative w-16 h-16 bg-white rounded-lg shadow-xl grid grid-cols-3 grid-rows-3 gap-1 p-2 ${die.rolling ? 'animate-spin' : ''}`}>
        {dots[die.value]?.map((pos, i) => (
          <div key={i} style={{ gridColumn: pos[1] + 1, gridRow: pos[0] + 1 }} className="flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-red-600 rounded-full"></div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-black p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => router.push('/casino')}
            className="text-white/60 hover:text-white transition-colors"
          >
            ← Back to Casino
          </button>
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (checkAndReload()) {
                  setBalance(25000);
                }
              }}
              disabled={balance >= 1000}
              className={`px-3 py-1 sm:px-4 sm:py-2 text-white rounded-lg transition-colors font-bold text-sm sm:text-base ${
                balance >= 1000 
                  ? 'bg-gray-600 cursor-not-allowed opacity-50' 
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              💵 Reload
            </button>
            <div className="text-2xl font-bold text-yellow-400">${balance.toLocaleString()}</div>
          </div>
        </div>

        {/* Game Info */}
        <div className="bg-black/40 rounded-lg p-2 sm:p-4 mb-2">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-3xl font-bold text-white">🎲 Craps</h1>
              {point === null ? (
                <span className="text-sm sm:text-lg text-green-400 font-bold">COME OUT</span>
              ) : (
                <span className="text-sm sm:text-lg text-yellow-400 font-bold">POINT: {point}</span>
              )}
            </div>
            <button
              onClick={() => setShowPayoutTable(!showPayoutTable)}
              className="px-2 py-1 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-xs sm:text-base"
            >
              {showPayoutTable ? 'Hide' : 'Payouts'}
            </button>
          </div>
          
          {showPayoutTable && (
            <div className="bg-black/60 p-2 sm:p-4 rounded-lg mt-2 grid grid-cols-2 gap-2 sm:gap-4 text-white text-xs sm:text-sm">
              <div>
                <h3 className="font-bold mb-1 text-yellow-400">Line Bets</h3>
                <p>Pass/Don&apos;t Pass: 1:1</p>
                <h3 className="font-bold mb-1 mt-2 text-yellow-400">Place Bets</h3>
                <p>2, 3, 11, 12: 11:1</p>
                <p>4, 10: 2:1</p>
                <p>5, 9: 3:2</p>
                <p>6, 8: 6:5</p>
              </div>
              <div>
                <h3 className="font-bold mb-1 text-yellow-400">Proposition Bets</h3>
                <p>Hard 4/10: 7:1</p>
                <p>Hard 6/8: 9:1</p>
                <p>Any Craps: 7:1</p>
                <p>Any 7: 4:1</p>
                <p>Horn 2/12: 30:1</p>
                <p>Horn 3/11: 15:1</p>
                <p>Field (2): 2:1</p>
                <p>Field (12): 3:1</p>
              </div>
            </div>
          )}

          <div className="text-white text-xs sm:text-base mt-2">{message}</div>
        </div>

        {/* Dice Display */}
        <div className="bg-green-800 rounded-lg p-3 sm:p-6 mb-2 flex justify-center items-center gap-2 sm:gap-4">
          {renderDie(dice[0])}
          {renderDie(dice[1])}
          <div className="text-2xl sm:text-4xl font-bold text-white ml-2 sm:ml-4">
            = {dice[0].value + dice[1].value}
          </div>
        </div>

        {/* Craps Table - Redesigned for mobile */}
        <div className="bg-green-700 rounded-2xl border-4 sm:border-8 border-yellow-800 p-2 sm:p-4 mb-20">
          {/* Top Row - Place Bets */}
          <div className="grid grid-cols-6 gap-1 mb-2">
            {[2, 3, 4, 5, 6, 8].map(num => (
              <button
                key={num}
                onClick={() => placeBet(`place${num}` as BetType)}
                className="relative bg-white border-2 border-black rounded p-1 sm:p-2 hover:bg-yellow-100 transition-colors"
              >
                <div className="text-center font-bold text-black text-sm sm:text-xl">{num === 6 ? 'Six' : num}</div>
                {getBetTotal(`place${num}` as BetType) > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-600 text-white px-1 rounded-full text-[8px] sm:text-xs font-bold">
                    ${getBetTotal(`place${num}` as BetType)}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Second Row - More Place Bets */}
          <div className="grid grid-cols-6 gap-1 mb-2">
            {[9, 10, 11, 12].map(num => (
              <button
                key={num}
                onClick={() => placeBet(`place${num}` as BetType)}
                className="relative bg-white border-2 border-black rounded p-1 sm:p-2 hover:bg-yellow-100 transition-colors"
              >
                <div className="text-center font-bold text-black text-sm sm:text-xl">{num === 9 ? 'Nine' : num}</div>
                {getBetTotal(`place${num}` as BetType) > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-600 text-white px-1 rounded-full text-[8px] sm:text-xs font-bold">
                    ${getBetTotal(`place${num}` as BetType)}
                  </div>
                )}
              </button>
            ))}
            <div className="col-span-2"></div>
          </div>

          {/* Main Layout */}
          <div className="grid grid-cols-12 gap-1 sm:gap-2">
            {/* Left Side - Hardways */}
            <div className="col-span-2 space-y-1">
              <div className="text-center text-[8px] sm:text-xs font-bold text-white bg-red-700 rounded p-0.5">HARD</div>
              {[4, 6, 8, 10].map(num => (
                <button
                  key={num}
                  onClick={() => placeBet(`hard${num}` as BetType)}
                  className="relative w-full bg-white border border-black rounded p-1 hover:bg-yellow-100 transition-colors"
                >
                  <div className="text-center font-bold text-black text-xs sm:text-base">{num}</div>
                  {getBetTotal(`hard${num}` as BetType) > 0 && (
                    <div className="absolute -top-1 -right-1 bg-red-600 text-white px-1 rounded-full text-[8px] font-bold">
                      ${getBetTotal(`hard${num}` as BetType)}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Center - Come/Field/Pass */}
            <div className="col-span-10 space-y-1">
              {/* Come */}
              <button
                onClick={() => placeBet('come')}
                className="relative w-full bg-blue-100 border-2 border-black rounded p-2 sm:p-3 hover:bg-blue-200 transition-colors"
              >
                <div className="text-center font-bold text-black text-sm sm:text-xl">COME</div>
                {getBetTotal('come') > 0 && (
                  <div className="absolute top-1 right-1 bg-red-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                    ${getBetTotal('come')}
                  </div>
                )}
              </button>

              {/* Field */}
              <button
                onClick={() => placeBet('field')}
                className="relative w-full bg-white border-2 border-black rounded p-2 sm:p-3 hover:bg-yellow-100 transition-colors"
              >
                <div className="text-center font-bold text-black text-xs sm:text-base">
                  FIELD • 2 3 4 9 10 11 12
                </div>
                <div className="text-center text-[8px] sm:text-xs text-black">(2→2:1, 12→3:1)</div>
                {getBetTotal('field') > 0 && (
                  <div className="absolute top-1 right-1 bg-red-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                    ${getBetTotal('field')}
                  </div>
                )}
              </button>

              {/* Pass Line */}
              <button
                onClick={() => placeBet('pass')}
                className="relative w-full bg-white border-4 border-yellow-500 rounded p-2 sm:p-4 hover:bg-yellow-100 transition-colors"
              >
                <div className="text-center font-bold text-black text-base sm:text-2xl">PASS LINE</div>
                {getBetTotal('pass') > 0 && (
                  <div className="absolute top-1 right-1 bg-red-600 text-white px-2 py-1 rounded-full text-xs sm:text-sm font-bold">
                    ${getBetTotal('pass')}
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Bottom Row - Proposition Bets */}
          <div className="grid grid-cols-12 gap-1 sm:gap-2 mt-1 sm:mt-2">
            {/* Horn Bets */}
            <div className="col-span-4 grid grid-cols-2 gap-1">
              <div className="col-span-2 text-center text-[8px] sm:text-xs font-bold text-white bg-purple-700 rounded p-0.5">HORN</div>
              {[2, 3, 11, 12].map(num => (
                <button
                  key={num}
                  onClick={() => placeBet(`horn${num}` as BetType)}
                  className="relative bg-white border border-black rounded p-1 hover:bg-yellow-100 transition-colors"
                >
                  <div className="text-center font-bold text-black text-xs sm:text-base">{num}</div>
                  {getBetTotal(`horn${num}` as BetType) > 0 && (
                    <div className="absolute -top-1 -right-1 bg-red-600 text-white px-1 rounded-full text-[8px] font-bold">
                      ${getBetTotal(`horn${num}` as BetType)}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Any Craps & Seven */}
            <div className="col-span-4 space-y-1">
              <button
                onClick={() => placeBet('anyCraps')}
                className="relative w-full bg-white border border-black rounded p-1 sm:p-2 hover:bg-yellow-100 transition-colors"
              >
                <div className="text-center font-bold text-black text-xs sm:text-sm">Any Craps</div>
                <div className="text-center text-[8px] sm:text-xs text-black">7 to 1</div>
                {getBetTotal('anyCraps') > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-600 text-white px-1 rounded-full text-[8px] font-bold">
                    ${getBetTotal('anyCraps')}
                  </div>
                )}
              </button>
              <button
                onClick={() => placeBet('any7')}
                className="relative w-full bg-red-600 border border-black rounded p-1 sm:p-2 hover:bg-red-700 transition-colors"
              >
                <div className="text-center font-bold text-white text-xs sm:text-sm">Seven</div>
                <div className="text-center text-[8px] sm:text-xs text-white">4 to 1</div>
                {getBetTotal('any7') > 0 && (
                  <div className="absolute -top-1 -right-1 bg-yellow-400 text-black px-1 rounded-full text-[8px] font-bold">
                    ${getBetTotal('any7')}
                  </div>
                )}
              </button>
            </div>

            {/* Don't Pass */}
            <div className="col-span-4">
              <button
                onClick={() => placeBet('dontPass')}
                className="relative w-full h-full bg-black border-2 border-white rounded p-2 sm:p-3 hover:bg-gray-800 transition-colors"
              >
                <div className="text-center font-bold text-white text-xs sm:text-base">DON&apos;T PASS</div>
                {getBetTotal('dontPass') > 0 && (
                  <div className="absolute top-1 right-1 bg-red-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                    ${getBetTotal('dontPass')}
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Betting Controls - Fixed at bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-lg border-t border-white/20 p-2 sm:p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col gap-2">
              {/* Bet Amount Selection */}
              <div className="flex gap-1 sm:gap-2">
                {[5, 10, 25, 50, 100].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setBetAmount(amount)}
                    className={`flex-1 py-1 sm:py-2 rounded-lg font-bold transition-colors text-xs sm:text-base ${
                      betAmount === amount
                        ? 'bg-yellow-500 text-black'
                        : 'bg-gray-700 text-white hover:bg-gray-600'
                    }`}
                  >
                    ${amount}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={rollDice}
                  disabled={rolling || bets.length === 0}
                  className="flex-1 py-2 sm:py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm sm:text-xl transition-colors"
                >
                  {rolling ? 'Rolling...' : 'ROLL DICE'}
                </button>
                <button
                  onClick={clearBets}
                  disabled={bets.length === 0}
                  className="px-3 sm:px-6 py-2 sm:py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm sm:text-base transition-colors"
                >
                  Clear
                </button>
              </div>

              {/* Active Bets Display */}
              {bets.length > 0 && (
                <div className="bg-black/60 rounded-lg p-2">
                  <div className="text-white font-bold mb-1 text-xs sm:text-sm">Active Bets:</div>
                  <div className="flex gap-1 flex-wrap">
                    {bets.map((bet, index) => (
                      <div key={index} className="bg-yellow-600 text-black px-2 py-1 rounded text-xs font-bold">
                        {formatBetName(bet.type)}: ${bet.amount}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Roll History */}
        {history.length > 0 && (
          <div className="bg-black/40 rounded-lg p-2 sm:p-4 mb-24">
            <div className="text-white font-bold mb-2 text-xs sm:text-base">Roll History:</div>
            <div className="flex gap-1 sm:gap-2 flex-wrap">
              {history.slice(-20).map((roll, index) => (
                <div
                  key={index}
                  className={`w-6 h-6 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-base ${
                    roll === 7 ? 'bg-red-600 text-white' : 'bg-yellow-500 text-black'
                  }`}
                >
                  {roll}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
