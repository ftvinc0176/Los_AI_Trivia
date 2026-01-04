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
    const { category, difficulty, count, progressive, categories, batch } = await request.json();

    // Progressive loading: Generate initial 4 questions or remaining 6 questions
    if (progressive && batch) {
      if (batch === 'initial') {
        // Generate first 4 questions (1-4, medium difficulty)
        const response = await client.responses.create({
          model: 'gpt-5-nano',
          input: `Generate 4 medium difficulty trivia questions. Each from a different random category from: ${categories.join(', ')}. Return JSON array: [{"question":"text","options":["A","B","C","D"],"correctAnswer":0}]`
        });

        let text = response.output_text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const questions: Question[] = JSON.parse(text);

        if (questions.length !== 4) {
          throw new Error('Invalid response format from AI');
        }

        for (const q of questions) {
          if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || 
              typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
            throw new Error('Invalid question format');
          }
        }

        return NextResponse.json({ questions });
      } else if (batch === 'remaining') {
        // Generate remaining 6 questions (5-10, hard difficulty)
        const response = await client.responses.create({
          model: 'gpt-5-nano',
          input: `Generate 6 hard difficulty trivia questions. Each from a different random category from: ${categories.join(', ')}. Return JSON array: [{"question":"text","options":["A","B","C","D"],"correctAnswer":0}]`
        });

        let text = response.output_text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const questions: Question[] = JSON.parse(text);

        if (questions.length !== 6) {
          throw new Error('Invalid response format from AI');
        }

        for (const q of questions) {
          if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || 
              typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
            throw new Error('Invalid question format');
          }
        }

        return NextResponse.json({ questions });
      }
    }

    // Standard single request for multiplayer or non-progressive mode
    let prompt = '';
    
    if (progressive && categories) {
      prompt = `Generate ${count} unique trivia questions. Each from a different category: ${categories.join(', ')}. Progressive difficulty. Return JSON array: [{"question":"text","options":["A","B","C","D"],"correctAnswer":0}]`;
    } else {
      prompt = `Generate ${count} ${difficulty} trivia questions about ${category}. Return JSON array: [{"question":"text","options":["A","B","C","D"],"correctAnswer":0}]`;
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
