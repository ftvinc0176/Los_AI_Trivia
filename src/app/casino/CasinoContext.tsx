'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface CasinoContextType {
  playerName: string;
  setPlayerName: (name: string) => void;
  balance: number;
  setBalance: (balance: number) => void;
  updateBalance: (amount: number) => void;
  isLoggedIn: boolean;
  logout: () => void;
}

const CasinoContext = createContext<CasinoContextType | undefined>(undefined);

export function CasinoProvider({ children }: { children: ReactNode }) {
  const [playerName, setPlayerName] = useState('');
  const [balance, setBalance] = useState(25000);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Load from sessionStorage on mount
  useEffect(() => {
    const savedName = sessionStorage.getItem('casinoPlayerName');
    const savedBalance = sessionStorage.getItem('casinoBalance');
    
    if (savedName) {
      setPlayerName(savedName);
      setIsLoggedIn(true);
    }
    if (savedBalance) {
      setBalance(parseInt(savedBalance));
    }
  }, []);

  // Save to sessionStorage when values change
  useEffect(() => {
    if (playerName) {
      sessionStorage.setItem('casinoPlayerName', playerName);
      setIsLoggedIn(true);
    }
  }, [playerName]);

  useEffect(() => {
    sessionStorage.setItem('casinoBalance', balance.toString());
  }, [balance]);

  const updateBalance = (amount: number) => {
    setBalance(prev => {
      const newBalance = prev + amount;
      sessionStorage.setItem('casinoBalance', newBalance.toString());
      return newBalance;
    });
  };

  const logout = () => {
    sessionStorage.removeItem('casinoPlayerName');
    sessionStorage.removeItem('casinoBalance');
    setPlayerName('');
    setBalance(25000);
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
      logout
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
