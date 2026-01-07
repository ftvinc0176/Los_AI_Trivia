'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCasino } from './CasinoContext';

type GameType = 'blackjack' | 'andar-bahar' | 'texas-holdem' | 'ultimate-holdem' | 'horse-racing' | 'baccarat' | 'craps' | 'cs-betting' | 'sweet-bonanza' | 'madame-destiny' | 'wild-booster' | null;

export default function Casino() {
  const router = useRouter();
  const { playerName, balance, setBalance, isLoggedIn, logout, highestBalances, mostWagered, checkAndReload, loginWithUsername } = useCasino();
  const [selectedGame, setSelectedGame] = useState<GameType>(null);
  const [showMultiplayerOptions, setShowMultiplayerOptions] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const handleLogin = async () => {
    if (nameInput.trim()) {
      await loginWithUsername(nameInput.trim());
    }
  };

  const handleGameSelect = (game: GameType, mode: 'single' | 'multiplayer') => {
    if (mode === 'single') {
      router.push(`/casino/${game}?mode=single`);
    } else {
      setSelectedGame(game);
      setShowMultiplayerOptions(true);
    }
  };

  const handleBack = () => {
    if (showMultiplayerOptions) {
      setShowMultiplayerOptions(false);
      setSelectedGame(null);
    }
  };

  const handleLeave = () => {
    logout();
    router.push('/');
  };

  // Login screen
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-black/60 backdrop-blur-xl rounded-2xl p-8 border border-red-500/20 shadow-2xl shadow-red-500/10">
          <h1 className="text-5xl font-bold text-center mb-4">
            <span className="bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text text-transparent">
              🎰 The Casino 🎰
            </span>
          </h1>
          <p className="text-white/50 text-center mb-8">
            Enter your name to start playing
          </p>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full px-4 py-4 bg-black/40 border border-red-500/20 focus:border-red-500/50 rounded-xl text-white text-center text-xl placeholder-white/30 outline-none transition-all"
            />
            
            <button
              onClick={handleLogin}
              disabled={!nameInput.trim()}
              className="w-full py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xl transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/30"
            >
              Enter Casino
            </button>
            
            <div className="text-center pt-2">
              <div className="text-white/40 text-sm mb-1">Starting Balance</div>
              <div className="text-3xl font-bold text-green-400">$25,000</div>
            </div>
          </div>
          
          <div className="text-center mt-6">
            <button
              onClick={() => router.push('/')}
              className="text-red-400/60 hover:text-red-400 transition-colors"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header with player info */}
        <div className="flex items-center justify-between mb-6 bg-black/60 backdrop-blur-xl rounded-2xl p-4 border border-red-500/20 shadow-lg shadow-red-500/5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-red-500/30">
              {playerName[0]?.toUpperCase()}
            </div>
            <div>
              <div className="text-white font-bold text-lg">{playerName}</div>
              <div className="text-red-300/60 text-sm">VIP Member</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (checkAndReload()) {
                  setBalance(25000);
                }
              }}
              disabled={balance >= 1000}
              className={`px-3 py-1 sm:px-4 sm:py-2 text-white rounded-lg transition-all font-bold text-sm sm:text-base ${
                balance >= 1000 
                  ? 'bg-neutral-700 cursor-not-allowed opacity-50' 
                  : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-lg shadow-red-500/20'
              }`}
            >
              💵 Reload
            </button>
            <div className="text-right">
              <div className="text-white/50 text-sm">Balance</div>
              <div className={`text-2xl font-bold ${balance >= 25000 ? 'text-green-400' : balance > 10000 ? 'text-white' : 'text-red-400'}`}>
                ${balance.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-5xl md:text-6xl font-bold mb-2">
            <span className="bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text text-transparent drop-shadow-lg">
              🎰 The Casino 🎰
            </span>
          </h1>
          <p className="text-white/50 text-lg">Your balance carries across all games</p>
        </div>

        {/* Main Layout with Leaderboards */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Leaderboard - Highest Balances */}
          <div className="lg:w-56 flex-shrink-0">
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-red-500/20 shadow-lg shadow-red-500/5 sticky top-4">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-red-500/20">
                <span className="text-xl">🏆</span>
                <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Top Balances</h3>
              </div>
              {highestBalances.length > 0 ? (
                <div className="space-y-2">
                  {highestBalances.map((entry, i) => (
                    <div 
                      key={i} 
                      className={`flex items-center justify-between p-2 rounded-lg transition-all ${
                        i === 0 ? 'bg-gradient-to-r from-red-500/30 to-red-600/20 border border-red-500/30' : 
                        i === 1 ? 'bg-white/10 border border-white/10' : 
                        i === 2 ? 'bg-white/5 border border-white/5' : 'bg-black/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                        </span>
                        <span className="text-white font-medium text-sm truncate max-w-16">{entry.name}</span>
                      </div>
                      <span className="text-green-400 font-bold text-xs">${entry.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-white/30 text-center text-sm py-4">
                  No records yet!
                </div>
              )}
            </div>
          </div>

          {/* Center - Games Grid */}
          <div className="flex-1">
            {!showMultiplayerOptions ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* Blackjack */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">🃏</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Blackjack</h2>
                        <p className="text-white/40 text-sm">Beat the dealer to 21</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleGameSelect('blackjack', 'single')}
                        className="py-2 bg-red-500/20 hover:bg-red-500/40 text-white rounded-lg font-medium text-sm transition-all border border-red-500/20 hover:border-red-500/40"
                      >
                        🎮 Solo
                      </button>
                      <button
                        onClick={() => handleGameSelect('blackjack', 'multiplayer')}
                        className="py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium text-sm transition-all border border-white/10 hover:border-white/20"
                      >
                        👥 Multi
                      </button>
                    </div>
                  </div>
                </div>

                {/* Andar Bahar */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">🎴</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Andar Bahar</h2>
                        <p className="text-white/40 text-sm">Match the card side</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleGameSelect('andar-bahar', 'single')}
                        className="py-2 bg-red-500/20 hover:bg-red-500/40 text-white rounded-lg font-medium text-sm transition-all border border-red-500/20 hover:border-red-500/40"
                      >
                        🎮 Solo
                      </button>
                      <button
                        onClick={() => handleGameSelect('andar-bahar', 'multiplayer')}
                        className="py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium text-sm transition-all border border-white/10 hover:border-white/20"
                      >
                        👥 Multi
                      </button>
                    </div>
                  </div>
                </div>

                {/* Ultimate Texas Hold'em */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">🎲</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Ultimate Hold&apos;em</h2>
                        <p className="text-white/40 text-sm">Casino table poker</p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push('/casino/ultimate-holdem')}
                      className="w-full py-2 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 hover:to-red-600/30 text-white rounded-lg font-medium text-sm transition-all border border-red-500/30"
                    >
                      🎮 Play Now
                    </button>
                  </div>
                </div>

                {/* Texas Hold'em Multiplayer */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">🃏</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Texas Hold&apos;em</h2>
                        <p className="text-white/40 text-sm">Play with real players</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleGameSelect('texas-holdem', 'multiplayer')}
                      className="w-full py-2 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 hover:to-red-600/30 text-white rounded-lg font-medium text-sm transition-all border border-red-500/30"
                    >
                      👥 Join Table
                    </button>
                  </div>
                </div>

                {/* Horse Racing */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">🏇</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Horse Racing</h2>
                        <p className="text-white/40 text-sm">Bet on winners</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleGameSelect('horse-racing', 'single')}
                        className="py-2 bg-red-500/20 hover:bg-red-500/40 text-white rounded-lg font-medium text-sm transition-all border border-red-500/20 hover:border-red-500/40"
                      >
                        🎮 Solo
                      </button>
                      <button
                        onClick={() => handleGameSelect('horse-racing', 'multiplayer')}
                        className="py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium text-sm transition-all border border-white/10 hover:border-white/20"
                      >
                        👥 Multi
                      </button>
                    </div>
                  </div>
                </div>

                {/* Baccarat */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">🎴</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Baccarat</h2>
                        <p className="text-white/40 text-sm">High-stakes classic</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleGameSelect('baccarat', 'single')}
                        className="py-2 bg-red-500/20 hover:bg-red-500/40 text-white rounded-lg font-medium text-sm transition-all border border-red-500/20 hover:border-red-500/40"
                      >
                        🎮 Solo
                      </button>
                      <button
                        onClick={() => handleGameSelect('baccarat', 'multiplayer')}
                        className="py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium text-sm transition-all border border-white/10 hover:border-white/20"
                      >
                        👥 Multi
                      </button>
                    </div>
                  </div>
                </div>

                {/* Craps */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">🎲</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Craps</h2>
                        <p className="text-white/40 text-sm">Crapless dice game</p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push('/casino/craps')}
                      className="w-full py-2 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 hover:to-red-600/30 text-white rounded-lg font-medium text-sm transition-all border border-red-500/30"
                    >
                      🎲 Play Craps
                    </button>
                  </div>
                </div>

                {/* CS Betting */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">💰🎯</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">CS Betting</h2>
                        <p className="text-white/40 text-sm">Bet on bot matches</p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push('/casino/cs-betting')}
                      className="w-full py-2 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 hover:to-red-600/30 text-white rounded-lg font-medium text-sm transition-all border border-red-500/30"
                    >
                      💰 Place Bets
                    </button>
                  </div>
                </div>

                {/* Sweet Bonanza */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">🍭🍬</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Sweet Bonanza</h2>
                        <p className="text-white/40 text-sm">Tumbling slots</p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push('/casino/sweet-bonanza')}
                      className="w-full py-2 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 hover:to-red-600/30 text-white rounded-lg font-medium text-sm transition-all border border-red-500/30"
                    >
                      🍭 Play Slots
                    </button>
                  </div>
                </div>

                {/* Madame Destiny Megaways */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">🔮✨</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Madame Destiny</h2>
                        <p className="text-white/40 text-sm">Megaways slots</p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push('/casino/madame-destiny')}
                      className="w-full py-2 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 hover:to-red-600/30 text-white rounded-lg font-medium text-sm transition-all border border-red-500/30"
                    >
                      🔮 Play Megaways
                    </button>
                  </div>
                </div>

                {/* Wild Booster */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-purple-500/20 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">💎🔥</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Wild Booster</h2>
                        <p className="text-white/40 text-sm">Wild multiplier slots</p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push('/casino/wild-booster')}
                      className="w-full py-2 bg-gradient-to-r from-purple-500/30 to-purple-600/20 hover:from-purple-500/50 hover:to-purple-600/30 text-white rounded-lg font-medium text-sm transition-all border border-purple-500/30"
                    >
                      💎 Play Wild Booster
                    </button>
                  </div>
                </div>

                {/* Keno */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-purple-500/20 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">🎱🔢</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Keno</h2>
                        <p className="text-white/40 text-sm">Pick your lucky numbers</p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push('/casino/keno')}
                      className="w-full py-2 bg-gradient-to-r from-purple-500/30 to-purple-600/20 hover:from-purple-500/50 hover:to-purple-600/30 text-white rounded-lg font-medium text-sm transition-all border border-purple-500/30"
                    >
                      🎱 Play Keno
                    </button>
                  </div>
                </div>

                {/* Limbo */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-indigo-500/20 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">⚡🎯</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Limbo</h2>
                        <p className="text-white/40 text-sm">Beat the multiplier</p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push('/casino/limbo')}
                      className="w-full py-2 bg-gradient-to-r from-indigo-500/30 to-indigo-600/20 hover:from-indigo-500/50 hover:to-indigo-600/30 text-white rounded-lg font-medium text-sm transition-all border border-indigo-500/30"
                    >
                      ⚡ Play Limbo
                    </button>
                  </div>
                </div>

                {/* Wanted Dead or a Wild */}
                <div className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-amber-500/20 hover:border-amber-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-4xl">🤠⭐</div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Wanted Dead or Wild</h2>
                        <p className="text-white/40 text-sm">Wild West slots</p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push('/casino/wanted-dead-or-wild')}
                      className="w-full py-2 bg-gradient-to-r from-amber-500/30 to-amber-600/20 hover:from-amber-500/50 hover:to-amber-600/30 text-white rounded-lg font-medium text-sm transition-all border border-amber-500/30"
                    >
                      🤠 Play Wild West
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <button
                  onClick={handleBack}
                  className="text-red-400/60 hover:text-red-400 mb-4 flex items-center gap-2 transition-colors"
                >
                  ← Back to Games
                </button>

                <h2 className="text-3xl font-bold text-white text-center mb-6">
                  {selectedGame === 'blackjack' ? '🃏 Blackjack' : 
                   selectedGame === 'andar-bahar' ? '🎴 Andar Bahar' : 
                   selectedGame === 'texas-holdem' ? '🃏 Texas Hold\'em' : 
                   selectedGame === 'horse-racing' ? '🏇 Horse Racing' :
                   '🎴 Baccarat'} Multiplayer
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Create Lobby */}
                  <button
                    onClick={() => router.push(`/casino/${selectedGame}?mode=create`)}
                    className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-8 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative">
                      <div className="text-5xl mb-4">➕</div>
                      <h2 className="text-2xl font-bold text-white mb-2">Create Lobby</h2>
                      <p className="text-white/40 text-base">Start a new multiplayer game</p>
                      <div className="mt-4 text-red-400 text-sm">Up to 6 players</div>
                    </div>
                  </button>

                  {/* See Lobbies */}
                  <button
                    onClick={() => router.push(`/casino/${selectedGame}?mode=browse`)}
                    className="group relative bg-black/40 backdrop-blur-xl rounded-2xl p-8 border border-red-500/20 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative">
                      <div className="text-5xl mb-4">👁️</div>
                      <h2 className="text-2xl font-bold text-white mb-2">See Lobbies</h2>
                      <p className="text-white/40 text-base">Browse public games</p>
                      <div className="mt-4 text-red-400 text-sm">Join open lobbies</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Leaderboard - Most Wagered */}
          <div className="lg:w-56 flex-shrink-0">
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-red-500/20 shadow-lg shadow-red-500/5 sticky top-4">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-red-500/20">
                <span className="text-xl">🎲</span>
                <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Most Wagered</h3>
              </div>
              {mostWagered.length > 0 ? (
                <div className="space-y-2">
                  {mostWagered.map((entry, i) => (
                    <div 
                      key={i} 
                      className={`flex items-center justify-between p-2 rounded-lg transition-all ${
                        i === 0 ? 'bg-gradient-to-r from-red-500/30 to-red-600/20 border border-red-500/30' : 
                        i === 1 ? 'bg-white/10 border border-white/10' : 
                        i === 2 ? 'bg-white/5 border border-white/5' : 'bg-black/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {i === 0 ? '🔥' : i === 1 ? '⚡' : i === 2 ? '✨' : `${i + 1}.`}
                        </span>
                        <span className="text-white font-medium text-sm truncate max-w-16">{entry.name}</span>
                      </div>
                      <span className="text-green-400 font-bold text-xs">${entry.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-white/30 text-center text-sm py-4">
                  No wagers yet!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-8">
          <button
            onClick={handleLeave}
            className="text-red-400/60 hover:text-red-400 transition-colors"
          >
            🚪 Leave Casino
          </button>
        </div>
      </div>
    </div>
  );
}
