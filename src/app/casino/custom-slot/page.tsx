'use client';

import { useState } from 'react';
import SlotMachine from './SlotMachine';

export default function CustomSlotPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-black p-4">
      <h1 className="text-5xl font-bold text-center mb-6 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
        Fever Fortune Slot 🎰
      </h1>
      <p className="text-white/80 text-center mb-8 text-lg max-w-xl">
        Spin the reels for a chance to trigger the Fever Bonus! RTP: 96%. Buy the bonus or spin into it for huge wins. Custom animations, wilds, multipliers, and more.
      </p>
      <div className="w-full max-w-2xl mx-auto">
        <SlotMachine />
      </div>
    </div>
  );
}
