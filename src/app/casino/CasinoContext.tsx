'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface LeaderboardEntry {
  name: string;
  amount: number;
  date: string;
}

interface CasinoContextType {
  playerName: string;
  setPlayerName: (name: string) => void;
  balance: number;
  setBalance: (balance: number) => void;
  updateBalance: (amount: number) => void;
  isLoggedIn: boolean;
  logout: () => void;
  highestBalances: LeaderboardEntry[];
  biggestWins: LeaderboardEntry[];
  recordWin: (winAmount: number) => void;
}

const CasinoContext = createContext<CasinoContextType | undefined>(undefined);

export function CasinoProvider({ children }: { children: ReactNode }) {
  const [playerName, setPlayerName] = useState('');
  const [balance, setBalance] = useState(25000);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [highestBalances, setHighestBalances] = useState<LeaderboardEntry[]>([]);
  const [biggestWins, setBiggestWins] = useState<LeaderboardEntry[]>([]);
  const [peakBalance, setPeakBalance] = useState(25000);

  // Load from localStorage on mount (use localStorage for leaderboards to persist)
  useEffect(() => {
    const savedName = sessionStorage.getItem('casinoPlayerName');
    const savedBalance = sessionStorage.getItem('casinoBalance');
    const savedHighest = localStorage.getItem('casinoHighestBalances');
    const savedWins = localStorage.getItem('casinoBiggestWins');
    const savedPeak = sessionStorage.getItem('casinoPeakBalance');
    
    if (savedName) {
      setPlayerName(savedName);
      setIsLoggedIn(true);
    }
    if (savedBalance) {
      setBalance(parseInt(savedBalance));
    }
    if (savedHighest) {
      setHighestBalances(JSON.parse(savedHighest));
    }
    if (savedWins) {
      setBiggestWins(JSON.parse(savedWins));
    }
    if (savedPeak) {
      setPeakBalance(parseInt(savedPeak));
    }
  }, []);

  // Save to sessionStorage when values change
  useEffect(() => {
    if (playerName) {
      sessionStorage.setItem('casinoPlayerName', playerName);
      setIsLoggedIn(true);
    }
  }, [playerName]);

  // Track highest balance and update leaderboard
  useEffect(() => {
    sessionStorage.setItem('casinoBalance', balance.toString());
    
    // Check if this is a new peak balance for this session
    if (balance > peakBalance && playerName) {
      setPeakBalance(balance);
      sessionStorage.setItem('casinoPeakBalance', balance.toString());
      
      // Update highest balances leaderboard
      const newEntry: LeaderboardEntry = {
        name: playerName,
        amount: balance,
        date: new Date().toLocaleDateString()
      };
      
      setHighestBalances(prev => {
        // Remove any existing entry for this player and add new one
        const filtered = prev.filter(e => e.name !== playerName);
        const updated = [...filtered, newEntry]
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);
        localStorage.setItem('casinoHighestBalances', JSON.stringify(updated));
        return updated;
      });
    }
  }, [balance, peakBalance, playerName]);

  const updateBalance = (amount: number) => {
    setBalance(prev => {
      const newBalance = prev + amount;
      sessionStorage.setItem('casinoBalance', newBalance.toString());
      return newBalance;
    });
  };

  // Record a single win for biggest wins leaderboard
  const recordWin = (winAmount: number) => {
    if (!playerName || winAmount <= 0) return;
    
    const newEntry: LeaderboardEntry = {
      name: playerName,
      amount: winAmount,
      date: new Date().toLocaleDateString()
    };
    
    setBiggestWins(prev => {
      const updated = [...prev, newEntry]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
      localStorage.setItem('casinoBiggestWins', JSON.stringify(updated));
      return updated;
    });
  };

  const logout = () => {
    sessionStorage.removeItem('casinoPlayerName');
    sessionStorage.removeItem('casinoBalance');
    sessionStorage.removeItem('casinoPeakBalance');
    setPlayerName('');
    setBalance(25000);
    setPeakBalance(25000);
    setIsLoggedIn(false);
  };

  return (
    <CasinoContext.Provider value={{
      playerName,
      setPlayerName,
      balance,
      setBalance,
      updateBalance,
      isLoggedIn,
      logout,
      highestBalances,
      biggestWins,
      recordWin
    }}>
      {children}
    </CasinoContext.Provider>
  );
}

export function useCasino() {
  const context = useContext(CasinoContext);
  if (context === undefined) {
    throw new Error('useCasino must be used within a CasinoProvider');
  }
  return context;
}
