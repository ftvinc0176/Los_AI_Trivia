'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';

interface Player {
  id: string;
  name: string;
  prompt: string;
  drawing: string;
  enhancedImage: string;
  score: number;
}

function AIDrawingGame() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [gameState, setGameState] = useState<'start' | 'drawing' | 'enhancing' | 'results'>('start');
  const [myPrompt, setMyPrompt] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [player, setPlayer] = useState<Player | null>(null);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const [puterLoaded, setPuterLoaded] = useState(false);

  // Load Puter.js for free image enhancement
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).puter) {
      const script = document.createElement('script');
      script.src = 'https://js.puter.com/v2/';
      script.async = true;
      script.onload = () => setPuterLoaded(true);
      document.head.appendChild(script);
    } else {
      setPuterLoaded(true);
    }
  }, []);

  // Setup canvas
  useEffect(() => {
    if (canvasRef.current && gameState === 'drawing') {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw college-ruled paper background
        ctx.fillStyle = '#FFF8DC';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw red margin line
        ctx.strokeStyle = '#FF6B6B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(80, 0);
        ctx.lineTo(80, canvas.height);
        ctx.stroke();
        
        // Draw horizontal lines
        ctx.strokeStyle = '#87CEEB';
        ctx.lineWidth = 1;
        for (let y = 30; y < canvas.height; y += 30) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
        
        setContext(ctx);
      }
    }
  }, [gameState]);

  // Timer countdown
  useEffect(() => {
    if (gameState === 'drawing' && timeRemaining > 0) {
      const timer = setTimeout(() => setTimeRemaining(timeRemaining - 1), 1000);
      return () => clearTimeout(timer);
    } else if (gameState === 'drawing' && timeRemaining === 0) {
      submitDrawing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, timeRemaining]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!context) return;
    setIsDrawing(true);
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    context.beginPath();
    context.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !context) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    context.strokeStyle = '#000';
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineTo(x, y);
    context.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    if (!canvasRef.current || !context) return;
    const canvas = canvasRef.current;
    
    // Redraw background
    context.fillStyle = '#FFF8DC';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Redraw lines
    context.strokeStyle = '#FF6B6B';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(80, 0);
    context.lineTo(80, canvas.height);
    context.stroke();
    
    context.strokeStyle = '#87CEEB';
    context.lineWidth = 1;
    for (let y = 30; y < canvas.height; y += 30) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    }
  };

  const submitDrawing = async () => {
    if (!canvasRef.current) return;
    
    const drawing = canvasRef.current.toDataURL('image/png');
    setGameState('enhancing');
    
    try {
      let enhancedImageUrl = drawing;

      // Use Puter.js for FREE AI image-to-image enhancement
      if ((window as any).puter && puterLoaded) {
        try {
          const base64Data = drawing.split(',')[1];
          
          const imageElement = await (window as any).puter.ai.txt2img(
            `Transform this simple sketch into a highly detailed, realistic photograph with professional quality, 4k resolution, sharp focus, photorealistic`,
            { 
              model: 'gemini-2.5-flash-image-preview',
              input_image: base64Data,
              input_image_mime_type: 'image/png'
            }
          );
          
          enhancedImageUrl = imageElement.src;
        } catch (puterError) {
          console.error('Puter.js enhancement error:', puterError);
        }
      }

      setPlayer({
        id: 'player1',
        name: 'You',
        prompt: myPrompt,
        drawing,
        enhancedImage: enhancedImageUrl,
        score: 0
      });
      setGameState('results');
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to enhance drawing. Please try again.');
      setGameState('drawing');
    }
  };

  const startGame = async () => {
    setGameState('enhancing');
    
    try {
      const response = await fetch('/api/generate-drawing-prompt');
      const data = await response.json();
      
      if (data.prompt) {
        setMyPrompt(data.prompt);
        setGameState('drawing');
        setTimeRemaining(60);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to start game');
      setGameState('start');
    }
  };

  const playAgain = () => {
    setGameState('start');
    setMyPrompt('');
    setTimeRemaining(60);
    setPlayer(null);
  };

  // Start Screen
  if (gameState === 'start') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
          <h1 className="text-5xl font-bold text-white mb-8 text-center">🎨 AI Drawing</h1>
          <p className="text-white/80 text-lg mb-8 text-center">
            Draw creative prompts in 60 seconds and watch AI transform your sketch into a masterpiece!
          </p>
          <button
            onClick={startGame}
            className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-lg transition-all"
          >
            Start Drawing!
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full mt-4 text-white/60 hover:text-white"
          >
            ← Back to Games
          </button>
        </div>
      </div>
    );
  }

  // Drawing Screen
  if (gameState === 'drawing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="max-w-4xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl">
          <div className="mb-6 text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Draw This!</h2>
            <p className="text-3xl text-yellow-300 font-bold mb-4">{myPrompt}</p>
            <div className="flex items-center justify-center gap-4">
              <div className="text-2xl text-white font-bold">⏱️ {timeRemaining}s</div>
              <div className="h-3 flex-1 max-w-xs bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-1000"
                  style={{ width: `${(timeRemaining / 60) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl p-4 mb-6">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className="border-2 border-gray-300 rounded-lg cursor-crosshair w-full"
              style={{ touchAction: 'none' }}
            />
          </div>
          
          <div className="flex gap-4">
            <button
              onClick={clearCanvas}
              className="flex-1 px-6 py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-lg"
            >
              Clear
            </button>
            <button
              onClick={submitDrawing}
              className="flex-1 px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-lg"
            >
              Submit Drawing
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Enhancing Screen
  if (gameState === 'enhancing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="text-center">
          <div className="w-20 h-20 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-4xl font-bold text-white mb-2">Enhancing Your Drawing...</h2>
          <p className="text-white/80 text-xl">AI is making it look amazing!</p>
        </div>
      </div>
    );
  }

  // Results Screen
  if (gameState === 'results' && player) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="max-w-6xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl">
          <h2 className="text-4xl font-bold text-white mb-8 text-center">Results!</h2>
          
          <div className="bg-white/10 rounded-2xl p-6 border border-white/20 mb-8">
            <p className="text-2xl text-yellow-300 mb-6 text-center font-bold">Prompt: {player.prompt}</p>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-4">
                <h4 className="text-lg font-bold text-gray-800 mb-3 text-center">Your Drawing</h4>
                <img src={player.drawing} alt="Original drawing" className="w-full rounded-lg" />
              </div>
              
              <div className="bg-white rounded-2xl p-4">
                <h4 className="text-lg font-bold text-gray-800 mb-3 text-center">AI Enhanced</h4>
                <img src={player.enhancedImage} alt="AI enhanced" className="w-full rounded-lg" />
              </div>
            </div>
          </div>
          
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/')}
              className="flex-1 px-6 py-4 bg-white/20 hover:bg-white/30 text-white rounded-xl font-bold text-lg"
            >
              Main Menu
            </button>
            <button
              onClick={playAgain}
              className="flex-1 px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-lg"
            >
              Play Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function AIDrawing() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}><div className="text-white text-2xl">Loading...</div></div>}>
      <AIDrawingGame />
    </Suspense>
  );
}
