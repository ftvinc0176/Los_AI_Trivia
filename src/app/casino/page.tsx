'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCasino } from './CasinoContext';

type GameType = 'blackjack' | 'andar-bahar' | 'texas-holdem' | 'horse-racing' | 'baccarat' | null;

export default function Casino() {
  const router = useRouter();
  const { playerName, setPlayerName, balance, isLoggedIn, logout } = useCasino();
  const [selectedGame, setSelectedGame] = useState<GameType>(null);
  const [showMultiplayerOptions, setShowMultiplayerOptions] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const handleLogin = () => {
    if (nameInput.trim()) {
      setPlayerName(nameInput.trim());
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20">
          <h1 className="text-5xl font-bold text-center mb-4 bg-gradient-to-r from-yellow-400 via-red-500 to-purple-600 bg-clip-text text-transparent">
            🎰 The Casino 🎰
          </h1>
          <p className="text-white/70 text-center mb-8">
            Enter your name to start playing
          </p>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-xl text-white text-center text-xl placeholder-white/50"
            />
            
            <button
              onClick={handleLogin}
              disabled={!nameInput.trim()}
              className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 text-white rounded-xl font-bold text-xl transition-all"
            >
              Enter Casino
            </button>
            
            <div className="text-center">
              <div className="text-white/60 text-sm mb-1">Starting Balance</div>
              <div className="text-3xl font-bold text-green-400">$25,000</div>
            </div>
          </div>
          
          <div className="text-center mt-6">
            <button
              onClick={() => router.push('/')}
              className="text-white/60 hover:text-white transition-colors"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-5xl w-full">
        {/* Header with player info */}
        <div className="flex items-center justify-between mb-6 bg-black/40 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
              {playerName[0]?.toUpperCase()}
            </div>
            <div>
              <div className="text-white font-bold text-lg">{playerName}</div>
              <div className="text-white/60 text-sm">Casino Member</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-white/60 text-sm">Balance</div>
            <div className={`text-2xl font-bold ${balance >= 25000 ? 'text-green-400' : balance > 10000 ? 'text-yellow-400' : 'text-red-400'}`}>
              ${balance.toLocaleString()}
            </div>
          </div>
        </div>

        <h1 className="text-6xl font-bold text-center mb-4 bg-gradient-to-r from-yellow-400 via-red-500 to-purple-600 bg-clip-text text-transparent">
          🎰 The Casino 🎰
        </h1>
        <p className="text-white/80 text-center mb-8 text-xl">
          Your balance carries across all games!
        </p>

        {!showMultiplayerOptions ? (
          <div className="space-y-8">
            {/* Blackjack */}
            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-5xl">🃏</div>
                <div>
                  <h2 className="text-3xl font-bold text-white">Blackjack</h2>
                  <p className="text-white/70">Beat the dealer to 21</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleGameSelect('blackjack', 'single')}
                  className="py-3 bg-purple-500/30 hover:bg-purple-500/50 text-white rounded-xl font-bold transition-all"
                >
                  🎮 Single Player
                </button>
                <button
                  onClick={() => handleGameSelect('blackjack', 'multiplayer')}
                  className="py-3 bg-blue-500/30 hover:bg-blue-500/50 text-white rounded-xl font-bold transition-all"
                >
                  👥 Multiplayer
                </button>
              </div>
            </div>

            {/* Andar Bahar */}
            <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-5xl">🎴</div>
                <div>
                  <h2 className="text-3xl font-bold text-white">Andar Bahar</h2>
                  <p className="text-white/70">Guess which side gets the matching card</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleGameSelect('andar-bahar', 'single')}
                  className="py-3 bg-orange-500/30 hover:bg-orange-500/50 text-white rounded-xl font-bold transition-all"
                >
                  🎮 Single Player
                </button>
                <button
                  onClick={() => handleGameSelect('andar-bahar', 'multiplayer')}
                  className="py-3 bg-red-500/30 hover:bg-red-500/50 text-white rounded-xl font-bold transition-all"
                >
                  👥 Multiplayer
                </button>
              </div>
            </div>

            {/* Texas Hold'em */}
            <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-5xl">🃏</div>
                <div>
                  <h2 className="text-3xl font-bold text-white">Texas Hold&apos;em</h2>
                  <p className="text-white/70">No-limit poker action</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleGameSelect('texas-holdem', 'single')}
                  className="py-3 bg-green-500/30 hover:bg-green-500/50 text-white rounded-xl font-bold transition-all"
                >
                  🎮 Single Player
                </button>
                <button
                  onClick={() => handleGameSelect('texas-holdem', 'multiplayer')}
                  className="py-3 bg-emerald-500/30 hover:bg-emerald-500/50 text-white rounded-xl font-bold transition-all"
                >
                  👥 Multiplayer
                </button>
              </div>
            </div>

            {/* Horse Racing */}
            <div className="bg-gradient-to-br from-amber-500/10 to-yellow-500/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-5xl">🏇</div>
                <div>
                  <h2 className="text-3xl font-bold text-white">Horse Racing</h2>
                  <p className="text-white/70">Bet on your favorite horse</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleGameSelect('horse-racing', 'single')}
                  className="py-3 bg-amber-500/30 hover:bg-amber-500/50 text-white rounded-xl font-bold transition-all"
                >
                  🎮 Single Player
                </button>
                <button
                  onClick={() => handleGameSelect('horse-racing', 'multiplayer')}
                  className="py-3 bg-yellow-500/30 hover:bg-yellow-500/50 text-white rounded-xl font-bold transition-all"
                >
                  👥 Multiplayer
                </button>
              </div>
            </div>

            {/* Baccarat */}
            <div className="bg-gradient-to-br from-red-500/10 to-yellow-500/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-5xl">🎴</div>
                <div>
                  <h2 className="text-3xl font-bold text-white">Baccarat</h2>
                  <p className="text-white/70">Classic high-stakes card game</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleGameSelect('baccarat', 'single')}
                  className="py-3 bg-red-500/30 hover:bg-red-500/50 text-white rounded-xl font-bold transition-all"
                >
                  🎮 Single Player
                </button>
                <button
                  onClick={() => handleGameSelect('baccarat', 'multiplayer')}
                  className="py-3 bg-yellow-500/30 hover:bg-yellow-500/50 text-white rounded-xl font-bold transition-all"
                >
                  👥 Multiplayer
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <button
              onClick={handleBack}
              className="text-white/60 hover:text-white mb-4 flex items-center gap-2"
            >
              ← Back
            </button>

            <h2 className="text-3xl font-bold text-white text-center mb-6">
              {selectedGame === 'blackjack' ? '🃏 Blackjack' : 
               selectedGame === 'andar-bahar' ? '🎴 Andar Bahar' : 
               selectedGame === 'texas-holdem' ? '🃏 Texas Hold\'em' : 
               '🏇 Horse Racing'} Multiplayer
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Create Lobby */}
              <button
                onClick={() => router.push(`/casino/${selectedGame}?mode=create`)}
                className="group relative bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-lg rounded-3xl p-8 border border-white/20 hover:border-white/40 transition-all hover:scale-105"
              >
                <div className="text-6xl mb-4">➕</div>
                <h2 className="text-3xl font-bold text-white mb-2">Create Lobby</h2>
                <p className="text-white/70 text-lg">Start a new multiplayer game</p>
                <div className="mt-4 text-green-300 text-sm">Up to 6 players</div>
              </button>

              {/* See Lobbies */}
              <button
                onClick={() => router.push(`/casino/${selectedGame}?mode=browse`)}
                className="group relative bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-lg rounded-3xl p-8 border border-white/20 hover:border-white/40 transition-all hover:scale-105"
              >
                <div className="text-6xl mb-4">👁️</div>
                <h2 className="text-3xl font-bold text-white mb-2">See Lobbies</h2>
                <p className="text-white/70 text-lg">Browse public games</p>
                <div className="mt-4 text-blue-300 text-sm">Join open lobbies</div>
              </button>
            </div>
          </div>
        )}

        {/* Back to Home */}
        <div className="text-center mt-8 space-x-4">
          <button
            onClick={handleLeave}
            className="text-red-400 hover:text-red-300 transition-colors"
          >
            🚪 Leave Casino
          </button>
        </div>

        {/* Coming Soon Games */}
        <div className="mt-12 bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
          <h3 className="text-xl font-bold text-white mb-4 text-center">Coming Soon</h3>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4 text-center opacity-50">
            <div>
              <div className="text-4xl mb-2">🎲</div>
              <div className="text-white/60 text-sm">Craps</div>
            </div>
            <div>
              <div className="text-4xl mb-2">🎰</div>
              <div className="text-white/60 text-sm">Slots</div>
            </div>
            <div>
              <div className="text-4xl mb-2">🃏</div>
              <div className="text-white/60 text-sm">Poker</div>
            </div>
            <div>
              <div className="text-4xl mb-2">⚪</div>
              <div className="text-white/60 text-sm">Roulette</div>
            </div>
            <div>
              <div className="text-4xl mb-2">🎯</div>
              <div className="text-white/60 text-sm">Baccarat</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
