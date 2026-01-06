'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

interface Card {
  suit: string;
  value: string;
  numValue: number;
}

type GamePhase = 'betting' | 'preflop' | 'flop' | 'turn' | 'showdown' | 'result';

function UltimateTexasHoldemContent() {
  const router = useRouter();
  const { balance, setBalance, recordWin, checkAndReload } = useCasino();

  const [gamePhase, setGamePhase] = useState<GamePhase>('betting');
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [communityCards, setCommunityCards] = useState<Card[]>([]);
  
  const [anteAmount, setAnteAmount] = useState(0);
  const [blindAmount, setBlindAmount] = useState(0);
  const [tripsAmount, setTripsAmount] = useState(0);
  const [playAmount, setPlayAmount] = useState(0);
  
  const [betAmount, setBetAmount] = useState(100);
  const [message, setMessage] = useState('Place your Ante and Blind bets to begin');
  const [result, setResult] = useState('');
  const [payouts, setPayouts] = useState<{ label: string; amount: number }[]>([]);

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

  const dealInitialCards = () => {
    if (anteAmount === 0 || blindAmount === 0) {
      setMessage('You must place equal Ante and Blind bets!');
      return;
    }

    if (anteAmount !== blindAmount) {
      setMessage('Ante and Blind must be equal!');
      return;
    }

    const gameDeck = createDeck();
    const pCards: Card[] = [gameDeck.pop()!, gameDeck.pop()!];
    const dCards: Card[] = [gameDeck.pop()!, gameDeck.pop()!];

    setDeck(gameDeck);
    setPlayerCards(pCards);
    setDealerCards(dCards);
    setCommunityCards([]);
    setGamePhase('preflop');
    setMessage('Check or Play 4x your Ante');
    setResult('');
    setPayouts([]);
  };

  const playerAction = (action: 'play4x' | 'play2x' | 'play1x' | 'check' | 'fold') => {
    if (action === 'fold') {
      // Player folds - loses all bets
      setMessage(`You folded. Lost $${anteAmount + blindAmount + tripsAmount}`);
      setGamePhase('result');
      setResult('Dealer Wins - You Folded');
      setAnteAmount(0);
      setBlindAmount(0);
      setTripsAmount(0);
      return;
    }

    const gameDeck = [...deck];

    if (action === 'play4x') {
      const playBet = anteAmount * 4;
      if (balance < playBet) {
        setMessage('Insufficient balance for 4x Play bet!');
        return;
      }
      setBalance(balance - playBet);
      setPlayAmount(playBet);
      setMessage(`Play bet: $${playBet} (4x)`);
      
      // Deal all community cards and go straight to showdown
      const community: Card[] = [];
      for (let i = 0; i < 5; i++) {
        community.push(gameDeck.pop()!);
      }
      setCommunityCards(community);
      setDeck(gameDeck);
      setTimeout(() => resolveHand(community, playBet), 1500);
      setGamePhase('showdown');
    } else if (action === 'play2x') {
      const playBet = anteAmount * 2;
      if (balance < playBet) {
        setMessage('Insufficient balance for 2x Play bet!');
        return;
      }
      setBalance(balance - playBet);
      setPlayAmount(playBet);
      setMessage(`Play bet: $${playBet} (2x)`);
      
      // Deal remaining community cards and go to showdown
      const community = [...communityCards];
      while (community.length < 5) {
        community.push(gameDeck.pop()!);
      }
      setCommunityCards(community);
      setDeck(gameDeck);
      setTimeout(() => resolveHand(community, playBet), 1500);
      setGamePhase('showdown');
    } else if (action === 'play1x') {
      const playBet = anteAmount;
      if (balance < playBet) {
        setMessage('Insufficient balance for 1x Play bet!');
        return;
      }
      setBalance(balance - playBet);
      setPlayAmount(playBet);
      setMessage(`Play bet: $${playBet} (1x)`);
      
      setTimeout(() => resolveHand(communityCards, playBet), 1500);
      setGamePhase('showdown');
    } else if (action === 'check') {
      // Advance to next phase
      if (gamePhase === 'preflop') {
        // Deal flop
        const community: Card[] = [gameDeck.pop()!, gameDeck.pop()!, gameDeck.pop()!];
        setCommunityCards(community);
        setDeck(gameDeck);
        setGamePhase('flop');
        setMessage('Check or Play 2x your Ante');
      } else if (gamePhase === 'flop') {
        // Deal turn and river
        const community = [...communityCards, gameDeck.pop()!, gameDeck.pop()!];
        setCommunityCards(community);
        setDeck(gameDeck);
        setGamePhase('turn');
        setMessage('Play 1x your Ante or Fold');
      }
    }
  };

  const resolveHand = (community: Card[], playBet: number) => {
    const playerHand = evaluateHand([...playerCards, ...community]);
    const dealerHand = evaluateHand([...dealerCards, ...community]);

    let winnings = 0;
    const payoutDetails: { label: string; amount: number }[] = [];

    // Check Trips bet first (pays regardless of dealer)
    if (tripsAmount > 0) {
      const tripsPayout = getTripsPayout(playerHand.rank);
      if (tripsPayout > 0) {
        const tripsWin = tripsAmount * (tripsPayout + 1);
        winnings += tripsWin;
        payoutDetails.push({ label: `Trips (${playerHand.rankName})`, amount: tripsWin });
      }
    }

    // Dealer needs at least a pair to qualify
    const dealerQualifies = dealerHand.rank >= 2; // Pair or better

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

    if (playerWins) {
      // Player wins
      // Play bet pays 1:1
      winnings += playBet * 2;
      payoutDetails.push({ label: 'Play Bet', amount: playBet * 2 });

      // Ante pays 1:1 only if dealer qualified
      if (dealerQualifies) {
        winnings += anteAmount * 2;
        payoutDetails.push({ label: 'Ante', amount: anteAmount * 2 });
      } else {
        // Ante pushes if dealer doesn't qualify
        winnings += anteAmount;
        payoutDetails.push({ label: 'Ante (Push)', amount: anteAmount });
      }

      // Blind pays according to pay table
      const blindPayout = getBlindPayout(playerHand.rank);
      if (blindPayout === -1) {
        // Push
        winnings += blindAmount;
        payoutDetails.push({ label: 'Blind (Push)', amount: blindAmount });
      } else {
        const blindWin = blindAmount * (blindPayout + 1);
        winnings += blindWin;
        payoutDetails.push({ label: `Blind (${playerHand.rankName})`, amount: blindWin });
      }

      setResult(`You Win! ${playerHand.rankName} beats ${dealerHand.rankName}`);
    } else if (playerHand.rank === dealerHand.rank && 
               JSON.stringify(playerHand.tiebreaker) === JSON.stringify(dealerHand.tiebreaker)) {
      // Tie - all bets push
      winnings += anteAmount + blindAmount + playBet;
      payoutDetails.push({ label: 'Ante (Push)', amount: anteAmount });
      payoutDetails.push({ label: 'Blind (Push)', amount: blindAmount });
      payoutDetails.push({ label: 'Play (Push)', amount: playBet });
      setResult(`Push! Both have ${playerHand.rankName}`);
    } else {
      // Dealer wins - player loses all bets
      setResult(`Dealer Wins! ${dealerHand.rankName} beats ${playerHand.rankName}`);
    }

    setBalance(balance + winnings);
    setPayouts(payoutDetails);
    setGamePhase('result');

    const profit = winnings - (anteAmount + blindAmount + tripsAmount + playBet);
    if (profit > 0) {
      recordWin(profit);
    }
  };

  const getTripsPayout = (rank: number): number => {
    // Trips side bet pay table
    if (rank === 9) return 50; // Royal Flush 50:1
    if (rank === 8) return 40; // Straight Flush 40:1
    if (rank === 7) return 30; // Four of a Kind 30:1
    if (rank === 6) return 8;  // Full House 8:1
    if (rank === 5) return 7;  // Flush 7:1
    if (rank === 4) return 4;  // Straight 4:1
    if (rank === 3) return 3;  // Three of a Kind 3:1
    return 0; // No payout for Two Pair, Pair, or High Card
  };

  const getBlindPayout = (rank: number): number => {
    // Blind bet pay table
    if (rank === 9) return 500; // Royal Flush 500:1
    if (rank === 8) return 50;  // Straight Flush 50:1
    if (rank === 7) return 10;  // Four of a Kind 10:1
    if (rank === 6) return 3;   // Full House 3:1
    if (rank === 5) return 1.5; // Flush 3:2
    if (rank === 4) return 1;   // Straight 1:1
    return -1; // Push for Three of a Kind or less
  };

  const evaluateHand = (cards: Card[]): { rank: number; rankName: string; tiebreaker: number[]; isRoyalFlush: boolean } => {
    // Get best 5 card combination from 7 cards
    const combinations: Card[][] = [];
    
    // Generate all 5-card combinations
    for (let i = 0; i < cards.length - 4; i++) {
      for (let j = i + 1; j < cards.length - 3; j++) {
        for (let k = j + 1; k < cards.length - 2; k++) {
          for (let l = k + 1; l < cards.length - 1; l++) {
            for (let m = l + 1; m < cards.length; m++) {
              combinations.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
            }
          }
        }
      }
    }

    let bestHand = { rank: 0, rankName: 'High Card', tiebreaker: [0], isRoyalFlush: false };

    for (const combo of combinations) {
      const hand = evaluateFiveCards(combo);
      if (hand.rank > bestHand.rank || 
          (hand.rank === bestHand.rank && compareArrays(hand.tiebreaker, bestHand.tiebreaker) > 0)) {
        bestHand = hand;
      }
    }

    return bestHand;
  };

  const compareArrays = (a: number[], b: number[]): number => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  };

  const evaluateFiveCards = (cards: Card[]): { rank: number; rankName: string; tiebreaker: number[]; isRoyalFlush: boolean } => {
    const values = cards.map(c => c.numValue).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    
    const valueCounts = new Map<number, number>();
    values.forEach(v => valueCounts.set(v, (valueCounts.get(v) || 0) + 1));
    
    const counts = Array.from(valueCounts.entries())
      .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    
    const isFlush = suits.every(s => s === suits[0]);
    
    // Check for straight
    let isStraight = false;
    const uniqueValues = [...new Set(values)].sort((a, b) => b - a);
    if (uniqueValues.length === 5) {
      if (uniqueValues[0] - uniqueValues[4] === 4) {
        isStraight = true;
      }
      // Check for A-2-3-4-5 (wheel)
      if (uniqueValues[0] === 14 && uniqueValues[1] === 5 && uniqueValues[2] === 4 && 
          uniqueValues[3] === 3 && uniqueValues[4] === 2) {
        isStraight = true;
        uniqueValues.splice(0, 1);
        uniqueValues.push(1); // Ace is low in wheel
      }
    }

    // Check for Royal Flush (10-J-Q-K-A suited)
    const isRoyalFlush = isFlush && isStraight && 
                         uniqueValues[0] === 14 && uniqueValues[4] === 10;

    if (isRoyalFlush) {
      return { rank: 9, rankName: 'Royal Flush', tiebreaker: values, isRoyalFlush: true };
    }
    if (isFlush && isStraight) {
      return { rank: 8, rankName: 'Straight Flush', tiebreaker: uniqueValues, isRoyalFlush: false };
    }
    if (counts[0][1] === 4) {
      return { rank: 7, rankName: 'Four of a Kind', tiebreaker: [counts[0][0], counts[1][0]], isRoyalFlush: false };
    }
    if (counts[0][1] === 3 && counts[1][1] === 2) {
      return { rank: 6, rankName: 'Full House', tiebreaker: [counts[0][0], counts[1][0]], isRoyalFlush: false };
    }
    if (isFlush) {
      return { rank: 5, rankName: 'Flush', tiebreaker: values, isRoyalFlush: false };
    }
    if (isStraight) {
      return { rank: 4, rankName: 'Straight', tiebreaker: uniqueValues, isRoyalFlush: false };
    }
    if (counts[0][1] === 3) {
      return { rank: 3, rankName: 'Three of a Kind', tiebreaker: [counts[0][0], counts[1][0], counts[2][0]], isRoyalFlush: false };
    }
    if (counts[0][1] === 2 && counts[1][1] === 2) {
      return { rank: 2, rankName: 'Two Pair', tiebreaker: [counts[0][0], counts[1][0], counts[2][0]], isRoyalFlush: false };
    }
    if (counts[0][1] === 2) {
      return { rank: 1, rankName: 'Pair', tiebreaker: [counts[0][0], counts[1][0], counts[2][0], counts[3][0]], isRoyalFlush: false };
    }
    return { rank: 0, rankName: 'High Card', tiebreaker: values, isRoyalFlush: false };
  };

  const placeBet = (type: 'ante' | 'blind' | 'trips') => {
    if (gamePhase !== 'betting') return;

    if (balance < betAmount) {
      setMessage('Insufficient balance!');
      return;
    }

    setBalance(balance - betAmount);

    if (type === 'ante') {
      setAnteAmount(anteAmount + betAmount);
      setMessage(`Ante: $${anteAmount + betAmount}`);
    } else if (type === 'blind') {
      setBlindAmount(blindAmount + betAmount);
      setMessage(`Blind: $${blindAmount + betAmount}`);
    } else if (type === 'trips') {
      setTripsAmount(tripsAmount + betAmount);
      setMessage(`Trips: $${tripsAmount + betAmount}`);
    }
  };

  const clearBets = () => {
    if (gamePhase !== 'betting') return;
    setBalance(balance + anteAmount + blindAmount + tripsAmount);
    setAnteAmount(0);
    setBlindAmount(0);
    setTripsAmount(0);
    setMessage('Bets cleared');
  };

  const newRound = () => {
    setGamePhase('betting');
    setAnteAmount(0);
    setBlindAmount(0);
    setTripsAmount(0);
    setPlayAmount(0);
    setPlayerCards([]);
    setDealerCards([]);
    setCommunityCards([]);
    setMessage('Place your Ante and Blind bets to begin');
    setResult('');
    setPayouts([]);
  };

  const renderCard = (card: Card | null, hidden = false) => {
    if (!card || hidden) {
      return (
        <div className="w-14 h-20 sm:w-16 sm:h-24 bg-blue-600 rounded-lg border-2 border-white flex items-center justify-center">
          <div className="text-white text-2xl">🂠</div>
        </div>
      );
    }

    const color = card.suit === '♥' || card.suit === '♦' ? 'text-red-600' : 'text-black';
    return (
      <div className="w-14 h-20 sm:w-16 sm:h-24 bg-white rounded-lg border-2 border-gray-300 flex flex-col items-center justify-between p-1">
        <div className={`text-xs sm:text-sm font-bold ${color}`}>{card.value}</div>
        <div className={`text-xl sm:text-2xl ${color}`}>{card.suit}</div>
        <div className={`text-xs sm:text-sm font-bold ${color}`}>{card.value}</div>
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
                  setBalance(25000);
                }
              }}
              disabled={balance >= 1000}
              className={`px-4 py-2 text-white rounded-lg transition-colors font-bold ${
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
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Ultimate Texas Hold&apos;em</h1>
          <div className="text-white text-lg">{message}</div>
          {result && <div className="text-yellow-400 text-xl font-bold mt-2">{result}</div>}
        </div>

        {/* Pay Tables */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-black/40 rounded-lg p-4">
            <h3 className="text-yellow-400 font-bold text-center mb-2">Trips Payouts</h3>
            <div className="text-white text-xs sm:text-sm space-y-1">
              <div className="flex justify-between"><span>Royal Flush</span><span>50:1</span></div>
              <div className="flex justify-between"><span>Straight Flush</span><span>40:1</span></div>
              <div className="flex justify-between"><span>Four of a Kind</span><span>30:1</span></div>
              <div className="flex justify-between"><span>Full House</span><span>8:1</span></div>
              <div className="flex justify-between"><span>Flush</span><span>7:1</span></div>
              <div className="flex justify-between"><span>Straight</span><span>4:1</span></div>
              <div className="flex justify-between"><span>Three of a Kind</span><span>3:1</span></div>
            </div>
          </div>
          <div className="bg-black/40 rounded-lg p-4">
            <h3 className="text-yellow-400 font-bold text-center mb-2">Blind Payouts</h3>
            <div className="text-white text-xs sm:text-sm space-y-1">
              <div className="flex justify-between"><span>Royal Flush</span><span>500:1</span></div>
              <div className="flex justify-between"><span>Straight Flush</span><span>50:1</span></div>
              <div className="flex justify-between"><span>Four of a Kind</span><span>10:1</span></div>
              <div className="flex justify-between"><span>Full House</span><span>3:1</span></div>
              <div className="flex justify-between"><span>Flush</span><span>3:2</span></div>
              <div className="flex justify-between"><span>Straight</span><span>1:1</span></div>
            </div>
          </div>
        </div>

        {/* Dealer's Hand */}
        <div className="bg-red-900/50 rounded-lg p-4 mb-4">
          <div className="text-white font-bold mb-2">Dealer</div>
          <div className="flex justify-center gap-2">
            {gamePhase === 'showdown' || gamePhase === 'result' ? (
              dealerCards.map((card, i) => <div key={i}>{renderCard(card)}</div>)
            ) : (
              <>
                {renderCard(null, true)}
                {renderCard(null, true)}
              </>
            )}
          </div>
        </div>

        {/* Community Cards */}
        <div className="bg-green-700/50 rounded-lg p-6 mb-4">
          <div className="flex justify-center gap-2 min-h-24">
            {communityCards.length > 0 ? (
              communityCards.map((card, i) => <div key={i}>{renderCard(card)}</div>)
            ) : (
              <div className="text-white/60 flex items-center">Community Cards</div>
            )}
          </div>
        </div>

        {/* Player's Hand */}
        <div className="bg-blue-800 rounded-lg p-4 mb-4">
          <div className="text-white font-bold mb-2">Your Hand</div>
          <div className="flex justify-center gap-2 mb-4">
            {playerCards.length > 0 ? (
              playerCards.map((card, i) => <div key={i}>{renderCard(card)}</div>)
            ) : (
              <>
                {renderCard(null, true)}
                {renderCard(null, true)}
              </>
            )}
          </div>

          {/* Betting Area */}
          {gamePhase === 'betting' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => placeBet('ante')}
                  className="bg-red-600 hover:bg-red-700 text-white p-4 rounded-lg font-bold"
                >
                  <div>ANTE</div>
                  <div className="text-yellow-400">${anteAmount}</div>
                </button>
                <button
                  onClick={() => placeBet('blind')}
                  className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg font-bold"
                >
                  <div>BLIND</div>
                  <div className="text-yellow-400">${blindAmount}</div>
                </button>
                <button
                  onClick={() => placeBet('trips')}
                  className="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-lg font-bold"
                >
                  <div>TRIPS</div>
                  <div className="text-yellow-400">${tripsAmount}</div>
                </button>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {[5, 10, 25, 50, 100].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setBetAmount(amount)}
                    className={`py-2 rounded-lg font-bold transition-colors ${
                      betAmount === amount
                        ? 'bg-yellow-500 text-black'
                        : 'bg-gray-700 text-white hover:bg-gray-600'
                    }`}
                  >
                    ${amount}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={clearBets}
                  className="py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold"
                >
                  Clear Bets
                </button>
                <button
                  onClick={dealInitialCards}
                  className="py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-xl"
                >
                  Deal
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {gamePhase === 'preflop' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => playerAction('check')}
                className="py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
              >
                Check
              </button>
              <button
                onClick={() => playerAction('play4x')}
                className="py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold"
              >
                Play 4x (${anteAmount * 4})
              </button>
            </div>
          )}

          {gamePhase === 'flop' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => playerAction('check')}
                className="py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
              >
                Check
              </button>
              <button
                onClick={() => playerAction('play2x')}
                className="py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold"
              >
                Play 2x (${anteAmount * 2})
              </button>
            </div>
          )}

          {gamePhase === 'turn' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => playerAction('fold')}
                className="py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold"
              >
                Fold
              </button>
              <button
                onClick={() => playerAction('play1x')}
                className="py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold"
              >
                Play 1x (${anteAmount})
              </button>
            </div>
          )}

          {gamePhase === 'result' && (
            <div className="space-y-4">
              {payouts.length > 0 && (
                <div className="bg-black/40 rounded-lg p-4">
                  <h3 className="text-yellow-400 font-bold mb-2">Payouts:</h3>
                  {payouts.map((p, i) => (
                    <div key={i} className="flex justify-between text-white">
                      <span>{p.label}</span>
                      <span className="text-green-400">${p.amount}</span>
                    </div>
                  ))}
                  <div className="border-t border-white/20 mt-2 pt-2 flex justify-between text-white font-bold">
                    <span>Total Won:</span>
                    <span className="text-green-400">${payouts.reduce((sum, p) => sum + p.amount, 0)}</span>
                  </div>
                </div>
              )}
              <button
                onClick={newRound}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-xl"
              >
                New Round
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UltimateTexasHoldem() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UltimateTexasHoldemContent />
    </Suspense>
  );
}
