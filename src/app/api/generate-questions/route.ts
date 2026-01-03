import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface Question {
  question: string;
  options: string[];
  correctAnswer: number;
}

export async function POST(request: NextRequest) {
  try {
    const { category, difficulty, count, progressive, categories } = await request.json();

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    let prompt = '';
    
    if (progressive && categories) {
      // Progressive difficulty mode for single player
      prompt = `Generate ${count} multiple choice trivia questions with progressive difficulty.

Requirements:
- Questions 1-3: Medium difficulty
- Questions 4-10: Hard difficulty
- Each question should be from a DIFFERENT random category from this list: ${categories.join(', ')}
- Make sure to use a variety of categories across all questions

Format the response as a valid JSON array with exactly ${count} objects. Each object must have:
- "question": the trivia question (string)
- "options": exactly 4 possible answers (array of strings)
- "correctAnswer": the index (0-3) of the correct answer in the options array (number)

Make questions interesting and engaging. Ensure wrong answers are plausible but clearly incorrect.

IMPORTANT: Return ONLY the JSON array, no additional text, markdown formatting, or code blocks. Start with [ and end with ].`;
    } else {
      // Standard mode for multiplayer
      prompt = `Generate ${count} multiple choice trivia questions about ${category} with ${difficulty} difficulty.
    
Format the response as a valid JSON array with exactly ${count} objects. Each object must have:
- "question": the trivia question (string)
- "options": exactly 4 possible answers (array of strings)
- "correctAnswer": the index (0-3) of the correct answer in the options array (number)

Make questions interesting and the difficulty level appropriate for ${difficulty}. Ensure wrong answers are plausible but clearly incorrect.

IMPORTANT: Return ONLY the JSON array, no additional text, markdown formatting, or code blocks. Start with [ and end with ].`;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

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
