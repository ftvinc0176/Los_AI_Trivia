'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type CardColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
type CardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

interface UnoCard {
  color: CardColor;
  value: CardValue;
  id: string;
}

interface Player {
  id: number;
  name: string;
  cards: UnoCard[];
  isBot: boolean;
}

const COLORS: CardColor[] = ['red', 'yellow', 'green', 'blue'];
const NUMBERS: CardValue[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ACTION_CARDS: CardValue[] = ['skip', 'reverse', 'draw2'];

export default function UnoGame() {
  const router = useRouter();
  const [deck, setDeck] = useState<UnoCard[]>([]);
  const [discardPile, setDiscardPile] = useState<UnoCard[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [direction, setDirection] = useState(1); // 1 for clockwise, -1 for counter-clockwise
  const [gameStarted, setGameStarted] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedColor, setSelectedColor] = useState<CardColor | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pendingWildCard, setPendingWildCard] = useState<UnoCard | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

  // Create a full UNO deck
  const createDeck = (): UnoCard[] => {
    const newDeck: UnoCard[] = [];
    let id = 0;

    // Number cards (0 has 1 of each color, 1-9 have 2 of each color)
    COLORS.forEach(color => {
      newDeck.push({ color, value: '0', id: `${id++}` });
      NUMBERS.slice(1).forEach(number => {
        newDeck.push({ color, value: number, id: `${id++}` });
        newDeck.push({ color, value: number, id: `${id++}` });
      });
    });

    // Action cards (2 of each per color)
    COLORS.forEach(color => {
      ACTION_CARDS.forEach(action => {
        newDeck.push({ color, value: action, id: `${id++}` });
        newDeck.push({ color, value: action, id: `${id++}` });
      });
    });

    // Wild cards (4 wild, 4 wild draw 4)
    for (let i = 0; i < 4; i++) {
      newDeck.push({ color: 'wild', value: 'wild', id: `${id++}` });
      newDeck.push({ color: 'wild', value: 'wild4', id: `${id++}` });
    }

    return shuffleDeck(newDeck);
  };

  const shuffleDeck = (deckToShuffle: UnoCard[]): UnoCard[] => {
    const shuffled = [...deckToShuffle];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const startGame = () => {
    const newDeck = createDeck();
    
    // Create players (1 human + 3 bots)
    const newPlayers: Player[] = [
      { id: 0, name: 'You', cards: [], isBot: false },
      { id: 1, name: 'Bot 1', cards: [], isBot: true },
      { id: 2, name: 'Bot 2', cards: [], isBot: true },
      { id: 3, name: 'Bot 3', cards: [], isBot: true }
    ];

    // Deal 7 cards to each player
    let remainingDeck = [...newDeck];
    newPlayers.forEach(player => {
      player.cards = remainingDeck.splice(0, 7);
    });

    // First card in discard pile (can't be wild)
    let firstCard = remainingDeck.pop()!;
    while (firstCard.color === 'wild') {
      remainingDeck.unshift(firstCard);
      remainingDeck = shuffleDeck(remainingDeck);
      firstCard = remainingDeck.pop()!;
    }

    setDeck(remainingDeck);
    setDiscardPile([firstCard]);
    setPlayers(newPlayers);
    setCurrentPlayerIndex(0);
    setDirection(1);
    setGameStarted(true);
    setMessage('Game started! Your turn.');
    setGameOver(false);
    setWinner(null);

    // Handle first card actions
    handleFirstCard(firstCard);
  };

  const handleFirstCard = (card: UnoCard) => {
    if (card.value === 'skip') {
      setMessage('First card is Skip! Player 1 is skipped.');
      setCurrentPlayerIndex(1);
    } else if (card.value === 'reverse') {
      setMessage('First card is Reverse! Order reversed.');
      setDirection(-1);
    } else if (card.value === 'draw2') {
      setMessage('First card is Draw 2! Player 1 draws 2 cards.');
      setTimeout(() => drawCards(1, 2), 1000);
      setCurrentPlayerIndex(1);
    }
  };

  const canPlayCard = (card: UnoCard, topCard: UnoCard): boolean => {
    if (card.color === 'wild') return true;
    if (card.color === topCard.color) return true;
    if (card.value === topCard.value) return true;
    return false;
  };

  const playCard = (playerIndex: number, cardIndex: number, chosenColor?: CardColor) => {
    const player = players[playerIndex];
    const card = player.cards[cardIndex];
    const topCard = discardPile[discardPile.length - 1];

    if (!canPlayCard(card, topCard)) {
      if (playerIndex === 0) {
        setMessage("Can't play that card!");
      }
      return false;
    }

    // Handle wild cards
    if (card.color === 'wild' && !chosenColor) {
      if (playerIndex === 0) {
        setPendingWildCard(card);
        setShowColorPicker(true);
        return false;
      } else {
        // Bot chooses most common color in their hand
        chosenColor = chooseBotColor(player.cards);
      }
    }

    // Remove card from player's hand
    const newPlayers = [...players];
    newPlayers[playerIndex].cards.splice(cardIndex, 1);
    
    // Create the played card with chosen color if wild
    const playedCard = card.color === 'wild' && chosenColor
      ? { ...card, color: chosenColor }
      : card;

    // Add to discard pile
    setDiscardPile([...discardPile, playedCard]);
    setPlayers(newPlayers);

    // Check for winner
    if (newPlayers[playerIndex].cards.length === 0) {
      setGameOver(true);
      setWinner(newPlayers[playerIndex].name);
      setMessage(`${newPlayers[playerIndex].name} wins!`);
      return true;
    }

    // Handle card effects
    let nextPlayer = (currentPlayerIndex + direction + players.length) % players.length;

    if (card.value === 'skip') {
      setMessage(`${player.name} plays Skip! Next player skipped.`);
      nextPlayer = (nextPlayer + direction + players.length) % players.length;
    } else if (card.value === 'reverse') {
      setDirection(-direction);
      setMessage(`${player.name} plays Reverse!`);
      nextPlayer = (currentPlayerIndex - direction + players.length) % players.length;
    } else if (card.value === 'draw2') {
      setMessage(`${player.name} plays Draw 2! Next player draws 2 cards.`);
      setTimeout(() => {
        drawCards(nextPlayer, 2);
      }, 500);
      nextPlayer = (nextPlayer + direction + players.length) % players.length;
    } else if (card.value === 'wild4') {
      setMessage(`${player.name} plays Wild Draw 4! Next player draws 4 cards. Color is ${chosenColor}.`);
      setTimeout(() => {
        drawCards(nextPlayer, 4);
      }, 500);
      nextPlayer = (nextPlayer + direction + players.length) % players.length;
    } else if (card.value === 'wild') {
      setMessage(`${player.name} plays Wild! Color is ${chosenColor}.`);
    } else {
      setMessage(`${player.name} plays ${card.color} ${card.value}`);
    }

    setCurrentPlayerIndex(nextPlayer);
    return true;
  };

  const drawCards = (playerIndex: number, count: number) => {
    let cardsDrawn = 0;
    const newPlayers = [...players];
    let currentDeck = [...deck];

    for (let i = 0; i < count; i++) {
      if (currentDeck.length === 0) {
        // Reshuffle discard pile into deck (keep top card)
        const topCard = discardPile[discardPile.length - 1];
        currentDeck = shuffleDeck(discardPile.slice(0, -1));
        setDiscardPile([topCard]);
      }

      if (currentDeck.length > 0) {
        newPlayers[playerIndex].cards.push(currentDeck.pop()!);
        cardsDrawn++;
      }
    }

    setDeck(currentDeck);
    setPlayers(newPlayers);
  };

  const drawCard = () => {
    if (currentPlayerIndex !== 0) return;

    if (deck.length === 0) {
      // Reshuffle discard pile
      const topCard = discardPile[discardPile.length - 1];
      setDeck(shuffleDeck(discardPile.slice(0, -1)));
      setDiscardPile([topCard]);
    }

    const newPlayers = [...players];
    const drawnCard = deck[deck.length - 1];
    newPlayers[0].cards.push(drawnCard);
    setDeck(deck.slice(0, -1));
    setPlayers(newPlayers);

    const topCard = discardPile[discardPile.length - 1];
    if (canPlayCard(drawnCard, topCard)) {
      setMessage('Drew a card! You can play it or pass.');
    } else {
      setMessage('Drew a card. Passing turn...');
      setTimeout(() => {
        const nextPlayer = (currentPlayerIndex + direction + players.length) % players.length;
        setCurrentPlayerIndex(nextPlayer);
      }, 1000);
    }
  };

  const passTurn = () => {
    if (currentPlayerIndex !== 0) return;
    const nextPlayer = (currentPlayerIndex + direction + players.length) % players.length;
    setCurrentPlayerIndex(nextPlayer);
    setMessage('Turn passed.');
  };

  const chooseBotColor = (cards: UnoCard[]): CardColor => {
    const colorCounts = { red: 0, yellow: 0, green: 0, blue: 0 };
    cards.forEach(card => {
      if (card.color !== 'wild') {
        colorCounts[card.color]++;
      }
    });
    const validColors: Array<'red' | 'yellow' | 'green' | 'blue'> = ['red', 'yellow', 'green', 'blue'];
    return validColors.reduce((a, b) =>
      colorCounts[a] > colorCounts[b] ? a : b
    );
  };

  const botTurn = () => {
    if (gameOver) return;
    
    const bot = players[currentPlayerIndex];
    const topCard = discardPile[discardPile.length - 1];

    // Find playable cards
    const playableIndices = bot.cards
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => canPlayCard(card, topCard));

    if (playableIndices.length > 0) {
      // Prioritize action cards and wilds
      const wildCards = playableIndices.filter(({ card }) => card.value === 'wild4' || card.value === 'wild');
      const actionCards = playableIndices.filter(({ card }) => ['skip', 'reverse', 'draw2'].includes(card.value));
      
      let cardToPlay;
      if (bot.cards.length <= 3 && wildCards.length > 0) {
        // Use wild when close to winning
        cardToPlay = wildCards[0];
      } else if (actionCards.length > 0) {
        // Prefer action cards
        cardToPlay = actionCards[Math.floor(Math.random() * actionCards.length)];
      } else {
        // Play random playable card
        cardToPlay = playableIndices[Math.floor(Math.random() * playableIndices.length)];
      }

      setTimeout(() => {
        playCard(currentPlayerIndex, cardToPlay.index);
      }, 1500);
    } else {
      // Draw a card
      setMessage(`${bot.name} draws a card...`);
      setTimeout(() => {
        drawCards(currentPlayerIndex, 1);
        const newBot = { ...players[currentPlayerIndex] };
        const drawnCard = newBot.cards[newBot.cards.length - 1];
        
        if (canPlayCard(drawnCard, topCard)) {
          setTimeout(() => {
            playCard(currentPlayerIndex, newBot.cards.length - 1);
          }, 1000);
        } else {
          setTimeout(() => {
            const nextPlayer = (currentPlayerIndex + direction + players.length) % players.length;
            setCurrentPlayerIndex(nextPlayer);
            setMessage(`${bot.name} passes.`);
          }, 1000);
        }
      }, 1000);
    }
  };

  // Handle bot turns
  useEffect(() => {
    if (gameStarted && !gameOver && players[currentPlayerIndex]?.isBot) {
      botTurn();
    }
  }, [currentPlayerIndex, gameStarted, gameOver]);

  const handleWildColorChoice = (color: CardColor) => {
    if (!pendingWildCard) return;

    const cardIndex = players[0].cards.findIndex(c => c.id === pendingWildCard.id);
    setShowColorPicker(false);
    setPendingWildCard(null);
    playCard(0, cardIndex, color);
  };

  const getCardColor = (color: CardColor): string => {
    switch (color) {
      case 'red': return 'bg-red-500';
      case 'yellow': return 'bg-yellow-400';
      case 'green': return 'bg-green-500';
      case 'blue': return 'bg-blue-500';
      case 'wild': return 'bg-gradient-to-br from-red-500 via-yellow-400 via-green-500 to-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getCardSymbol = (value: CardValue): string => {
    switch (value) {
      case 'skip': return '🚫';
      case 'reverse': return '🔄';
      case 'draw2': return '+2';
      case 'wild': return '🌈';
      case 'wild4': return '+4';
      default: return value;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 p-4">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex justify-between items-center">
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-all"
          >
            ← Home
          </button>
          <h1 className="text-5xl font-bold text-white">UNO</h1>
          <button
            onClick={startGame}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 rounded-xl text-white font-semibold transition-all"
          >
            New Game
          </button>
        </div>
      </div>

      {!gameStarted ? (
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
            <div className="text-8xl mb-6">🎴</div>
            <h2 className="text-4xl font-bold text-white mb-4">Ready to Play UNO?</h2>
            <p className="text-xl text-white/80 mb-8">Compete against 3 AI opponents!</p>
            <button
              onClick={startGame}
              className="px-12 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-2xl text-white text-2xl font-bold transition-all transform hover:scale-105"
            >
              Start Game
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto">
          {/* Opponents */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {players.slice(1).map((player, idx) => (
              <div
                key={player.id}
                className={`bg-white/10 backdrop-blur-lg rounded-2xl p-4 border-2 transition-all ${
                  currentPlayerIndex === player.id ? 'border-yellow-400 shadow-lg shadow-yellow-400/50' : 'border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-semibold">{player.name}</span>
                  <span className="text-2xl">{currentPlayerIndex === player.id ? '👉' : '🤖'}</span>
                </div>
                <div className="mt-2 flex gap-1">
                  {player.cards.map((_, cardIdx) => (
                    <div
                      key={cardIdx}
                      className="w-8 h-12 bg-gradient-to-br from-gray-700 to-gray-900 rounded border border-white/30"
                    />
                  ))}
                  <span className="ml-2 text-white text-sm self-center">({player.cards.length})</span>
                </div>
              </div>
            ))}
          </div>

          {/* Game Board */}
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 mb-8">
            <div className="flex justify-center items-center gap-8">
              {/* Deck */}
              <div className="text-center">
                <div className="text-white mb-2 font-semibold">Deck</div>
                <div
                  onClick={currentPlayerIndex === 0 && !gameOver ? drawCard : undefined}
                  className={`w-24 h-36 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl border-4 border-white/30 flex items-center justify-center text-white text-4xl ${
                    currentPlayerIndex === 0 && !gameOver ? 'cursor-pointer hover:scale-105 transition-transform' : ''
                  }`}
                >
                  🎴
                </div>
                <div className="text-white/60 text-sm mt-1">{deck.length} cards</div>
              </div>

              {/* Current Card */}
              <div className="text-center">
                <div className="text-white mb-2 font-semibold">Current Card</div>
                {discardPile.length > 0 && (
                  <div
                    className={`w-24 h-36 ${getCardColor(discardPile[discardPile.length - 1].color)} rounded-xl border-4 border-white flex items-center justify-center text-white text-3xl font-bold shadow-2xl transform rotate-6`}
                  >
                    {getCardSymbol(discardPile[discardPile.length - 1].value)}
                  </div>
                )}
              </div>

              {/* Direction & Message */}
              <div className="text-center max-w-xs">
                <div className="text-white mb-2 font-semibold">Status</div>
                <div className="text-3xl mb-2">{direction === 1 ? '↻' : '↺'}</div>
                <div className="text-white/90 text-sm">{message}</div>
              </div>
            </div>
          </div>

          {/* Your Hand */}
          <div
            className={`bg-white/10 backdrop-blur-lg rounded-3xl p-6 border-2 ${
              currentPlayerIndex === 0 ? 'border-yellow-400 shadow-lg shadow-yellow-400/50' : 'border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-white">Your Hand {currentPlayerIndex === 0 ? '(Your Turn!)' : ''}</h3>
              {currentPlayerIndex === 0 && !gameOver && (
                <button
                  onClick={passTurn}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-semibold transition-all"
                >
                  Pass Turn
                </button>
              )}
            </div>
            <div className="flex gap-3 flex-wrap justify-center">
              {players[0]?.cards.map((card, index) => (
                <div
                  key={card.id}
                  onClick={() => {
                    if (currentPlayerIndex === 0 && !gameOver) {
                      playCard(0, index);
                    }
                  }}
                  className={`w-20 h-32 ${getCardColor(card.color)} rounded-xl border-4 border-white flex flex-col items-center justify-center text-white font-bold shadow-lg transition-all ${
                    currentPlayerIndex === 0 && !gameOver && canPlayCard(card, discardPile[discardPile.length - 1])
                      ? 'cursor-pointer hover:scale-110 hover:-translate-y-2'
                      : currentPlayerIndex === 0 && !gameOver
                      ? 'opacity-50 cursor-not-allowed'
                      : 'opacity-70'
                  }`}
                >
                  <div className="text-3xl">{getCardSymbol(card.value)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Color Picker Modal */}
          {showColorPicker && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-white/20 backdrop-blur-xl rounded-3xl p-8 border border-white/30">
                <h3 className="text-2xl font-bold text-white mb-6 text-center">Choose a Color</h3>
                <div className="grid grid-cols-2 gap-4">
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => handleWildColorChoice(color)}
                      className={`w-32 h-32 ${getCardColor(color)} rounded-2xl border-4 border-white font-bold text-white text-xl hover:scale-110 transition-transform shadow-2xl`}
                    >
                      {color.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Game Over Modal */}
          {gameOver && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-white/20 backdrop-blur-xl rounded-3xl p-12 border border-white/30 text-center">
                <div className="text-8xl mb-4">🎉</div>
                <h2 className="text-5xl font-bold text-white mb-4">{winner} Wins!</h2>
                <button
                  onClick={startGame}
                  className="px-8 py-4 bg-green-500 hover:bg-green-600 rounded-2xl text-white text-xl font-bold transition-all transform hover:scale-105"
                >
                  Play Again
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
