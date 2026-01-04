import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET() {
  try {
    const prompt = `Generate a SHORT 2 word drawing prompt using CONCRETE, RECOGNIZABLE things: "[THING] [ACTION]"

The THING must be a real, physical object or animal that anyone can recognize and draw:
- Animals: cat, dog, duck, horse, elephant, fish, bird, penguin, monkey, lion
- People: chef, astronaut, pirate, doctor, dancer, ninja, robot, witch
- Objects: house, car, tree, bicycle, rocket, boat, airplane, pizza, cake, phone

The ACTION must be a clear, visible verb ending in -ing:
- burning, surfing, flying, jumping, dancing, sleeping, running, eating, melting, exploding, swimming, cooking

Good examples:
- "duck surfing"
- "house burning"
- "elephant flying"
- "pizza melting"
- "pirate dancing"
- "rocket exploding"

BAD examples (NEVER use these):
- "stardust drifting" - NO abstract concepts!
- "dreams flowing" - NO intangible things!
- "wisdom growing" - NO abstract ideas!

Only use REAL, DRAWABLE, PHYSICAL things that exist in the real world!

Respond with ONLY 2 words in this format: [THING] [ACTION-ing]`;

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
