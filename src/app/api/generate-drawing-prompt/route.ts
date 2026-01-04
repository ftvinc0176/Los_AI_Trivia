import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET() {
  try {
    const prompt = `Generate a short 2-3 word drawing prompt using this format: "[NOUN] [VERB-ING]" or "[ADJECTIVE] [NOUN]"

Examples:
- "cat sleeping"
- "robot dancing"
- "dinosaur running"
- "happy elephant"
- "chef cooking"
- "astronaut floating"
- "bird flying"
- "dog jumping"

Be creative but keep it SHORT and simple! Maximum 3 words.

Respond with ONLY the prompt phrase (2-3 words max), nothing else.`;

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
