import React from 'react';
import { GameStatus } from '../types';
import { RefreshCcw, Trophy, Skull } from 'lucide-react';

interface HUDProps {
  apples: number;
  totalApples: number;
  time: number;
  status: GameStatus;
  onRestart: () => void;
}

export const HUD: React.FC<HUDProps> = ({ apples, totalApples, time, status, onRestart }) => {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <>
      {/* Top Left Stats */}
      <div className="absolute top-4 left-4 bg-black/50 text-white p-4 rounded-lg backdrop-blur-sm border border-white/10 font-mono pointer-events-none select-none z-10">
        <div className="flex items-center gap-4 mb-2">
          <div className="text-red-400 font-bold flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            APPLES
          </div>
          <div className="text-xl font-bold">{apples} / {totalApples}</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-blue-400 font-bold flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
            TIME
          </div>
          <div className="text-xl font-bold">{formatTime(time)}</div>
        </div>
      </div>

      {/* Controls Hint */}
      <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 text-white/50 text-xs md:text-sm font-sans text-center md:text-right pointer-events-none select-none">
        <p>⬆/⬇ Accel/Brake • ⬅/➡ Rotate • SPACE Flip • ENTER Restart</p>
      </div>

      {/* Game Over / Win Screens */}
      {status !== GameStatus.PLAYING && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20">
          <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 text-center shadow-2xl max-w-md w-full mx-4 animate-in fade-in zoom-in duration-300">
            
            {status === GameStatus.WON && (
              <div className="flex flex-col items-center">
                <Trophy className="w-16 h-16 text-yellow-400 mb-4" />
                <h2 className="text-3xl font-black text-white mb-2 tracking-tighter">LEVEL CLEARED!</h2>
                <p className="text-neutral-400 mb-6">You collected all apples and found the flower.</p>
                <div className="text-2xl font-mono text-green-400 mb-8">Time: {formatTime(time)}</div>
              </div>
            )}

            {status === GameStatus.DEAD && (
              <div className="flex flex-col items-center">
                <Skull className="w-16 h-16 text-red-500 mb-4" />
                <h2 className="text-3xl font-black text-white mb-2 tracking-tighter">OUCH!</h2>
                <p className="text-neutral-400 mb-8">Mind your head. Gravity is not your friend.</p>
              </div>
            )}

            {status === GameStatus.MENU && (
              <div className="flex flex-col items-center">
                 <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                    <span className="text-2xl">🏍️</span>
                 </div>
                <h2 className="text-3xl font-black text-white mb-2 tracking-tighter">ELASTO-MANIA</h2>
                <p className="text-neutral-400 mb-8">Physics-based motocross.</p>
              </div>
            )}

            <button 
              onClick={onRestart}
              className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 p-4 font-medium text-white shadow-lg transition-all duration-300 hover:from-blue-500 hover:to-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-300 active:scale-95"
            >
              <span className="mr-2 text-lg font-bold">{status === GameStatus.MENU ? "START GAME" : "TRY AGAIN"}</span>
              <RefreshCcw className="w-5 h-5 transition-transform group-hover:rotate-180" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};