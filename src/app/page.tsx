'use client';

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h1 className="text-7xl font-bold text-white mb-4 tracking-tight">
            LosGames
            <span className="text-5xl font-light ml-2 text-purple-200">1.3.3</span>
          </h1>
          <p className="text-xl text-purple-100 font-light">
            Multiplayer Gaming Hub
          </p>
        </div>

        {/* Main Menu Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-6 mb-12 animate-slide-up">
          {/* Caseonaire Card */}
          <button
            onClick={() => router.push('/singleplayer')}
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">💼</div>
              <h2 className="text-3xl font-bold text-white mb-3">Caseonaire</h2>
              <p className="text-purple-100 font-light">
                Win cases with AI trivia
              </p>
            </div>
          </button>

          {/* AI Trivia Card */}
          <button
            onClick={() => router.push('/ai-trivia')}
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">🤖</div>
              <h2 className="text-3xl font-bold text-white mb-3">AI Trivia</h2>
              <p className="text-purple-100 font-light">
                Solo trivia with AI questions
              </p>
            </div>
          </button>

          {/* Trivia Battle Card */}
          <button
            onClick={() => router.push('/multiplayer')}
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-red-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">🎮</div>
              <h2 className="text-3xl font-bold text-white mb-3">Trivia Battle</h2>
              <p className="text-purple-100 font-light">
                Compete with up to 4 players
              </p>
            </div>
          </button>

          {/* FPS Arena Card */}
          <button
            onClick={() => router.push('/fps')}
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">🎯</div>
              <h2 className="text-3xl font-bold text-white mb-3">FPS Arena</h2>
              <p className="text-purple-100 font-light">
                Real-time deathmatch
              </p>
            </div>
          </button>

          {/* Casino Card */}
          <button
            onClick={() => router.push('/casino')}
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-violet-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">🎰</div>
              <h2 className="text-3xl font-bold text-white mb-3">The Casino</h2>
              <p className="text-purple-100 font-light">
                Blackjack & more games
              </p>
            </div>
          </button>

          {/* Draw & Guess Card */}
          <button
            onClick={() => router.push('/games/draw-guess')}
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">🎨</div>
              <h2 className="text-3xl font-bold text-white mb-3">AI Drawing</h2>
              <p className="text-purple-100 font-light">
                Draw prompts, AI enhances
              </p>
            </div>
          </button>

          {/* Draw Battle Card */}
          <button
            onClick={() => router.push('/games/draw-battle')}
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">🎨⚔️</div>
              <h2 className="text-3xl font-bold text-white mb-3">Draw Battle</h2>
              <p className="text-purple-100 font-light">
                Multiplayer drawing battle
              </p>
            </div>
          </button>

          {/* CS Betting Card */}
          <button
            onClick={() => router.push('/cs-betting')}
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-red-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">💰🎯</div>
              <h2 className="text-3xl font-bold text-white mb-3">CS Betting</h2>
              <p className="text-purple-100 font-light">
                Bet on bot matches
              </p>
            </div>
          </button>

          {/* UNO Card */}
          <button
            onClick={() => router.push('/uno')}
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 via-yellow-500/20 to-blue-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">🎴</div>
              <h2 className="text-3xl font-bold text-white mb-3">UNO</h2>
              <p className="text-purple-100 font-light">
                Classic card game vs AI
              </p>
            </div>
          </button>

          {/* Donate Card */}
          <a
            href="https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=ftvinc1999@gmail.com&currency_code=USD&item_name=LosGames%20Donation"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-teal-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">💝</div>
              <h2 className="text-3xl font-bold text-white mb-3">Support Us</h2>
              <p className="text-purple-100 font-light">
                Help keep servers running
              </p>
            </div>
          </a>
        </div>

        {/* Footer Info */}
        <div className="text-center text-purple-200 text-sm font-light animate-fade-in">
          <p>Powered by AI • Real-time Multiplayer • Built for Fun</p>
        </div>
      </div>
    </div>
  );
}
