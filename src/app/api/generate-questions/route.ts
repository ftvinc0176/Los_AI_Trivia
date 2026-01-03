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
      // Progressive difficulty mode for single player Caseonaire
      prompt = `You are generating questions for "Who Wants to Be a Caseonaire?" - a high-stakes trivia game show where players can win up to 10 Fever Cases. Generate ${count} completely FRESH, ORIGINAL, and UNIQUE multiple choice trivia questions.

CRITICAL REQUIREMENTS:
- These questions must be BRAND NEW and NEVER repeat common trivia questions
- Avoid cliché questions like "What is the capital of France?" or "Who painted the Mona Lisa?"
- Each question should feel fresh, interesting, and challenging
- Questions should test real knowledge, not just common facts everyone knows

DIFFICULTY PROGRESSION:
- Questions 1-3: Medium difficulty (requires general knowledge but not too obscure)
- Questions 4-10: Hard difficulty (requires deeper knowledge, more specific facts, or clever thinking)
- The difficulty should feel like climbing a ladder - each question slightly harder than the last

CATEGORY VARIETY:
- Each question MUST be from a DIFFERENT random category: ${categories.join(', ')}
- Ensure excellent variety - never use the same category twice

GAME SHOW QUALITY:
- Write questions in an engaging, game show host style
- Make them exciting and worth risking everything for
- Wrong answers should be clever and plausible (not obviously wrong)
- Correct answers should feel satisfying to know

Format the response as a valid JSON array with exactly ${count} objects. Each object must have:
- "question": the trivia question (string, written in engaging game show style)
- "options": exactly 4 possible answers (array of strings, with plausible wrong answers)
- "correctAnswer": the index (0-3) of the correct answer in the options array (number)

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
