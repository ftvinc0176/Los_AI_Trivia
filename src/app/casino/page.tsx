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
  const [gameMode, setGameMode] = useState<'single' | 'multiplayer'>('single');
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
    <div className="h-screen flex flex-col bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 overflow-hidden">
      {/* Compact Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-2 sm:p-4 bg-black/60 backdrop-blur-xl border-b border-red-500/20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 sm:w-12 sm:h-12 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-xl shadow-lg shadow-red-500/30">
            {playerName[0]?.toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <div className="text-white font-bold text-lg">{playerName}</div>
            <div className="text-red-300/60 text-sm">VIP Member</div>
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-lg sm:text-2xl font-bold">
            <span className="bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text text-transparent">
              🎰 The Casino
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (checkAndReload()) {
                setBalance(25000);
              }
            }}
            disabled={balance >= 1000}
            className={`px-2 py-1 text-white rounded-lg transition-all font-bold text-xs ${
              balance >= 1000 
                ? 'bg-neutral-700 cursor-not-allowed opacity-50' 
                : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600'
            }`}
          >
            💵
          </button>
          <div className="text-right">
            <div className={`text-sm sm:text-xl font-bold ${balance >= 25000 ? 'text-green-400' : balance > 10000 ? 'text-white' : 'text-red-400'}`}>
              ${balance.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-2 sm:p-4 gap-2 sm:gap-4">
        {/* Left Leaderboard - Desktop Only */}
        <div className="hidden lg:block lg:w-48 flex-shrink-0">
          <div className="bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-red-500/20 h-full overflow-auto">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-red-500/20">
              <span className="text-lg">🏆</span>
              <h3 className="text-xs font-bold text-red-400 uppercase">Top Balances</h3>
            </div>
            {highestBalances.length > 0 ? (
              <div className="space-y-1">
                {highestBalances.slice(0, 5).map((entry, i) => (
                  <div key={i} className={`flex items-center justify-between p-1.5 rounded text-xs ${
                    i === 0 ? 'bg-red-500/20' : 'bg-black/20'
                  }`}>
                    <span className="text-white truncate max-w-[60px]">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`} {entry.name}</span>
                    <span className="text-green-400 font-bold">${entry.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-white/30 text-center text-xs py-2">No records</div>
            )}
          </div>
        </div>

        {/* Center - Games */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!showMultiplayerOptions ? (
            <>
              {/* Game Mode Toggle */}
              <div className="flex-shrink-0 flex justify-center gap-2 mb-2 px-2">
                <button
                  onClick={() => setGameMode('single')}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                    gameMode === 'single'
                      ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30'
                      : 'bg-black/40 text-white/60 hover:text-white border border-red-500/20'
                  }`}
                >
                  🎮 Singleplayer
                </button>
                <button
                  onClick={() => setGameMode('multiplayer')}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                    gameMode === 'multiplayer'
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'bg-black/40 text-white/60 hover:text-white border border-blue-500/20'
                  }`}
                >
                  👥 Multiplayer
                </button>
              </div>

              {/* Mobile: Compact Icon Grid */}
              <div className="lg:hidden flex-1 overflow-auto">
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 p-1">
                  {gameMode === 'single' ? (
                    <>
                      {/* Singleplayer Games */}
                      <button onClick={() => router.push('/casino/blackjack?mode=single')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-red-500/20 hover:border-red-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🃏</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Blackjack</span>
                      </button>
                      <button onClick={() => router.push('/casino/andar-bahar?mode=single')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-red-500/20 hover:border-red-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🎴</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Andar Bahar</span>
                      </button>
                      <button onClick={() => router.push('/casino/ultimate-holdem')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-red-500/20 hover:border-red-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🎲</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Ultimate</span>
                      </button>
                      <button onClick={() => router.push('/casino/horse-racing?mode=single')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-red-500/20 hover:border-red-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🏇</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Horses</span>
                      </button>
                      <button onClick={() => router.push('/casino/baccarat?mode=single')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-red-500/20 hover:border-red-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🎴</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Baccarat</span>
                      </button>
                      <button onClick={() => router.push('/casino/craps')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-red-500/20 hover:border-red-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🎲</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Craps</span>
                      </button>
                      <button onClick={() => router.push('/casino/cs-betting')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-orange-500/20 hover:border-orange-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🎯</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">CS Bet</span>
                      </button>
                      <button onClick={() => router.push('/casino/sweet-bonanza')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-pink-500/20 hover:border-pink-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🍭</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Bonanza</span>
                      </button>
                      <button onClick={() => router.push('/casino/madame-destiny')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-purple-500/20 hover:border-purple-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🔮</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Destiny</span>
                      </button>
                      <button onClick={() => router.push('/casino/wild-booster')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-purple-500/20 hover:border-purple-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">💎</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Wild Boost</span>
                      </button>
                      <button onClick={() => router.push('/casino/keno')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-purple-500/20 hover:border-purple-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🎱</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Keno</span>
                      </button>
                      <button onClick={() => router.push('/casino/limbo')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-indigo-500/20 hover:border-indigo-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">⚡</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Limbo</span>
                      </button>
                      <button onClick={() => router.push('/casino/wanted-dead-or-wild')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-amber-500/20 hover:border-amber-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🤠</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Wanted</span>
                      </button>
                      <button onClick={() => router.push('/casino/video-poker')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-red-500/20 hover:border-red-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🃏</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">V.Poker</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Multiplayer Games */}
                      <button onClick={() => handleGameSelect('blackjack', 'multiplayer')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-blue-500/20 hover:border-blue-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🃏</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Blackjack</span>
                        <span className="text-[8px] text-blue-400">👥 Lobby</span>
                      </button>
                      <button onClick={() => handleGameSelect('andar-bahar', 'multiplayer')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-blue-500/20 hover:border-blue-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🎴</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Andar Bahar</span>
                        <span className="text-[8px] text-blue-400">👥 Lobby</span>
                      </button>
                      <button onClick={() => handleGameSelect('texas-holdem', 'multiplayer')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-blue-500/20 hover:border-blue-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🃏</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Texas</span>
                        <span className="text-[8px] text-blue-400">👥 Lobby</span>
                      </button>
                      <button onClick={() => handleGameSelect('baccarat', 'multiplayer')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-blue-500/20 hover:border-blue-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🎴</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Baccarat</span>
                        <span className="text-[8px] text-blue-400">👥 Lobby</span>
                      </button>
                      <button onClick={() => handleGameSelect('horse-racing', 'multiplayer')} className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-blue-500/20 hover:border-blue-500/50 transition-all">
                        <span className="text-2xl sm:text-3xl mb-1">🏇</span>
                        <span className="text-[10px] sm:text-xs text-white font-medium">Horses</span>
                        <span className="text-[8px] text-blue-400">👥 Lobby</span>
                      </button>
                    </>
                  )}
                </div>
                
                {/* Mobile Leaderboards Row */}
                <div className="grid grid-cols-2 gap-2 mt-2 px-1">
                  <div className="bg-black/40 rounded-lg p-2 border border-red-500/20">
                    <div className="text-[10px] text-red-400 font-bold mb-1">🏆 TOP BALANCES</div>
                    {highestBalances.slice(0, 3).map((e, i) => (
                      <div key={i} className="flex justify-between text-[10px]">
                        <span className="text-white truncate max-w-[60px]">{['🥇','🥈','🥉'][i]} {e.name}</span>
                        <span className="text-green-400">${e.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-black/40 rounded-lg p-2 border border-red-500/20">
                    <div className="text-[10px] text-red-400 font-bold mb-1">🎲 MOST WAGERED</div>
                    {mostWagered.slice(0, 3).map((e, i) => (
                      <div key={i} className="flex justify-between text-[10px]">
                        <span className="text-white truncate max-w-[60px]">{['🔥','⚡','✨'][i]} {e.name}</span>
                        <span className="text-green-400">${e.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Desktop: Full Card Grid */}
              <div className="hidden lg:block flex-1 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
                {gameMode === 'single' ? (
                  <>
                    {/* Singleplayer Games */}
                    {/* Blackjack */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-red-500/20 hover:border-red-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🃏</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Blackjack</h2>
                            <p className="text-white/40 text-xs">Beat the dealer to 21</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/blackjack?mode=single')} className="w-full py-1.5 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 text-white rounded-lg font-medium text-xs transition-all border border-red-500/30">🎮 Play Now</button>
                      </div>
                    </div>

                    {/* Andar Bahar */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-red-500/20 hover:border-red-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🎴</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Andar Bahar</h2>
                            <p className="text-white/40 text-xs">Match the card side</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/andar-bahar?mode=single')} className="w-full py-1.5 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 text-white rounded-lg font-medium text-xs transition-all border border-red-500/30">🎮 Play Now</button>
                      </div>
                    </div>

                    {/* Ultimate Texas Hold'em */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-red-500/20 hover:border-red-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🎲</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Ultimate Hold&apos;em</h2>
                            <p className="text-white/40 text-xs">Casino table poker</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/ultimate-holdem')} className="w-full py-1.5 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 text-white rounded-lg font-medium text-xs transition-all border border-red-500/30">🎮 Play Now</button>
                      </div>
                    </div>

                    {/* Horse Racing */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-red-500/20 hover:border-red-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🏇</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Horse Racing</h2>
                            <p className="text-white/40 text-xs">Bet on winners</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/horse-racing?mode=single')} className="w-full py-1.5 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 text-white rounded-lg font-medium text-xs transition-all border border-red-500/30">🎮 Play Now</button>
                      </div>
                    </div>

                    {/* Baccarat */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-red-500/20 hover:border-red-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🎴</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Baccarat</h2>
                            <p className="text-white/40 text-xs">High-stakes classic</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/baccarat?mode=single')} className="w-full py-1.5 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 text-white rounded-lg font-medium text-xs transition-all border border-red-500/30">🎮 Play Now</button>
                      </div>
                    </div>

                    {/* Craps */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-red-500/20 hover:border-red-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🎲</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Craps</h2>
                            <p className="text-white/40 text-xs">Crapless dice game</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/craps')} className="w-full py-1.5 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 text-white rounded-lg font-medium text-xs transition-all border border-red-500/30">🎲 Play Craps</button>
                      </div>
                    </div>

                    {/* CS Betting */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-orange-500/20 hover:border-orange-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">💰🎯</div>
                          <div>
                            <h2 className="text-base font-bold text-white">CS Betting</h2>
                            <p className="text-white/40 text-xs">Bet on bot matches</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/cs-betting')} className="w-full py-1.5 bg-gradient-to-r from-orange-500/30 to-orange-600/20 hover:from-orange-500/50 text-white rounded-lg font-medium text-xs transition-all border border-orange-500/30">💰 Place Bets</button>
                      </div>
                    </div>

                    {/* Sweet Bonanza */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-pink-500/20 hover:border-pink-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🍭🍬</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Sweet Bonanza</h2>
                            <p className="text-white/40 text-xs">Tumbling slots</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/sweet-bonanza')} className="w-full py-1.5 bg-gradient-to-r from-pink-500/30 to-pink-600/20 hover:from-pink-500/50 text-white rounded-lg font-medium text-xs transition-all border border-pink-500/30">🍭 Play Slots</button>
                      </div>
                    </div>

                    {/* Madame Destiny */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-purple-500/20 hover:border-purple-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🔮✨</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Madame Destiny</h2>
                            <p className="text-white/40 text-xs">Megaways slots</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/madame-destiny')} className="w-full py-1.5 bg-gradient-to-r from-purple-500/30 to-purple-600/20 hover:from-purple-500/50 text-white rounded-lg font-medium text-xs transition-all border border-purple-500/30">🔮 Play Megaways</button>
                      </div>
                    </div>

                    {/* Wild Booster */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-purple-500/20 hover:border-purple-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">💎🔥</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Wild Booster</h2>
                            <p className="text-white/40 text-xs">Wild multiplier slots</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/wild-booster')} className="w-full py-1.5 bg-gradient-to-r from-purple-500/30 to-purple-600/20 hover:from-purple-500/50 text-white rounded-lg font-medium text-xs transition-all border border-purple-500/30">💎 Play Wild Booster</button>
                      </div>
                    </div>

                    {/* Keno */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-purple-500/20 hover:border-purple-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🎱🔢</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Keno</h2>
                            <p className="text-white/40 text-xs">Pick your lucky numbers</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/keno')} className="w-full py-1.5 bg-gradient-to-r from-purple-500/30 to-purple-600/20 hover:from-purple-500/50 text-white rounded-lg font-medium text-xs transition-all border border-purple-500/30">🎱 Play Keno</button>
                      </div>
                    </div>

                    {/* Limbo */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-indigo-500/20 hover:border-indigo-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">⚡🎯</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Limbo</h2>
                            <p className="text-white/40 text-xs">Beat the multiplier</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/limbo')} className="w-full py-1.5 bg-gradient-to-r from-indigo-500/30 to-indigo-600/20 hover:from-indigo-500/50 text-white rounded-lg font-medium text-xs transition-all border border-indigo-500/30">⚡ Play Limbo</button>
                      </div>
                    </div>

                    {/* Wanted Dead or a Wild */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-amber-500/20 hover:border-amber-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🤠⭐</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Wanted Dead or Wild</h2>
                            <p className="text-white/40 text-xs">Wild West slots</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/wanted-dead-or-wild')} className="w-full py-1.5 bg-gradient-to-r from-amber-500/30 to-amber-600/20 hover:from-amber-500/50 text-white rounded-lg font-medium text-xs transition-all border border-amber-500/30">🤠 Play Wild West</button>
                      </div>
                    </div>

                    {/* Video Poker */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-red-500/20 hover:border-red-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🃏♠️</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Video Poker</h2>
                            <p className="text-white/40 text-xs">Jacks or Better</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/video-poker')} className="w-full py-1.5 bg-gradient-to-r from-red-500/30 to-red-600/20 hover:from-red-500/50 text-white rounded-lg font-medium text-xs transition-all border border-red-500/30">🃏 Play Video Poker</button>
                      </div>
                    </div>

                    {/* Fever Fortune Slot (Custom) */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-yellow-400 hover:border-yellow-500 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🎰🔥</div>
                          <div>
                            <h2 className="text-base font-bold text-yellow-300">Fever Fortune Slot</h2>
                            <p className="text-yellow-200/80 text-xs">Custom slot with bonus</p>
                          </div>
                        </div>
                        <button onClick={() => router.push('/casino/custom-slot')} className="w-full py-1.5 bg-gradient-to-r from-yellow-400/30 to-orange-400/20 hover:from-yellow-400/50 text-white rounded-lg font-medium text-xs transition-all border border-yellow-400/30">🎰 Play Fever Slot</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Multiplayer Games */}
                    {/* Blackjack */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-blue-500/20 hover:border-blue-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🃏</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Blackjack</h2>
                            <p className="text-white/40 text-xs">Beat the dealer to 21</p>
                          </div>
                        </div>
                        <button onClick={() => handleGameSelect('blackjack', 'multiplayer')} className="w-full py-1.5 bg-gradient-to-r from-blue-500/30 to-blue-600/20 hover:from-blue-500/50 text-white rounded-lg font-medium text-xs transition-all border border-blue-500/30">👥 Join Lobby</button>
                      </div>
                    </div>

                    {/* Andar Bahar */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-blue-500/20 hover:border-blue-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🎴</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Andar Bahar</h2>
                            <p className="text-white/40 text-xs">Match the card side</p>
                          </div>
                        </div>
                        <button onClick={() => handleGameSelect('andar-bahar', 'multiplayer')} className="w-full py-1.5 bg-gradient-to-r from-blue-500/30 to-blue-600/20 hover:from-blue-500/50 text-white rounded-lg font-medium text-xs transition-all border border-blue-500/30">👥 Join Lobby</button>
                      </div>
                    </div>

                    {/* Texas Hold'em */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-blue-500/20 hover:border-blue-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🃏</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Texas Hold&apos;em</h2>
                            <p className="text-white/40 text-xs">Play with real players</p>
                          </div>
                        </div>
                        <button onClick={() => handleGameSelect('texas-holdem', 'multiplayer')} className="w-full py-1.5 bg-gradient-to-r from-blue-500/30 to-blue-600/20 hover:from-blue-500/50 text-white rounded-lg font-medium text-xs transition-all border border-blue-500/30">👥 Join Lobby</button>
                      </div>
                    </div>

                    {/* Baccarat */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-blue-500/20 hover:border-blue-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🎴</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Baccarat</h2>
                            <p className="text-white/40 text-xs">High-stakes classic</p>
                          </div>
                        </div>
                        <button onClick={() => handleGameSelect('baccarat', 'multiplayer')} className="w-full py-1.5 bg-gradient-to-r from-blue-500/30 to-blue-600/20 hover:from-blue-500/50 text-white rounded-lg font-medium text-xs transition-all border border-blue-500/30">👥 Join Lobby</button>
                      </div>
                    </div>

                    {/* Horse Racing */}
                    <div className="group relative bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-blue-500/20 hover:border-blue-500/50 transition-all duration-300">
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-2xl">🏇</div>
                          <div>
                            <h2 className="text-base font-bold text-white">Horse Racing</h2>
                            <p className="text-white/40 text-xs">Bet on winners</p>
                          </div>
                        </div>
                        <button onClick={() => handleGameSelect('horse-racing', 'multiplayer')} className="w-full py-1.5 bg-gradient-to-r from-blue-500/30 to-blue-600/20 hover:from-blue-500/50 text-white rounded-lg font-medium text-xs transition-all border border-blue-500/30">👥 Join Lobby</button>
                      </div>
                    </div>
                  </>
                )}
                </div>
              </div>
            </>
          ) : (
              <div className="space-y-4 p-4">
                <button
                  onClick={handleBack}
                  className="text-red-400/60 hover:text-red-400 flex items-center gap-2 transition-colors text-sm"
                >
                  ← Back to Games
                </button>

                <h2 className="text-xl font-bold text-white text-center">
                  {selectedGame === 'blackjack' ? '🃏 Blackjack' : 
                   selectedGame === 'andar-bahar' ? '🎴 Andar Bahar' : 
                   selectedGame === 'texas-holdem' ? '🃏 Texas Hold\'em' : 
                   selectedGame === 'horse-racing' ? '🏇 Horse Racing' :
                   '🎴 Baccarat'} Multiplayer
                </h2>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => router.push(`/casino/${selectedGame}?mode=create`)}
                    className="bg-black/40 rounded-xl p-4 border border-red-500/20 hover:border-red-500/50 transition-all text-center"
                  >
                    <div className="text-3xl mb-2">➕</div>
                    <h2 className="text-lg font-bold text-white">Create</h2>
                    <p className="text-white/40 text-xs">Start new game</p>
                  </button>
                  <button
                    onClick={() => router.push(`/casino/${selectedGame}?mode=browse`)}
                    className="bg-black/40 rounded-xl p-4 border border-red-500/20 hover:border-red-500/50 transition-all text-center"
                  >
                    <div className="text-3xl mb-2">👁️</div>
                    <h2 className="text-lg font-bold text-white">Browse</h2>
                    <p className="text-white/40 text-xs">Join lobby</p>
                  </button>
                </div>
              </div>
            )}
          </div>

        {/* Right Leaderboard - Desktop Only */}
        <div className="hidden lg:block lg:w-48 flex-shrink-0">
          <div className="bg-black/40 backdrop-blur-xl rounded-xl p-3 border border-red-500/20 h-full overflow-auto">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-red-500/20">
              <span className="text-lg">🎲</span>
              <h3 className="text-xs font-bold text-red-400 uppercase">Most Wagered</h3>
            </div>
            {mostWagered.length > 0 ? (
              <div className="space-y-1">
                {mostWagered.slice(0, 5).map((entry, i) => (
                  <div key={i} className={`flex items-center justify-between p-1.5 rounded text-xs ${
                    i === 0 ? 'bg-red-500/20' : 'bg-black/20'
                  }`}>
                    <span className="text-white truncate max-w-[60px]">{i === 0 ? '🔥' : i === 1 ? '⚡' : i === 2 ? '✨' : `${i+1}.`} {entry.name}</span>
                    <span className="text-green-400 font-bold">${entry.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-white/30 text-center text-xs py-2">No wagers</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bar - Leave Button */}
      <div className="flex-shrink-0 p-2 text-center">
        <button
          onClick={handleLeave}
          className="text-red-400/60 hover:text-red-400 transition-colors text-sm"
        >
          🚪 Leave Casino
        </button>
      </div>
    </div>
  );
}
