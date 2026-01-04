import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET() {
  try {
    const prompt = `Generate a creative drawing prompt using this format: "a [NOUN] [VERB-ING] [NOUN]" or "a [ADJECTIVE] [NOUN] on a [NOUN]".

Examples:
- "a cat riding a skateboard"
- "a robot eating pizza"
- "a dinosaur playing guitar"
- "a small elephant on a bicycle"
- "a chef juggling apples"
- "a astronaut surfing waves"

Be creative and unexpected! Mix animals, objects, actions, and settings. Keep it drawable in 60 seconds but fun and imaginative.

Respond with ONLY the prompt phrase, nothing else.`;

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
