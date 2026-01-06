import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

interface LeaderboardEntry {
  name: string;
  amount: number;
  date: string;
}

interface LeaderboardData {
  highestBalances: LeaderboardEntry[];
  biggestWins: LeaderboardEntry[];
}

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

const LEADERBOARD_KEY = 'casino:leaderboards';

// GET - Fetch leaderboards
export async function GET() {
  try {
    // Check if Redis is configured
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      console.warn('Redis not configured, returning empty leaderboards');
      return NextResponse.json({ highestBalances: [], biggestWins: [] });
    }

    const data = await redis.get<LeaderboardData>(LEADERBOARD_KEY);
    
    if (!data) {
      return NextResponse.json({ highestBalances: [], biggestWins: [] });
    }
    
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
      data = { highestBalances: [], biggestWins: [] };
    }
    
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
    
    // Save to Redis
    await redis.set(LEADERBOARD_KEY, data);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to update leaderboard' },
      { status: 500 }
    );
  }
}
