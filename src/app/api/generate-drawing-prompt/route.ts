import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET() {
  try {
    const prompt = `Generate a single random object or thing for someone to draw. It should be:
- Simple enough to draw in 60 seconds
- Recognizable
- Not too abstract
- Examples: "a cat", "a bicycle", "a tree", "a house", "a car", "a flower", "a dog", "pizza"

Respond with ONLY the thing to draw, nothing else. No explanation or extra words.`;

    const response = await client.responses.create({
      model: 'gpt-5-nano',
      input: prompt
    });

    const text = response.output_text.trim();

    return NextResponse.json({ prompt: text });
  } catch (error) {
    console.error('Error generating drawing prompt:', error);
    return NextResponse.json(
      { error: 'Failed to generate prompt' },
      { status: 500 }
    );
  }
}
