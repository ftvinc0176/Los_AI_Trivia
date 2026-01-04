import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { drawing, prompt } = await request.json();

    const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
    
    if (!HF_TOKEN) {
      console.log('No HF_TOKEN found, returning original drawing');
      return NextResponse.json({ imageUrl: drawing });
    }

    // Use Hugging Face's Stable Diffusion (free and reliable)
    const response = await fetch(
      'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
        },
        body: JSON.stringify({
          inputs: `realistic photo of ${prompt}, highly detailed, professional photography, 4k, sharp focus`,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HuggingFace API error:', errorText);
      // Fallback: Return original drawing if API fails
      return NextResponse.json({ imageUrl: drawing });
    }

    const imageBlob = await response.blob();
    const imageBuffer = await imageBlob.arrayBuffer();
    const base64Image = `data:image/png;base64,${Buffer.from(imageBuffer).toString('base64')}`;

    return NextResponse.json({ imageUrl: base64Image });
  } catch (error) {
    console.error('Error enhancing drawing:', error);
    // Return original drawing as fallback
    const { drawing } = await request.json();
    return NextResponse.json({ imageUrl: drawing });
  }
}
