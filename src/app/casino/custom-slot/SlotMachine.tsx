import { useState, useRef } from 'react';
import SlotReel from './SlotReel';
import BonusModal from './BonusModal';

const SYMBOLS = [
  { name: 'Wild', color: 'bg-yellow-400', payout: 10 },
  { name: 'Fever', color: 'bg-pink-500', payout: 20 },
  { name: 'Star', color: 'bg-blue-400', payout: 5 },
  { name: 'Cherry', color: 'bg-red-400', payout: 2 },
  { name: 'Bar', color: 'bg-gray-400', payout: 1 },
];

const REELS = 5;
const ROWS = 3;
const RTP = 0.96;
const BONUS_CHANCE = 0.08; // 8% chance to trigger bonus per spin
const BONUS_BUY_COST = 100;

function getRandomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function calculateWin(reels: Array<Array<{ name: string; color: string; payout: number }>>) {
  // Simple: 3+ matching symbols left-to-right
  let win = 0;
  let matchSymbol = reels[0][0].name;
  let count = 1;
  for (let i = 1; i < REELS; i++) {
    if (reels[i][0].name === matchSymbol) {
      count++;
    } else {
      break;
    }
  }
  if (count >= 3) {
    win = SYMBOLS.find(s => s.name === matchSymbol)?.payout ?? 0;
    win *= count; // More matches, bigger win
  }
  return win;
}

export default function SlotMachine() {
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(20);
  const [reels, setReels] = useState(Array(REELS).fill(null).map(() => Array(ROWS).fill(SYMBOLS[0])));
  const [spinning, setSpinning] = useState(false);
  const [win, setWin] = useState(0);
  const [bonusActive, setBonusActive] = useState(false);
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusWin, setBonusWin] = useState(0);
  const spinTimeout = useRef<NodeJS.Timeout | null>(null);

  function handleSpin(buyBonus = false) {
    if (spinning || balance < bet) return;
    setSpinning(true);
    setWin(0);
    setBonusWin(0);
    setBonusActive(false);
    setShowBonusModal(false);
    setBalance(b => b - bet);

    // Simulate RTP: 96% of spins return some win over time
    let rtpWin = Math.random() < RTP ? Math.floor(Math.random() * bet * 2) : 0;
    let bonusTriggered = buyBonus || Math.random() < BONUS_CHANCE;

    // Animate reels
    let newReels = Array(REELS).fill(null).map(() => Array(ROWS).fill(null).map(getRandomSymbol));
    setTimeout(() => {
      setReels(newReels);
      let spinWin = calculateWin(newReels);
      let totalWin = spinWin + rtpWin;
      setWin(totalWin);
      setBalance(b => b + totalWin);
      if (bonusTriggered) {
        setBonusActive(true);
        setShowBonusModal(true);
        // Bonus: random big win (10x-50x bet)
        let bonusAmount = Math.floor(bet * (10 + Math.random() * 40));
        setBonusWin(bonusAmount);
        setBalance(b => b + bonusAmount);
      }
      setSpinning(false);
    }, 1200);
  }

  function handleBonusBuy() {
    if (balance < BONUS_BUY_COST) return;
    setBalance(b => b - BONUS_BUY_COST);
    handleSpin(true);
  }

  return (
    <div className="bg-black/40 rounded-3xl p-8 border-2 border-yellow-400 shadow-2xl flex flex-col items-center">
      <div className="flex justify-between w-full mb-4">
        <div className="text-white text-xl font-bold">Balance: <span className="text-yellow-400">${balance}</span></div>
        <div className="text-white text-xl font-bold">Bet: <span className="text-orange-400">${bet}</span></div>
      </div>
      <div className="flex gap-2 justify-center mb-6">
        {Array(REELS).fill(null).map((_, i) => (
          <SlotReel key={i} symbols={reels[i]} spinning={spinning} />
        ))}
      </div>
      <div className="flex gap-4 mb-4">
        <button
          onClick={() => handleSpin(false)}
          disabled={spinning || balance < bet}
          className="px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl font-bold text-2xl shadow-lg hover:scale-105 transition-all disabled:opacity-50"
        >
          {spinning ? 'Spinning...' : 'Spin'}
        </button>
        <button
          onClick={handleBonusBuy}
          disabled={spinning || balance < BONUS_BUY_COST}
          className="px-8 py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-bold text-2xl shadow-lg hover:scale-105 transition-all disabled:opacity-50"
        >
          Buy Bonus (${BONUS_BUY_COST})
        </button>
      </div>
      {win > 0 && (
        <div className="text-green-400 text-3xl font-bold mb-2 animate-bounce">Win: ${win}</div>
      )}
      {bonusActive && (
        <div className="text-pink-400 text-2xl font-bold mb-2 animate-pulse">Fever Bonus Triggered!</div>
      )}
      <BonusModal show={showBonusModal} win={bonusWin} onClose={() => setShowBonusModal(false)} />
    </div>
  );
}
