import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

interface LeaderboardEntry {
  name: string;
  amount: number;
  date: string;
}

interface UserBalance {
  balance: number;
  lastUpdated: string;
}

interface LeaderboardData {
  highestBalances: LeaderboardEntry[];
  mostWagered: LeaderboardEntry[];
  userBalances: { [username: string]: UserBalance };
}

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

const LEADERBOARD_KEY = 'casino:leaderboards';

// GET - Fetch leaderboards
export async function GET(request: NextRequest) {
  try {
    // Check if Redis is configured
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      console.warn('Redis not configured, returning empty leaderboards');
      return NextResponse.json({ highestBalances: [], mostWagered: [], userBalance: null });
    }

    // Check if requesting a specific user's balance
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    
    const data = await redis.get<LeaderboardData>(LEADERBOARD_KEY);
    
    if (!data) {
      return NextResponse.json({ highestBalances: [], mostWagered: [], userBalance: null });
    }
    
    // If username provided, include their balance
    let userBalance = null;
    if (username && data.userBalances && data.userBalances[username.toLowerCase()]) {
      userBalance = data.userBalances[username.toLowerCase()].balance;
    }
    
    return NextResponse.json({
      highestBalances: data.highestBalances || [],
      mostWagered: data.mostWagered || [],
      userBalance
    });
  } catch (error) {
    console.error('Error reading leaderboard:', error);
    return NextResponse.json(
      { highestBalances: [], mostWagered: [], userBalance: null },
      { status: 500 }
    );
  }
}

// POST - Update leaderboard
export async function POST(request: NextRequest) {
  try {
    // Check if Redis is configured
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      console.warn('Redis not configured, cannot update leaderboards');
      return NextResponse.json(
        { error: 'Leaderboard service not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { type, name, amount } = body;
    
    if (!type || !name || amount === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: type, name, amount' },
        { status: 400 }
      );
    }
    
    // Get current data
    let data = await redis.get<LeaderboardData>(LEADERBOARD_KEY);
    
    if (!data) {
      data = { highestBalances: [], mostWagered: [], userBalances: {} };
    }
    
    // Ensure all arrays exist (migration from old format)
    if (!data.mostWagered) data.mostWagered = [];
    if (!data.userBalances) data.userBalances = {};
    
    const nameLower = name.toLowerCase();
    const newEntry: LeaderboardEntry = {
      name,
      amount,
      date: new Date().toLocaleDateString()
    };
    
    if (type === 'balance') {
      // Update user's stored balance
      data.userBalances[nameLower] = {
        balance: amount,
        lastUpdated: new Date().toISOString()
      };
      
      // Check if user already exists in highest balances
      const existingIndex = data.highestBalances.findIndex(e => e.name.toLowerCase() === nameLower);
      
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
      
    } else if (type === 'wager') {
      // For wagers, accumulate total wagered per user
      const existingIndex = data.mostWagered.findIndex(e => e.name.toLowerCase() === nameLower);
      
      if (existingIndex !== -1) {
        // Add to existing total
        data.mostWagered[existingIndex].amount += amount;
        data.mostWagered[existingIndex].date = new Date().toLocaleDateString();
      } else {
        // New entry
        data.mostWagered.push(newEntry);
      }
      
      // Sort by amount descending and keep top 5
      data.mostWagered.sort((a, b) => b.amount - a.amount);
      data.mostWagered = data.mostWagered.slice(0, 5);
    } else if (type === 'syncBalance') {
      // Just sync the balance without updating leaderboard position
      data.userBalances[nameLower] = {
        balance: amount,
        lastUpdated: new Date().toISOString()
      };
    }
    
    // Save to Redis
    await redis.set(LEADERBOARD_KEY, data);
    
    return NextResponse.json({
      highestBalances: data.highestBalances,
      mostWagered: data.mostWagered
    });
  } catch (error) {
    console.error('Error updating leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to update leaderboard' },
      { status: 500 }
    );
  }
}
