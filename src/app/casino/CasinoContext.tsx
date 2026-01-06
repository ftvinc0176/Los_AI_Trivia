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
  checkAndReload: () => boolean;
  isLoggedIn: boolean;
  logout: () => void;
  highestBalances: LeaderboardEntry[];
  mostWagered: LeaderboardEntry[];
  recordBet: (betAmount: number) => void;
  refreshLeaderboards: () => void;
  loginWithUsername: (name: string) => Promise<void>;
}

const CasinoContext = createContext<CasinoContextType | undefined>(undefined);

export function CasinoProvider({ children }: { children: ReactNode }) {
  const [playerName, setPlayerName] = useState('');
  const [balance, setBalance] = useState(25000);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [highestBalances, setHighestBalances] = useState<LeaderboardEntry[]>([]);
  const [mostWagered, setMostWagered] = useState<LeaderboardEntry[]>([]);
  const [peakBalance, setPeakBalance] = useState(25000);

  // Fetch leaderboards from API
  const fetchLeaderboards = useCallback(async () => {
    try {
      const response = await fetch('/api/leaderboard');
      if (response.ok) {
        const data = await response.json();
        setHighestBalances(data.highestBalances || []);
        setMostWagered(data.mostWagered || []);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboards:', error);
    }
  }, []);

  // Login with username - fetches balance from server if exists
  const loginWithUsername = useCallback(async (name: string) => {
    try {
      // Check if this username has a saved balance on the server
      const response = await fetch(`/api/leaderboard?username=${encodeURIComponent(name)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.userBalance !== null && data.userBalance !== undefined) {
          // User exists - restore their balance
          setBalance(data.userBalance);
          setPeakBalance(data.userBalance);
          sessionStorage.setItem('casinoBalance', data.userBalance.toString());
          sessionStorage.setItem('casinoPeakBalance', data.userBalance.toString());
        } else {
          // New user - start with default balance
          setBalance(25000);
          setPeakBalance(25000);
          sessionStorage.setItem('casinoBalance', '25000');
          sessionStorage.setItem('casinoPeakBalance', '25000');
        }
        setHighestBalances(data.highestBalances || []);
        setMostWagered(data.mostWagered || []);
      }
    } catch (error) {
      console.error('Failed to check user balance:', error);
      // Default to 25000 on error
      setBalance(25000);
      setPeakBalance(25000);
    }
    
    setPlayerName(name);
    sessionStorage.setItem('casinoPlayerName', name);
    setIsLoggedIn(true);
  }, []);

  // Load session data and fetch leaderboards on mount
  useEffect(() => {
    const savedName = sessionStorage.getItem('casinoPlayerName');
    const savedBalance = sessionStorage.getItem('casinoBalance');
    const savedPeak = sessionStorage.getItem('casinoPeakBalance');
    
    if (savedName) {
      setPlayerName(savedName);
      setIsLoggedIn(true);
      
      // Sync with server to get latest balance
      fetch(`/api/leaderboard?username=${encodeURIComponent(savedName)}`)
        .then(res => res.json())
        .then(data => {
          // Use the higher of local or server balance
          const localBalance = savedBalance ? parseInt(savedBalance) : 25000;
          const serverBalance = data.userBalance ?? localBalance;
          const finalBalance = Math.max(localBalance, serverBalance);
          
          setBalance(finalBalance);
          setPeakBalance(savedPeak ? Math.max(parseInt(savedPeak), finalBalance) : finalBalance);
          sessionStorage.setItem('casinoBalance', finalBalance.toString());
          
          setHighestBalances(data.highestBalances || []);
          setMostWagered(data.mostWagered || []);
        })
        .catch(err => {
          console.error('Failed to sync with server:', err);
          if (savedBalance) setBalance(parseInt(savedBalance));
          if (savedPeak) setPeakBalance(parseInt(savedPeak));
        });
    } else {
      // Just fetch leaderboards
      fetchLeaderboards();
    }
    
    // Refresh leaderboards every 5 seconds for live updates
    const interval = setInterval(fetchLeaderboards, 5000);
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
      
      // Update highest balances leaderboard and sync balance via API
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
          setMostWagered(data.mostWagered || []);
        })
        .catch(err => console.error('Failed to update balance leaderboard:', err));
    } else if (playerName) {
      // Just sync the balance even if not a peak
      fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'syncBalance',
          name: playerName,
          amount: balance
        })
      }).catch(err => console.error('Failed to sync balance:', err));
    }
  }, [balance, peakBalance, playerName]);

  const updateBalance = (amount: number) => {
    setBalance(prev => {
      const newBalance = prev + amount;
      sessionStorage.setItem('casinoBalance', newBalance.toString());
      return newBalance;
    });
  };

  // Manual reload check - call this after a game round ends
  const checkAndReload = () => {
    if (balance < 1000 && playerName) {
      setBalance(25000);
      sessionStorage.setItem('casinoBalance', '25000');
      return true;
    }
    return false;
  };

  // Record a bet for most wagered leaderboard via API
  const recordBet = useCallback((betAmount: number) => {
    if (!playerName || betAmount <= 0) return;
    
    fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'wager',
        name: playerName,
        amount: betAmount
      })
    })
      .then(res => res.json())
      .then(data => {
        setHighestBalances(data.highestBalances || []);
        setMostWagered(data.mostWagered || []);
      })
      .catch(err => console.error('Failed to record bet:', err));
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
      checkAndReload,
      isLoggedIn,
      logout,
      highestBalances,
      mostWagered,
      recordBet,
      refreshLeaderboards,
      loginWithUsername
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
