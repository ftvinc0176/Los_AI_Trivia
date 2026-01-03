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
            Los_Trivia
            <span className="text-5xl font-light ml-2 text-purple-200">1.0</span>
          </h1>
          <p className="text-xl text-purple-100 font-light">
            AI-Powered Premium Trivia Experience
          </p>
        </div>

        {/* Main Menu Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-12 animate-slide-up">
          {/* Single Player Card */}
          <button
            onClick={() => router.push('/singleplayer')}
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">🎯</div>
              <h2 className="text-3xl font-bold text-white mb-3">Single Player</h2>
              <p className="text-purple-100 font-light">
                Challenge yourself with AI-generated trivia questions
              </p>
            </div>
          </button>

          {/* Multiplayer Card */}
          <button
            onClick={() => router.push('/multiplayer')}
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-blue-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">👥</div>
              <h2 className="text-3xl font-bold text-white mb-3">Multiplayer</h2>
              <p className="text-purple-100 font-light">
                Compete with friends in real-time trivia battles
              </p>
            </div>
          </button>

          {/* Donate Card */}
          <a
            href="https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=ftvinc1999@gmail.com&currency_code=USD&item_name=Los_Trivia%20Donation"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative bg-white/10 backdrop-blur-lg rounded-3xl p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-6xl mb-4">💝</div>
              <h2 className="text-3xl font-bold text-white mb-3">Donate</h2>
              <p className="text-purple-100 font-light">
                Support the development of Los_Trivia
              </p>
            </div>
          </a>
        </div>

        {/* Footer Info */}
        <div className="text-center text-purple-200 text-sm font-light animate-fade-in">
          <p>Powered by Gemini AI • Real-time Multiplayer • Premium Experience</p>
        </div>
      </div>
    </div>
  );
}
