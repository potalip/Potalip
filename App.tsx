import React, { useState } from 'react';
import { GameCanvas } from './components/GameCanvas';

const App: React.FC = () => {
  return (
    <div className="w-full h-screen bg-neutral-900 flex items-center justify-center relative overflow-hidden">
      <GameCanvas />
    </div>
  );
};

export default App;