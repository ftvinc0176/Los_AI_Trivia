import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const { question, options, correctAnswer } = await request.json();

    const prompt = `You are a helpful AI assistant for a trivia game show called "Who Wants to Be a Caseonaire?"

The player has used their AI Hint lifeline and needs help with this question:

Question: ${question}

Options:
A) ${options[0]}
B) ${options[1]}
C) ${options[2]}
D) ${options[3]}

The correct answer is: ${options[correctAnswer]}

Provide a VERY HELPFUL and DIRECT hint that:
1. Strongly guides the player toward the correct answer
2. Explains WHY the correct answer is right (provide factual context)
3. Points out what's wrong with 1-2 incorrect options
4. Is written in a friendly, encouraging tone
5. Gives enough information that a player can confidently choose the right answer
6. Keep it to 2-3 sentences maximum

Be generous with information - this is their only AI hint for the entire game!

Return ONLY the hint text, nothing else.`;

    const response = await client.responses.create({
      model: 'gpt-5-nano',
      input: prompt
    });

    const hint = response.output_text.trim();

    return NextResponse.json({ hint });
  } catch (error) {
    console.error('Error generating hint:', error);
    return NextResponse.json(
      { error: 'Failed to generate hint' },
      { status: 500 }
    );
  }
}
