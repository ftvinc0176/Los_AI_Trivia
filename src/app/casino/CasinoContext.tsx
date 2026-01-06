'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';

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
  refreshLeaderboards: () => void;
}

const CasinoContext = createContext<CasinoContextType | undefined>(undefined);

export function CasinoProvider({ children }: { children: ReactNode }) {
  const [playerName, setPlayerName] = useState('');
  const [balance, setBalance] = useState(25000);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [highestBalances, setHighestBalances] = useState<LeaderboardEntry[]>([]);
  const [biggestWins, setBiggestWins] = useState<LeaderboardEntry[]>([]);
  const [peakBalance, setPeakBalance] = useState(25000);

  // Fetch leaderboards from API
  const fetchLeaderboards = useCallback(async () => {
    try {
      const response = await fetch('/api/leaderboard');
      if (response.ok) {
        const data = await response.json();
        setHighestBalances(data.highestBalances || []);
        setBiggestWins(data.biggestWins || []);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboards:', error);
    }
  }, []);

  // Load session data and fetch leaderboards on mount
  useEffect(() => {
    const savedName = sessionStorage.getItem('casinoPlayerName');
    const savedBalance = sessionStorage.getItem('casinoBalance');
    const savedPeak = sessionStorage.getItem('casinoPeakBalance');
    
    if (savedName) {
      setPlayerName(savedName);
      setIsLoggedIn(true);
    }
    if (savedBalance) {
      setBalance(parseInt(savedBalance));
    }
    if (savedPeak) {
      setPeakBalance(parseInt(savedPeak));
    }
    
    // Fetch leaderboards from server
    fetchLeaderboards();
    
    // Refresh leaderboards every 30 seconds
    const interval = setInterval(fetchLeaderboards, 30000);
    return () => clearInterval(interval);
  }, [fetchLeaderboards]);

  // Save to sessionStorage when values change
  useEffect(() => {
    if (playerName) {
      sessionStorage.setItem('casinoPlayerName', playerName);
      setIsLoggedIn(true);
    }
  }, [playerName]);

  // Track highest balance and update leaderboard via API
  useEffect(() => {
    sessionStorage.setItem('casinoBalance', balance.toString());
    
    // Check if this is a new peak balance for this session
    if (balance > peakBalance && playerName) {
      setPeakBalance(balance);
      sessionStorage.setItem('casinoPeakBalance', balance.toString());
      
      // Update highest balances leaderboard via API
      fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'balance',
          name: playerName,
          amount: balance
        })
      })
        .then(res => res.json())
        .then(data => {
          setHighestBalances(data.highestBalances || []);
          setBiggestWins(data.biggestWins || []);
        })
        .catch(err => console.error('Failed to update balance leaderboard:', err));
    }
  }, [balance, peakBalance, playerName]);

  const updateBalance = (amount: number) => {
    setBalance(prev => {
      const newBalance = prev + amount;
      sessionStorage.setItem('casinoBalance', newBalance.toString());
      return newBalance;
    });
  };

  // Record a single win for biggest wins leaderboard via API
  const recordWin = useCallback((winAmount: number) => {
    if (!playerName || winAmount <= 0) return;
    
    fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'win',
        name: playerName,
        amount: winAmount
      })
    })
      .then(res => res.json())
      .then(data => {
        setHighestBalances(data.highestBalances || []);
        setBiggestWins(data.biggestWins || []);
      })
      .catch(err => console.error('Failed to record win:', err));
  }, [playerName]);

  // Refresh leaderboards manually
  const refreshLeaderboards = useCallback(() => {
    fetchLeaderboards();
  }, [fetchLeaderboards]);

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
      recordWin,
      refreshLeaderboards
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
