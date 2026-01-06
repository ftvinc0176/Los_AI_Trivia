'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

interface Card {
  suit: string;
  value: string;
  numValue: number;
}

type GamePhase = 'betting' | 'preflop' | 'flop' | 'river' | 'showdown';

export default function UltimateTexasHoldem() {
  const router = useRouter();
  const { balance, setBalance, recordWin, checkAndReload } = useCasino();

  const [phase, setPhase] = useState<GamePhase>('betting');
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [communityCards, setCommunityCards] = useState<Card[]>([]);
  
  const [anteBet, setAnteBet] = useState(0);
  const [blindBet, setBlindBet] = useState(0);
  const [tripsBet, setTripsBet] = useState(0);
  const [playBet, setPlayBet] = useState(0);
  const [chipValue, setChipValue] = useState(100);
  
  const [message, setMessage] = useState('Place your Ante and Blind bets to start!');
  const [canPlay4x, setCanPlay4x] = useState(false);
  const [canPlay2x, setCanPlay2x] = useState(false);
  const [canPlay1x, setCanPlay1x] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [winAmount, setWinAmount] = useState(0);
  const [playerHandRank, setPlayerHandRank] = useState<number>(0);
  const [tripsPayoutHit, setTripsPayoutHit] = useState<number>(0);
  const [blindPayoutHit, setBlindPayoutHit] = useState<number>(0);

  const createDeck = (): Card[] => {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const numValues = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    const newDeck: Card[] = [];

    for (let suit of suits) {
      for (let i = 0; i < values.length; i++) {
        newDeck.push({ suit, value: values[i], numValue: numValues[i] });
      }
    }

    return newDeck.sort(() => Math.random() - 0.5);
  };

  const dealHand = () => {
    if (anteBet === 0 || blindBet === 0) {
      setMessage('Place both Ante and Blind bets!');
      return;
    }

    if (balance < anteBet + blindBet + tripsBet) {
      setMessage('Insufficient balance!');
      return;
    }

    setBalance(balance - (anteBet + blindBet + tripsBet));

    const gameDeck = createDeck();
    const player = [gameDeck.pop()!, gameDeck.pop()!];
    const dealer = [gameDeck.pop()!, gameDeck.pop()!];

    setDeck(gameDeck);
    setPlayerCards(player);
    setDealerCards(dealer);
    setCommunityCards([]);
    setPhase('preflop');
    setCanPlay4x(true);
    setCanPlay2x(false);
    setCanPlay1x(false);
    setPlayBet(0);
    setMessage('Check your cards! Bet 3x or 4x now, or check to see the flop.');
    setResult(null);
    setWinAmount(0);
  };

  const handlePlay = (multiplier: number) => {
    const playAmount = anteBet * multiplier;
    
    if (balance < playAmount) {
      setMessage('Insufficient balance for play bet!');
      return;
    }

    setBalance(balance - playAmount);
    setPlayBet(playAmount);

    if (multiplier === 3 || multiplier === 4) {
      // Went 3x or 4x preflop, deal all community cards
      dealAllCommunity();
    } else if (multiplier === 2) {
      // Went 2x on flop, deal turn and river
      dealRiver();
    } else if (multiplier === 1) {
      // Went 1x on river
      dealRiver();
    }
  };

  const handleCheck = () => {
    if (phase === 'preflop') {
      // Check preflop, deal flop
      const gameDeck = [...deck];
      gameDeck.pop(); // Burn
      const flop = [gameDeck.pop()!, gameDeck.pop()!, gameDeck.pop()!];
      setCommunityCards(flop);
      setDeck(gameDeck);
      setPhase('flop');
      setCanPlay4x(false);
      setCanPlay2x(true);
      setMessage('Flop dealt! Bet 2x now or check to see turn and river.');
    } else if (phase === 'flop') {
      // Check flop, deal turn and river
      dealRiver();
      setPhase('river');
      setCanPlay2x(false);
      setCanPlay1x(true);
      setMessage('Turn and River dealt! You must bet 1x or fold.');
    }
  };

  const dealAllCommunity = () => {
    const gameDeck = [...deck];
    gameDeck.pop(); // Burn
    const community = [
      gameDeck.pop()!,
      gameDeck.pop()!,
      gameDeck.pop()!,
      gameDeck.pop()!,
      gameDeck.pop()!
    ];
    setCommunityCards(community);
    setDeck(gameDeck);
    resolveHand(community);
  };

  const dealRiver = () => {
    const gameDeck = [...deck];
    const currentCommunity = [...communityCards];
    
    while (currentCommunity.length < 5) {
      if (currentCommunity.length === 3) gameDeck.pop(); // Burn before turn
      currentCommunity.push(gameDeck.pop()!);
    }
    
    setCommunityCards(currentCommunity);
    setDeck(gameDeck);
    
    if (phase === 'river' || canPlay1x) {
      resolveHand(currentCommunity);
    }
  };

  const handleFold = () => {
    setMessage('You folded. Ante, Blind, and Trips lost.');
    setPhase('betting');
    setAnteBet(0);
    setBlindBet(0);
    setTripsBet(0);
    setPlayerCards([]);
    setDealerCards([]);
    setCommunityCards([]);
    
    if (balance < 100) {
      checkAndReload();
    }
  };

  const resolveHand = (community: Card[]) => {
    setPhase('showdown');
    
    const playerHand = evaluateHand([...playerCards, ...community]);
    const dealerHand = evaluateHand([...dealerCards, ...community]);
    
    setPlayerHandRank(playerHand.rank);
    
    let totalWin = 0;
    let resultMsg = '';

    // Check dealer qualification (pair or better)
    const dealerQualifies = dealerHand.rank >= 2;

    // Compare hands
    let playerWins = false;
    if (playerHand.rank > dealerHand.rank) {
      playerWins = true;
    } else if (playerHand.rank === dealerHand.rank) {
      // Compare tiebreakers
      for (let i = 0; i < playerHand.tiebreaker.length; i++) {
        if (playerHand.tiebreaker[i] > dealerHand.tiebreaker[i]) {
          playerWins = true;
          break;
        } else if (playerHand.tiebreaker[i] < dealerHand.tiebreaker[i]) {
          break;
        }
      }
    }

    // Pay Trips bet (pays regardless of dealer)
    let tripsMultiplier = 0;
    if (tripsBet > 0) {
      tripsMultiplier = getTripsMultiplier(playerHand.rank);
      if (tripsMultiplier > 0) {
        const tripsPayout = tripsBet * (tripsMultiplier + 1);
        totalWin += tripsPayout;
        setTripsPayoutHit(tripsMultiplier);
        resultMsg += `Trips pays ${tripsMultiplier}:1 ($${tripsPayout}). `;
      }
    }

    let blindMultiplier = 0;
    if (playerWins) {
      // Player wins
      resultMsg += `You win with ${playerHand.rankName}! `;
      
      // Ante pays 1:1
      totalWin += anteBet * 2;
      
      // Play bet pays 1:1
      if (playBet > 0) {
        totalWin += playBet * 2;
      }
      
      // Blind bet pays according to pay table
      blindMultiplier = getBlindMultiplier(playerHand.rank);
      if (blindMultiplier > 0) {
        totalWin += blindBet * (blindMultiplier + 1);
        setBlindPayoutHit(blindMultiplier);
        resultMsg += `Blind pays ${blindMultiplier}:1. `;
      } else {
        totalWin += blindBet; // Push
        resultMsg += 'Blind pushes. ';
      }
    } else {
      if (!dealerQualifies) {
        // Dealer doesn't qualify - Ante pushes, Blind and Play play
        resultMsg += `Dealer doesn't qualify (${dealerHand.rankName}). Ante pushes. `;
        totalWin += anteBet; // Return ante
        
        if (playBet > 0) {
          // Play bet still plays - player loses
          resultMsg += 'Play bet loses. ';
        }
        
        // Blind pushes
        totalWin += blindBet;
      } else {
        // Dealer wins and qualifies - player loses all
        resultMsg += `Dealer wins with ${dealerHand.rankName}. You lose.`;
      }
    }

    const profit = totalWin - (anteBet + blindBet + tripsBet + playBet);
    setWinAmount(totalWin);
    setResult(resultMsg);
    setMessage(resultMsg);
    setBalance(balance + totalWin);
    
    if (profit > 0) {
      recordWin(profit);
    }
  };

  const getTripsMultiplier = (rank: number): number => {
    // Trips pay table
    if (rank === 9) return 50; // Royal Flush
    if (rank === 8) return 40; // Straight Flush
    if (rank === 7) return 30; // Four of a Kind
    if (rank === 6) return 8;  // Full House
    if (rank === 5) return 7;  // Flush
    if (rank === 4) return 4;  // Straight
    if (rank === 3) return 3;  // Three of a Kind
    return 0; // No payout for less than trips
  };

  const getBlindMultiplier = (rank: number): number => {
    // Blind pay table
    if (rank === 9) return 500; // Royal Flush
    if (rank === 8) return 50;  // Straight Flush
    if (rank === 7) return 10;  // Four of a Kind
    if (rank === 6) return 3;   // Full House
    if (rank === 5) return 3;   // Flush
    if (rank === 4) return 1;   // Straight
    return 0; // Push for less than straight
  };

  const evaluateHand = (cards: Card[]): { rank: number; rankName: string; tiebreaker: number[] } => {
    const counts = new Map<number, number>();
    const suits = new Map<string, number>();
    
    cards.forEach(card => {
      counts.set(card.numValue, (counts.get(card.numValue) || 0) + 1);
      suits.set(card.suit, (suits.get(card.suit) || 0) + 1);
    });

    const values = Array.from(counts.keys()).sort((a, b) => b - a);
    const countArray = Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0] - a[0];
    });
    const isFlush = Array.from(suits.values()).some(count => count >= 5);
    
    // Check straight
    let isStraight = false;
    let straightHigh = 0;
    const sortedValues = [...new Set(cards.map(c => c.numValue))].sort((a, b) => b - a);
    for (let i = 0; i <= sortedValues.length - 5; i++) {
      if (sortedValues[i] - sortedValues[i + 4] === 4) {
        isStraight = true;
        straightHigh = sortedValues[i];
        break;
      }
    }
    // Check A-2-3-4-5 straight
    if (!isStraight && sortedValues.includes(14) && sortedValues.includes(2) && sortedValues.includes(3) && sortedValues.includes(4) && sortedValues.includes(5)) {
      isStraight = true;
      straightHigh = 5; // Wheel
    }

    // Check for royal flush
    const isRoyal = isStraight && straightHigh === 14 && isFlush;

    if (isRoyal) {
      return { rank: 9, rankName: 'Royal Flush', tiebreaker: [14] };
    } else if (isFlush && isStraight) {
      return { rank: 8, rankName: 'Straight Flush', tiebreaker: [straightHigh] };
    } else if (countArray[0][1] === 4) {
      return { rank: 7, rankName: 'Four of a Kind', tiebreaker: [countArray[0][0], countArray[1][0]] };
    } else if (countArray[0][1] === 3 && countArray[1][1] >= 2) {
      return { rank: 6, rankName: 'Full House', tiebreaker: [countArray[0][0], countArray[1][0]] };
    } else if (isFlush) {
      return { rank: 5, rankName: 'Flush', tiebreaker: values };
    } else if (isStraight) {
      return { rank: 4, rankName: 'Straight', tiebreaker: [straightHigh] };
    } else if (countArray[0][1] === 3) {
      return { rank: 3, rankName: 'Three of a Kind', tiebreaker: [countArray[0][0], countArray[1]?.[0] || 0, countArray[2]?.[0] || 0] };
    } else if (countArray[0][1] === 2 && countArray[1][1] === 2) {
      return { rank: 2, rankName: 'Two Pair', tiebreaker: [countArray[0][0], countArray[1][0], countArray[2][0]] };
    } else if (countArray[0][1] === 2) {
      return { rank: 1, rankName: 'Pair', tiebreaker: [countArray[0][0], countArray[1]?.[0] || 0, countArray[2]?.[0] || 0] };
    } else {
      return { rank: 0, rankName: 'High Card', tiebreaker: values };
    }
  };

  const placeBet = (type: 'ante' | 'blind' | 'trips') => {
    if (phase !== 'betting') return;
    
    if (balance < chipValue) {
      setMessage('Insufficient balance!');
      return;
    }

    if (type === 'ante') {
      setAnteBet(anteBet + chipValue);
      setMessage(`Ante bet: $${anteBet + chipValue}`);
    } else if (type === 'blind') {
      setBlindBet(blindBet + chipValue);
      setMessage(`Blind bet: $${blindBet + chipValue}`);
    } else if (type === 'trips') {
      setTripsBet(tripsBet + chipValue);
      setMessage(`Trips bet: $${tripsBet + chipValue}`);
    }
  };

  const resetBets = () => {
    setAnteBet(0);
    setBlindBet(0);
    setTripsBet(0);
    setPlayBet(0);
    setPhase('betting');
    setPlayerCards([]);
    setDealerCards([]);
    setCommunityCards([]);
    setMessage('Place your Ante and Blind bets to start!');
    setResult(null);
    setPlayerHandRank(0);
    setTripsPayoutHit(0);
    setBlindPayoutHit(0);
  };

  const clearBets = () => {
    setAnteBet(0);
    setBlindBet(0);
    setTripsBet(0);
    setMessage('Bets cleared. Place your bets!');
  };

  const renderCard = (card: Card, hidden = false) => {
    if (hidden) {
      return (
        <div className="w-16 h-24 bg-blue-600 rounded-lg border-2 border-white flex items-center justify-center">
          <div className="text-white text-2xl">🂠</div>
        </div>
      );
    }

    const color = card.suit === '♥' || card.suit === '♦' ? 'text-red-600' : 'text-black';
    return (
      <div className="w-16 h-24 bg-white rounded-lg border-2 border-gray-300 flex flex-col items-center justify-between p-1">
        <div className={`text-sm font-bold ${color}`}>{card.value}</div>
        <div className={`text-2xl ${color}`}>{card.suit}</div>
        <div className={`text-sm font-bold ${color}`}>{card.value}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4 bg-black/40 rounded-lg p-4">
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
                  // Balance was reloaded
                }
              }}
              disabled={balance >= 1000}
              className={`px-3 py-1 text-white rounded-lg transition-colors font-bold ${
                balance >= 1000 
                  ? 'bg-gray-600 cursor-not-allowed opacity-50' 
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              💵 Reload
            </button>
            <div className="text-2xl font-bold text-green-400">${balance.toLocaleString()}</div>
          </div>
        </div>

        <div className="text-center mb-4">
          <h1 className="text-4xl font-bold text-yellow-400 mb-2">Ultimate Texas Hold&apos;em</h1>
          <div className="text-white text-lg">{message}</div>
        </div>

        {/* Dealer Area */}
        <div className="bg-green-800/50 rounded-lg p-4 mb-4">
          <div className="text-white font-bold mb-2">Dealer</div>
          <div className="flex gap-2 justify-center">
            {dealerCards.length > 0 && dealerCards.map((card, i) => (
              <div key={i}>{renderCard(card, phase !== 'showdown')}</div>
            ))}
          </div>
        </div>

        {/* Community Cards */}
        <div className="bg-green-700/50 rounded-2xl p-6 mb-4">
          <div className="flex justify-center gap-2 mb-2">
            {communityCards.length > 0 ? (
              communityCards.map((card, i) => <div key={i}>{renderCard(card)}</div>)
            ) : (
              <div className="text-white/60">Community cards will appear here</div>
            )}
          </div>
        </div>

        {/* Player Area */}
        <div className="bg-blue-800 rounded-lg p-6 mb-4">
          <div className="text-white font-bold mb-2 text-xl">Your Hand</div>
          <div className="flex gap-2 mb-4 justify-center">
            {playerCards.length > 0 ? (
              playerCards.map((card, i) => <div key={i}>{renderCard(card)}</div>)
            ) : (
              <div className="text-white/60">Your cards will appear here</div>
            )}
          </div>

          {/* Betting Area */}
          {phase === 'betting' && (
            <div className="space-y-4">
              {/* Chip Selector */}
              <div className="grid grid-cols-6 gap-2">
                {[100, 500, 1000, 5000, 10000, 25000].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setChipValue(amount)}
                    className={`py-2 px-1 rounded-full font-bold transition-all text-xs sm:text-sm ${
                      chipValue === amount
                        ? amount === 100 ? 'bg-white text-black ring-4 ring-yellow-400' :
                          amount === 500 ? 'bg-red-500 text-white ring-4 ring-yellow-400' :
                          amount === 1000 ? 'bg-blue-500 text-white ring-4 ring-yellow-400' :
                          amount === 5000 ? 'bg-green-500 text-white ring-4 ring-yellow-400' :
                          amount === 10000 ? 'bg-orange-500 text-white ring-4 ring-yellow-400' :
                          'bg-purple-600 text-white ring-4 ring-yellow-400'
                        : amount === 100 ? 'bg-white text-black hover:bg-gray-200' :
                          amount === 500 ? 'bg-red-500 text-white hover:bg-red-600' :
                          amount === 1000 ? 'bg-blue-500 text-white hover:bg-blue-600' :
                          amount === 5000 ? 'bg-green-500 text-white hover:bg-green-600' :
                          amount === 10000 ? 'bg-orange-500 text-white hover:bg-orange-600' :
                          'bg-purple-600 text-white hover:bg-purple-700'
                    }`}
                  >
                    ${amount >= 1000 ? `${amount / 1000}K` : amount}
                  </button>
                ))}
              </div>

              {/* Betting Spots */}
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => placeBet('ante')}
                  className="relative py-8 bg-gradient-to-br from-green-700 to-green-900 hover:from-green-600 hover:to-green-800 text-white rounded-xl font-bold border-4 border-yellow-600 transition-all"
                >
                  <div className="text-sm mb-1">ANTE</div>
                  {anteBet > 0 && (
                    <div className="text-2xl font-bold text-yellow-400">${anteBet.toLocaleString()}</div>
                  )}
                  {anteBet === 0 && (
                    <div className="text-white/60 text-sm">Click to bet</div>
                  )}
                </button>
                
                <button
                  onClick={() => placeBet('blind')}
                  className="relative py-8 bg-gradient-to-br from-blue-700 to-blue-900 hover:from-blue-600 hover:to-blue-800 text-white rounded-xl font-bold border-4 border-yellow-600 transition-all"
                >
                  <div className="text-sm mb-1">BLIND</div>
                  {blindBet > 0 && (
                    <div className="text-2xl font-bold text-yellow-400">${blindBet.toLocaleString()}</div>
                  )}
                  {blindBet === 0 && (
                    <div className="text-white/60 text-sm">Click to bet</div>
                  )}
                </button>
                
                <button
                  onClick={() => placeBet('trips')}
                  className="relative py-8 bg-gradient-to-br from-purple-700 to-purple-900 hover:from-purple-600 hover:to-purple-800 text-white rounded-xl font-bold border-4 border-yellow-600 transition-all"
                >
                  <div className="text-sm mb-1">TRIPS</div>
                  <div className="text-[8px] text-white/60 mb-1">(Optional)</div>
                  {tripsBet > 0 && (
                    <div className="text-2xl font-bold text-yellow-400">${tripsBet.toLocaleString()}</div>
                  )}
                  {tripsBet === 0 && (
                    <div className="text-white/60 text-sm">Click to bet</div>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={clearBets}
                  className="py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold"
                >
                  Clear Bets
                </button>
                <button
                  onClick={dealHand}
                  disabled={anteBet === 0 || blindBet === 0}
                  className="py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-bold text-xl"
                >
                  DEAL
                </button>
              </div>
            </div>
          )}

          {/* Play Actions */}
          {phase === 'preflop' && canPlay4x && (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handlePlay(4)}
                className="py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold"
              >
                Play 4x (${anteBet * 4})
              </button>
              <button
                onClick={() => handlePlay(3)}
                className="py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold"
              >
                Play 3x (${anteBet * 3})
              </button>
              <button
                onClick={handleCheck}
                className="py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
              >
                Check
              </button>
            </div>
          )}

          {phase === 'flop' && canPlay2x && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handlePlay(2)}
                className="py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold"
              >
                Play 2x (${anteBet * 2})
              </button>
              <button
                onClick={handleCheck}
                className="py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
              >
                Check
              </button>
            </div>
          )}

          {phase === 'river' && canPlay1x && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handlePlay(1)}
                className="py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-bold"
              >
                Play 1x (${anteBet})
              </button>
              <button
                onClick={handleFold}
                className="py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold"
              >
                Fold
              </button>
            </div>
          )}

          {phase === 'showdown' && (
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400 mb-2">{result}</div>
              {winAmount > 0 && (
                <div className="text-xl text-green-400 mb-2">Won: ${winAmount.toLocaleString()}</div>
              )}
              <button
                onClick={resetBets}
                className="mt-4 py-3 px-6 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold"
              >
                New Hand
              </button>
            </div>
          )}
        </div>

        {/* Pay Tables */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-black/40 p-4 rounded-lg border-2 border-white/20">
            <h3 className="text-yellow-400 font-bold mb-3 text-lg">Blind Pays</h3>
            <div className="text-white text-sm space-y-1">
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 9 && blindPayoutHit === 500 ? 'bg-green-600 font-bold' : ''}`}>
                Royal Flush: 500:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 8 && blindPayoutHit === 50 ? 'bg-green-600 font-bold' : ''}`}>
                Straight Flush: 50:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 7 && blindPayoutHit === 10 ? 'bg-green-600 font-bold' : ''}`}>
                Four of a Kind: 10:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 6 && blindPayoutHit === 3 ? 'bg-green-600 font-bold' : ''}`}>
                Full House: 3:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 5 && blindPayoutHit === 3 ? 'bg-green-600 font-bold' : ''}`}>
                Flush: 3:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 4 && blindPayoutHit === 1 ? 'bg-green-600 font-bold' : ''}`}>
                Straight: 1:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank < 4 && blindPayoutHit === 0 ? 'bg-yellow-600 font-bold' : ''}`}>
                Less than Straight: Push
              </div>
            </div>
          </div>
          <div className="bg-black/40 p-4 rounded-lg border-2 border-white/20">
            <h3 className="text-purple-400 font-bold mb-3 text-lg">Trips Pays</h3>
            <div className="text-white text-sm space-y-1">
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 9 && tripsPayoutHit === 50 ? 'bg-green-600 font-bold' : ''}`}>
                Royal Flush: 50:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 8 && tripsPayoutHit === 40 ? 'bg-green-600 font-bold' : ''}`}>
                Straight Flush: 40:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 7 && tripsPayoutHit === 30 ? 'bg-green-600 font-bold' : ''}`}>
                Four of a Kind: 30:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 6 && tripsPayoutHit === 8 ? 'bg-green-600 font-bold' : ''}`}>
                Full House: 8:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 5 && tripsPayoutHit === 7 ? 'bg-green-600 font-bold' : ''}`}>
                Flush: 7:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 4 && tripsPayoutHit === 4 ? 'bg-green-600 font-bold' : ''}`}>
                Straight: 4:1
              </div>
              <div className={`p-2 rounded ${phase === 'showdown' && playerHandRank === 3 && tripsPayoutHit === 3 ? 'bg-green-600 font-bold' : ''}`}>
                Three of a Kind: 3:1
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
