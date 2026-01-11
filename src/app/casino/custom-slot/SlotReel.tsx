import { useEffect, useState } from 'react';

export default function SlotReel({ symbols, spinning }: { symbols: any[]; spinning: boolean }) {
  const [displaySymbols, setDisplaySymbols] = useState(symbols);

  useEffect(() => {
    if (spinning) {
      // Animate: cycle through random symbols
      let interval = setInterval(() => {
        setDisplaySymbols(symbols.map(() => symbols[Math.floor(Math.random() * symbols.length)]));
      }, 80);
      setTimeout(() => {
        clearInterval(interval);
        setDisplaySymbols(symbols);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setDisplaySymbols(symbols);
    }
  }, [spinning, symbols]);

  return (
    <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl border-4 border-yellow-400 shadow-lg flex flex-col items-center w-20 h-48 overflow-hidden">
      {displaySymbols.map((sym, i) => (
        <div
          key={i}
          className={`flex items-center justify-center h-1/3 w-full text-xl font-bold ${sym.color} text-white transition-all duration-300`}
        >
          {sym.name}
        </div>
      ))}
    </div>
  );
}
