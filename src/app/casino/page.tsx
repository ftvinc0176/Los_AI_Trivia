'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Casino() {
  const router = useRouter();
  const [showMultiplayerOptions, setShowMultiplayerOptions] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <h1 className="text-6xl font-bold text-center mb-4 bg-gradient-to-r from-yellow-400 via-red-500 to-purple-600 bg-clip-text text-transparent">
          🎰 The Casino 🎰
        </h1>
        <p className="text-white/80 text-center mb-12 text-xl">
          Start with 1000 LosBucks • Premium Gaming Experience
        </p>

        {!showMultiplayerOptions ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Single Player */}
            <button
              onClick={() => router.push('/casino/blackjack?mode=single')}
              className="group relative bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-lg rounded-3xl p-8 border border-white/20 hover:border-white/40 transition-all hover:scale-105"
            >
              <div className="text-6xl mb-4">🃏</div>
              <h2 className="text-3xl font-bold text-white mb-2">Single Player</h2>
              <p className="text-white/70 text-lg">Play Blackjack against the dealer</p>
              <div className="mt-4 text-yellow-300 text-sm">Start with 1000 LosBucks</div>
            </button>

            {/* Multiplayer */}
            <button
              onClick={() => setShowMultiplayerOptions(true)}
              className="group relative bg-gradient-to-br from-blue-500/20 to-green-500/20 backdrop-blur-lg rounded-3xl p-8 border border-white/20 hover:border-white/40 transition-all hover:scale-105"
            >
              <div className="text-6xl mb-4">👥</div>
              <h2 className="text-3xl font-bold text-white mb-2">Multiplayer</h2>
              <p className="text-white/70 text-lg">Play with friends online</p>
              <div className="mt-4 text-green-300 text-sm">Create or join lobby</div>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <button
              onClick={() => setShowMultiplayerOptions(false)}
              className="text-white/60 hover:text-white mb-4 flex items-center gap-2"
            >
              ← Back
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Create Lobby */}
              <button
                onClick={() => router.push('/casino/blackjack?mode=create')}
                className="group relative bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-lg rounded-3xl p-8 border border-white/20 hover:border-white/40 transition-all hover:scale-105"
              >
                <div className="text-6xl mb-4">➕</div>
                <h2 className="text-3xl font-bold text-white mb-2">Create Lobby</h2>
                <p className="text-white/70 text-lg">Start a new multiplayer game</p>
                <div className="mt-4 text-green-300 text-sm">Up to 4 players</div>
              </button>

              {/* Join Lobby */}
              <button
                onClick={() => router.push('/casino/blackjack?mode=join')}
                className="group relative bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-lg rounded-3xl p-8 border border-white/20 hover:border-white/40 transition-all hover:scale-105"
              >
                <div className="text-6xl mb-4">🔗</div>
                <h2 className="text-3xl font-bold text-white mb-2">Join Lobby</h2>
                <p className="text-white/70 text-lg">Enter a lobby code</p>
                <div className="mt-4 text-blue-300 text-sm">Play with friends</div>
              </button>
            </div>
          </div>
        )}

        {/* Back to Home */}
        <div className="text-center mt-8">
          <button
            onClick={() => router.push('/')}
            className="text-white/60 hover:text-white transition-colors"
          >
            ← Back to Home
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
