import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface Question {
  question: string;
  options: string[];
  correctAnswer: number;
}

export async function POST(request: NextRequest) {
  try {
    const { category, difficulty, count, progressive, categories } = await request.json();

    let prompt = '';
    
    if (progressive && categories) {
      // Progressive difficulty mode for single player Caseonaire
      prompt = `Generate ${count} unique trivia questions for a game show. Questions 1-3 are medium difficulty, questions 4-10 are hard difficulty. Each question must be from a different category: ${categories.join(', ')}.

Return a JSON array of ${count} objects with this exact format:
[{"question":"text","options":["A","B","C","D"],"correctAnswer":0}]

Rules: 4 options each, plausible wrong answers, avoid cliché questions, progressively harder.`;
    } else {
      // Standard mode for multiplayer
      prompt = `Generate ${count} ${difficulty} difficulty trivia questions about ${category}.

Return a JSON array of ${count} objects:
[{"question":"text","options":["A","B","C","D"],"correctAnswer":0}]

4 options each, plausible wrong answers.`;
    }

    // Use OpenAI GPT-5-nano for free text generation
    const response = await client.responses.create({
      model: 'gpt-5-nano',
      input: prompt
    });
    
    let text = response.output_text;

    // Clean up the response - remove markdown code blocks if present
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const questions: Question[] = JSON.parse(text);

    // Validate the response
    if (!Array.isArray(questions) || questions.length !== count) {
      throw new Error('Invalid response format from AI');
    }

    // Validate each question
    for (const q of questions) {
      if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || 
          typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
        throw new Error('Invalid question format');
      }
    }

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Error generating questions:', error);
    return NextResponse.json(
      { error: 'Failed to generate questions' },
      { status: 500 }
    );
  }
}
