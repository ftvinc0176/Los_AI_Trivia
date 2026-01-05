import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyCYugGiZqVvV3hJwi5BXIbJX40WOGSEzng');

interface Question {
  question: string;
  options: string[];
  correctAnswer: number;
}

export async function POST(request: NextRequest) {
  try {
    const { category, difficulty, count } = await request.json();

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const prompt = `Generate ${count} ${difficulty} trivia questions about ${category}. Return ONLY a JSON array:\n[{"question":"text","options":["A","B","C","D"],"correctAnswer":0}]\ncorrectAnswer is the index (0-3).`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const questions: Question[] = JSON.parse(jsonMatch[0]);

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
