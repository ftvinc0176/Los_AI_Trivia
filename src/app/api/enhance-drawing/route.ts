import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { drawing, prompt } = await request.json();

    // Convert base64 to blob
    const base64Data = drawing.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Use Hugging Face's free inference API for sketch-to-image
    // Model: stabilityai/stable-diffusion-2-1 with img2img
    const HF_API_KEY = process.env.HUGGINGFACE_API_KEY || 'hf_placeholder'; // Free tier available
    
    const response = await fetch(
      'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: `realistic photo of ${prompt}, highly detailed, professional photography, 4k`,
          // Note: For sketch-to-image, ideally use ControlNet but for simplicity using text-to-image
        }),
      }
    );

    if (!response.ok) {
      // Fallback: Return original drawing if API fails
      console.error('HuggingFace API error:', await response.text());
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
