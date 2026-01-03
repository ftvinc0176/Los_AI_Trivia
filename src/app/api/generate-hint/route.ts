import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { question, options, correctAnswer } = await request.json();

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are the AI assistant for "Who Wants to Be a Caseonaire?" game show. A player has used their AI Hint lifeline.

Question: "${question}"

Options:
${options.map((opt: string, idx: number) => `${String.fromCharCode(65 + idx)}. ${opt}`).join('\n')}

The correct answer is option ${String.fromCharCode(65 + correctAnswer)}.

Generate a helpful but not too obvious hint that:
- Guides the player toward the correct answer without revealing it directly
- Eliminates or casts doubt on 1-2 wrong answers
- Uses clever reasoning, logic, or memorable facts
- Is written in an engaging, game show host style
- Is 1-2 sentences maximum
- Does NOT directly state which answer is correct

Return ONLY the hint text, nothing else.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const hint = response.text().trim();

    return NextResponse.json({ hint });
  } catch (error) {
    console.error('Error generating hint:', error);
    return NextResponse.json(
      { error: 'Failed to generate hint' },
      { status: 500 }
    );
  }
}
