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
    let newBets = [...bets];
    let newBalance = balance;
    let msg = '';

    // Come-out roll (no point established)
    if (point === null) {
      // CRAPLESS CRAPS: Only 7 wins on come-out, 2,3,11,12 become points
      if (total === 7) {
        msg = '7 - Winner! Pass Line wins!';
        newBets.forEach(bet => {
          if (bet.type === 'pass') {
            winnings += bet.amount * 2; // 1:1 payout
          } else if (bet.type === 'dontPass') {
            // Don't pass loses
          }
        });
        newBets = newBets.filter(bet => bet.type !== 'pass' && bet.type !== 'dontPass');
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
        newBets.forEach(bet => {
          if (bet.type === 'pass') {
            winnings += bet.amount * 2; // 1:1 on pass line
            if (bet.odds) {
              // Odds payouts based on point number
              const oddsMultiplier = getOddsMultiplier(point);
              winnings += bet.odds * oddsMultiplier;
            }
          } else if (bet.type === 'dontPass') {
            // Don't pass loses
          }
        });
        newBets = newBets.filter(bet => bet.type !== 'pass' && bet.type !== 'dontPass');
        setPoint(null);
      } else if (total === 7) {
        msg = '7 out! Don\'t Pass wins!';
        newBets.forEach(bet => {
          if (bet.type === 'dontPass') {
            winnings += bet.amount * 2; // 1:1 payout
          } else if (bet.type === 'pass') {
            // Pass line loses
          }
        });
        newBets = newBets.filter(bet => bet.type !== 'pass' && bet.type !== 'dontPass');
        setPoint(null);
      } else {
        msg = `Rolled ${total}`;
      }
    }

    // Process place bets
    newBets.forEach(bet => {
      if (bet.type.startsWith('place')) {
        const placeNum = parseInt(bet.type.replace('place', ''));
        if (total === placeNum) {
          const payout = getPlaceBetPayout(placeNum, bet.amount);
          winnings += payout;
          msg += ` - Place ${placeNum} wins!`;
        }
      }
    });

    // Process field bet
    const fieldBet = newBets.find(bet => bet.type === 'field');
    if (fieldBet) {
      if ([2, 3, 4, 9, 10, 11, 12].includes(total)) {
        if (total === 2) {
          winnings += fieldBet.amount * 3; // 2:1 payout on 2
          msg += ' - Field pays 2:1!';
        } else if (total === 12) {
          winnings += fieldBet.amount * 4; // 3:1 payout on 12
          msg += ' - Field pays 3:1!';
        } else {
          winnings += fieldBet.amount * 2; // 1:1 payout
          msg += ' - Field wins!';
        }
        newBets = newBets.filter(bet => bet.type !== 'field');
      } else {
        // Field loses on 5,6,7,8
        newBets = newBets.filter(bet => bet.type !== 'field');
        msg += ' - Field loses';
      }
    }

    // Process hardways
    if (die1 === die2) { // Hard way rolled
      const hardNum = total;
      newBets.forEach(bet => {
        if (bet.type === `hard${hardNum}`) {
          const payout = getHardwayPayout(hardNum, bet.amount);
          winnings += payout;
          msg += ` - Hard ${hardNum} wins!`;
        }
      });
    } else {
      // Easy way rolled - check if it matches any hardway bets
      if ([4, 6, 8, 10].includes(total)) {
        newBets = newBets.filter(bet => bet.type !== `hard${total}`);
      }
    }
    
    // Check if 7 was rolled (kills all hardways)
    if (total === 7) {
      newBets = newBets.filter(bet => !bet.type.startsWith('hard'));
    }

    // Process proposition bets
    const anyCrapsBet = newBets.find(bet => bet.type === 'anyCraps');
    if (anyCrapsBet && [2, 3, 12].includes(total)) {
      winnings += anyCrapsBet.amount * 8; // 7:1 payout
      msg += ' - Any Craps wins!';
      newBets = newBets.filter(bet => bet.type !== 'anyCraps');
    } else if (anyCrapsBet) {
      newBets = newBets.filter(bet => bet.type !== 'anyCraps');
    }

    const any7Bet = newBets.find(bet => bet.type === 'any7');
    if (any7Bet && total === 7) {
      winnings += any7Bet.amount * 5; // 4:1 payout
      msg += ' - Any 7 wins!';
      newBets = newBets.filter(bet => bet.type !== 'any7');
    } else if (any7Bet) {
      newBets = newBets.filter(bet => bet.type !== 'any7');
    }

    // Process horn bets
    ['horn2', 'horn3', 'horn11', 'horn12'].forEach(hornType => {
      const hornBet = newBets.find(bet => bet.type === hornType);
      if (hornBet) {
        const hornNum = parseInt(hornType.replace('horn', ''));
        if (total === hornNum) {
          const payout = getHornPayout(hornNum, hornBet.amount);
          winnings += payout;
          msg += ` - Horn ${hornNum} wins!`;
        }
        newBets = newBets.filter(bet => bet.type !== hornType);
      }
    });

    newBalance += winnings;
    setBalance(newBalance);
    setBets(newBets);
    setMessage(msg);

    if (winnings > 0) {
      recordWin(winnings);
    }

    // Check if reload needed
    setTimeout(() => checkAndReload(), 100);
  };

  const getOddsMultiplier = (point: number): number => {
    // True odds payouts for crapless craps
    switch (point) {
      case 2:
      case 12:
        return 7; // 6:1
      case 3:
      case 11:
        return 4; // 3:1
      case 4:
      case 10:
        return 3; // 2:1
      case 5:
      case 9:
        return 2.5; // 3:2
      case 6:
      case 8:
        return 2.2; // 6:5
      default:
        return 2;
    }
  };

  const getPlaceBetPayout = (num: number, amount: number): number => {
    switch (num) {
      case 2:
      case 12:
        return amount + (amount * 11); // 11:1
      case 3:
      case 11:
        return amount + (amount * 11); // 11:1
      case 4:
      case 10:
        return amount + (amount * 2); // 2:1
      case 5:
      case 9:
        return amount + (amount * 1.5); // 3:2
      case 6:
      case 8:
        return amount + (amount * 1.2); // 6:5
      default:
        return amount;
    }
  };

  const getHardwayPayout = (num: number, amount: number): number => {
    switch (num) {
      case 4:
      case 10:
        return amount + (amount * 7); // 7:1
      case 6:
      case 8:
        return amount + (amount * 9); // 9:1
      default:
        return amount;
    }
  };

  const getHornPayout = (num: number, amount: number): number => {
    switch (num) {
      case 2:
      case 12:
        return amount + (amount * 30); // 30:1
      case 3:
      case 11:
        return amount + (amount * 15); // 15:1
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
        <div className="bg-black/40 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-3xl font-bold text-white">🎲 Crapless Craps</h1>
            <button
              onClick={() => setShowPayoutTable(!showPayoutTable)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              {showPayoutTable ? 'Hide' : 'Show'} Payouts
            </button>
          </div>
          
          {showPayoutTable && (
            <div className="bg-black/60 p-4 rounded-lg mb-4 grid grid-cols-2 gap-4 text-white text-sm">
              <div>
                <h3 className="font-bold mb-2 text-yellow-400">Line Bets</h3>
                <p>Pass/Don't Pass: 1:1</p>
                <h3 className="font-bold mb-2 mt-3 text-yellow-400">Place Bets</h3>
                <p>2, 3, 11, 12: 11:1</p>
                <p>4, 10: 2:1</p>
                <p>5, 9: 3:2</p>
                <p>6, 8: 6:5</p>
              </div>
              <div>
                <h3 className="font-bold mb-2 text-yellow-400">Proposition Bets</h3>
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

          <div className="flex justify-between items-center text-white">
            <div className="text-xl">
              {point === null ? (
                <span className="text-green-400">COME OUT ROLL</span>
              ) : (
                <span className="text-yellow-400">POINT: {point}</span>
              )}
            </div>
            <div className="text-lg">{message}</div>
          </div>
        </div>

        {/* Dice Display */}
        <div className="bg-green-800 rounded-lg p-8 mb-4 flex justify-center items-center gap-4">
          {renderDie(dice[0])}
          {renderDie(dice[1])}
          <div className="text-4xl font-bold text-white ml-4">
            = {dice[0].value + dice[1].value}
          </div>
        </div>

        {/* Craps Table */}
        <div className="bg-green-700 rounded-3xl border-8 border-yellow-800 p-6 mb-4">
          {/* Pass Line and Don't Pass */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <button
              onClick={() => placeBet('pass')}
              className="relative bg-white border-4 border-black rounded-lg p-6 hover:bg-yellow-100 transition-colors"
            >
              <div className="text-center font-bold text-black text-xl">PASS LINE</div>
              {getBetTotal('pass') > 0 && (
                <div className="absolute top-2 right-2 bg-red-600 text-white px-3 py-1 rounded-full font-bold">
                  ${getBetTotal('pass')}
                </div>
              )}
            </button>
            <button
              onClick={() => placeBet('dontPass')}
              className="relative bg-black border-4 border-white rounded-lg p-6 hover:bg-gray-800 transition-colors"
            >
              <div className="text-center font-bold text-white text-xl">DON'T PASS</div>
              {getBetTotal('dontPass') > 0 && (
                <div className="absolute top-2 right-2 bg-red-600 text-white px-3 py-1 rounded-full font-bold">
                  ${getBetTotal('dontPass')}
                </div>
              )}
            </button>
          </div>

          {/* Place Bets */}
          <div className="bg-yellow-600 rounded-lg p-4 mb-4">
            <div className="text-center font-bold text-black mb-3">PLACE BETS</div>
            <div className="grid grid-cols-6 gap-2">
              {[2, 3, 4, 5, 6, 8].map(num => (
                <button
                  key={num}
                  onClick={() => placeBet(`place${num}` as BetType)}
                  className="relative bg-white border-2 border-black rounded-lg p-4 hover:bg-yellow-100 transition-colors"
                >
                  <div className="text-center font-bold text-black text-2xl">{num}</div>
                  {getBetTotal(`place${num}` as BetType) > 0 && (
                    <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                      ${getBetTotal(`place${num}` as BetType)}
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-2 mt-2">
              {[9, 10, 11, 12].map(num => (
                <button
                  key={num}
                  onClick={() => placeBet(`place${num}` as BetType)}
                  className="relative bg-white border-2 border-black rounded-lg p-4 hover:bg-yellow-100 transition-colors"
                >
                  <div className="text-center font-bold text-black text-2xl">{num}</div>
                  {getBetTotal(`place${num}` as BetType) > 0 && (
                    <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                      ${getBetTotal(`place${num}` as BetType)}
                    </div>
                  )}
                </button>
              ))}
              <div className="col-span-2"></div>
            </div>
          </div>

          {/* Field Bet */}
          <button
            onClick={() => placeBet('field')}
            className="relative w-full bg-white border-4 border-black rounded-lg p-6 mb-4 hover:bg-yellow-100 transition-colors"
          >
            <div className="text-center font-bold text-black text-xl">
              FIELD • 2 3 4 9 10 11 12 • (2 pays 2:1, 12 pays 3:1)
            </div>
            {getBetTotal('field') > 0 && (
              <div className="absolute top-2 right-2 bg-red-600 text-white px-3 py-1 rounded-full font-bold">
                ${getBetTotal('field')}
              </div>
            )}
          </button>

          {/* Proposition Bets */}
          <div className="grid grid-cols-3 gap-4">
            {/* Hardways */}
            <div className="bg-red-700 rounded-lg p-4">
              <div className="text-center font-bold text-white mb-2">HARDWAYS</div>
              <div className="grid grid-cols-2 gap-2">
                {[4, 6, 8, 10].map(num => (
                  <button
                    key={num}
                    onClick={() => placeBet(`hard${num}` as BetType)}
                    className="relative bg-white border-2 border-black rounded-lg p-3 hover:bg-yellow-100 transition-colors"
                  >
                    <div className="text-center font-bold text-black">H{num}</div>
                    {getBetTotal(`hard${num}` as BetType) > 0 && (
                      <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                        ${getBetTotal(`hard${num}` as BetType)}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* One Roll Bets */}
            <div className="bg-blue-700 rounded-lg p-4">
              <div className="text-center font-bold text-white mb-2">ONE ROLL</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => placeBet('anyCraps')}
                  className="relative bg-white border-2 border-black rounded-lg p-3 hover:bg-yellow-100 transition-colors"
                >
                  <div className="text-center font-bold text-black text-xs">ANY CRAPS</div>
                  {getBetTotal('anyCraps') > 0 && (
                    <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                      ${getBetTotal('anyCraps')}
                    </div>
                  )}
                </button>
                <button
                  onClick={() => placeBet('any7')}
                  className="relative bg-white border-2 border-black rounded-lg p-3 hover:bg-yellow-100 transition-colors"
                >
                  <div className="text-center font-bold text-black text-xs">ANY 7</div>
                  {getBetTotal('any7') > 0 && (
                    <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                      ${getBetTotal('any7')}
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* Horn Bets */}
            <div className="bg-purple-700 rounded-lg p-4">
              <div className="text-center font-bold text-white mb-2">HORN</div>
              <div className="grid grid-cols-2 gap-2">
                {[2, 3, 11, 12].map(num => (
                  <button
                    key={num}
                    onClick={() => placeBet(`horn${num}` as BetType)}
                    className="relative bg-white border-2 border-black rounded-lg p-3 hover:bg-yellow-100 transition-colors"
                  >
                    <div className="text-center font-bold text-black">{num}</div>
                    {getBetTotal(`horn${num}` as BetType) > 0 && (
                      <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                        ${getBetTotal(`horn${num}` as BetType)}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Betting Controls */}
        <div className="bg-black/40 rounded-lg p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-white font-bold mb-2">Bet Amount:</label>
              <div className="flex gap-2">
                {[5, 10, 25, 50, 100].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setBetAmount(amount)}
                    className={`flex-1 py-2 rounded-lg font-bold transition-colors ${
                      betAmount === amount
                        ? 'bg-yellow-500 text-black'
                        : 'bg-gray-700 text-white hover:bg-gray-600'
                    }`}
                  >
                    ${amount}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-4">
              <button
                onClick={rollDice}
                disabled={rolling || bets.length === 0}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-bold text-xl transition-colors"
              >
                {rolling ? 'Rolling...' : 'ROLL DICE'}
              </button>
              <button
                onClick={clearBets}
                disabled={bets.length === 0}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-colors"
              >
                Clear Bets
              </button>
            </div>
          </div>

          {/* Active Bets Display */}
          {bets.length > 0 && (
            <div className="bg-black/60 rounded-lg p-4">
              <div className="text-white font-bold mb-2">Active Bets:</div>
              <div className="grid grid-cols-4 gap-2">
                {bets.map((bet, index) => (
                  <div key={index} className="bg-yellow-600 text-black px-3 py-2 rounded-lg font-bold text-sm">
                    {formatBetName(bet.type)}: ${bet.amount}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Roll History */}
        {history.length > 0 && (
          <div className="mt-4 bg-black/40 rounded-lg p-4">
            <div className="text-white font-bold mb-2">Roll History:</div>
            <div className="flex gap-2 flex-wrap">
              {history.slice(-20).map((roll, index) => (
                <div
                  key={index}
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
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
