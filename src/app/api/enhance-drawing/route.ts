import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { drawing, prompt } = await request.json();

    // Just return original drawing - HuggingFace free tier doesn't support image-to-image
    // Would need paid API like OpenAI DALL-E, Replicate, or paid HF tier
    console.log('Drawing submitted for prompt:', prompt);
    
    return NextResponse.json({ imageUrl: drawing });
  } catch (error) {
    console.error('Error in enhance-drawing:', error);
    const { drawing } = await request.json();
    return NextResponse.json({ imageUrl: drawing });
  }
}
