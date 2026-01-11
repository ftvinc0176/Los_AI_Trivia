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
    // Accept flexible payload from frontend
    const body = await request.json();
    let category = body.category;
    let difficulty = body.difficulty || 'Medium';
    let count = body.count;

    // Support progressive loading (frontend sends categories array, questionNumber, etc.)
    if (body.categories && Array.isArray(body.categories)) {
      // Pick a random category from the array
      const cats = body.categories;
      category = cats[Math.floor(Math.random() * cats.length)];
    }
    if (!category) category = 'General Knowledge';
    if (!difficulty && body.difficulties && Array.isArray(body.difficulties)) {
      difficulty = body.difficulties[1] || 'Medium';
    }
    // Always return 2 questions for progressive mode, fallback to 2 if not provided
    if (!count) count = 2;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Generate ${count} ${difficulty} trivia questions about ${category}. Return ONLY a JSON array:\n[{"question":"text","options":["A","B","C","D"],"correctAnswer":0}]\ncorrectAnswer is the index (0-3).`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    let questions: Question[] = [];
    if (jsonMatch) {
      try {
        questions = JSON.parse(jsonMatch[0]);
      } catch (e) {
        questions = [];
      }
    }

    // Validate the response
    if (!Array.isArray(questions) || questions.length !== count) {
      // Return empty array if invalid
      return NextResponse.json({ questions: [] });
    }

    // Validate each question
    for (const q of questions) {
      if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 ||
        typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
        return NextResponse.json({ questions: [] });
      }
    }

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Error generating questions:', error);
    // Always return a valid questions array, even on error
    return NextResponse.json({ questions: [] }, { status: 200 });
  }
}
