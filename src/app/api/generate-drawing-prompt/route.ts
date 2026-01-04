import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Use DRAW_GAME_GEMINI_KEY for drawing game specifically (set on Vercel/Railway)
const genAI = new GoogleGenerativeAI(process.env.DRAW_GAME_GEMINI_KEY || '');

export async function GET() {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Generate a single random object or thing for someone to draw. It should be:
- Simple enough to draw in 60 seconds
- Recognizable
- Not too abstract
- Examples: "a cat", "a bicycle", "a tree", "a house", "a car", "a flower", "a dog", "pizza"

Respond with ONLY the thing to draw, nothing else. No explanation or extra words.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    return NextResponse.json({ prompt: text });
  } catch (error) {
    console.error('Error generating drawing prompt:', error);
    return NextResponse.json(
      { error: 'Failed to generate prompt' },
      { status: 500 }
    );
  }
}
