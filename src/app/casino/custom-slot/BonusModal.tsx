export default function BonusModal({ show, win, onClose }: { show: boolean; win: number; onClose: () => void }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-pink-500 to-yellow-400 rounded-3xl p-10 border-4 border-white shadow-2xl flex flex-col items-center animate-bounceIn">
        <h2 className="text-4xl font-bold text-white mb-4">Fever Bonus!</h2>
        <div className="text-6xl font-bold text-yellow-300 mb-6 animate-pulse">${win}</div>
        <button
          onClick={onClose}
          className="px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl font-bold text-2xl shadow-lg hover:scale-105 transition-all"
        >
          Collect
        </button>
      </div>
    </div>
  );
}
