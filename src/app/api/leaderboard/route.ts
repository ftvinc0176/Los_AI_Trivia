'use server';

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'leaderboards.json');

interface LeaderboardEntry {
  name: string;
  amount: number;
  date: string;
}

interface LeaderboardData {
  highestBalances: LeaderboardEntry[];
  biggestWins: LeaderboardEntry[];
}

// Ensure data directory and file exist
function ensureDataFile(): LeaderboardData {
  const dataDir = path.join(process.cwd(), 'data');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (!fs.existsSync(DATA_FILE)) {
    const initialData: LeaderboardData = {
      highestBalances: [],
      biggestWins: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    const initialData: LeaderboardData = {
      highestBalances: [],
      biggestWins: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
}

// GET - Fetch leaderboards
export async function GET() {
  try {
    const data = ensureDataFile();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading leaderboard:', error);
    return NextResponse.json(
      { highestBalances: [], biggestWins: [] },
      { status: 500 }
    );
  }
}

// POST - Update leaderboard
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, name, amount } = body;
    
    if (!type || !name || amount === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: type, name, amount' },
        { status: 400 }
      );
    }
    
    const data = ensureDataFile();
    
    const newEntry: LeaderboardEntry = {
      name,
      amount,
      date: new Date().toLocaleDateString()
    };
    
    if (type === 'balance') {
      // Check if user already exists in highest balances
      const existingIndex = data.highestBalances.findIndex(e => e.name === name);
      
      if (existingIndex !== -1) {
        // Update only if new balance is higher
        if (amount > data.highestBalances[existingIndex].amount) {
          data.highestBalances[existingIndex] = newEntry;
        }
      } else {
        data.highestBalances.push(newEntry);
      }
      
      // Sort by amount descending and keep top 5
      data.highestBalances.sort((a, b) => b.amount - a.amount);
      data.highestBalances = data.highestBalances.slice(0, 5);
      
    } else if (type === 'win') {
      // For wins, always add if it qualifies for top 5
      data.biggestWins.push(newEntry);
      data.biggestWins.sort((a, b) => b.amount - a.amount);
      data.biggestWins = data.biggestWins.slice(0, 5);
    }
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to update leaderboard' },
      { status: 500 }
    );
  }
}
