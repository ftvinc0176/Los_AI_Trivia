# GitHub and Vercel Deployment Guide

## Prerequisites
- GitHub account
- Vercel account (linked to GitHub)
- Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

## Step 1: Initialize Git Repository

```powershell
git init
git add .
git commit -m "Initial commit: Los_Trivia 1.0"
```

## Step 2: Create GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository named `los-trivia`
2. Don't initialize with README (we already have one)
3. Copy the repository URL

## Step 3: Push to GitHub

```powershell
git remote add origin https://github.com/YOUR_USERNAME/los-trivia.git
git branch -M main
git push -u origin main
```

## Step 4: Deploy to Vercel

### Option A: Using Vercel CLI
```powershell
npm install -g vercel
vercel
```

### Option B: Using Vercel Dashboard
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`

5. Add Environment Variables:
   - `GEMINI_API_KEY`: Your Gemini API key
   - `NEXT_PUBLIC_SERVER_URL`: Your Vercel deployment URL (e.g., `https://los-trivia.vercel.app`)

6. Click "Deploy"

## Step 5: Socket.io Server Deployment (for Multiplayer)

**Important**: Vercel's serverless functions don't support Socket.io's persistent connections. For full multiplayer functionality, you need to deploy the Socket.io server separately.

### Recommended Platforms:
- **Railway** (easiest)
- **Render**
- **Heroku**
- **DigitalOcean**

### Railway Deployment Example:

1. Create a `Procfile` in your project root:
```
web: node server.js
```

2. Push changes to GitHub

3. Go to [Railway](https://railway.app)
4. Create new project from GitHub repo
5. Add environment variables:
   - `GEMINI_API_KEY`
   - `PORT` (Railway will provide this automatically)

6. Update your Vercel environment variable:
   - `NEXT_PUBLIC_SERVER_URL`: Your Railway URL (e.g., `https://your-app.railway.app`)

7. Redeploy on Vercel

## Alternative: Single Server Deployment

If you want to deploy everything on one platform that supports both Next.js and Socket.io:

### Using Railway:
1. Deploy entire project to Railway
2. Set environment variables
3. Railway will automatically detect Next.js and run the correct commands

### Using DigitalOcean App Platform:
1. Connect GitHub repository
2. Configure build and run commands
3. Set environment variables

## Important Notes

- **API Key Security**: Never commit your `.env.local` file to GitHub
- **CORS**: If deploying Socket.io separately, ensure CORS is properly configured
- **Environment Variables**: Always set `GEMINI_API_KEY` in your deployment platform
- **Testing**: Test multiplayer functionality after deployment to ensure Socket.io connection works

## Testing Your Deployment

1. Visit your Vercel URL
2. Test single player mode (should work immediately)
3. Test multiplayer mode:
   - Create a room
   - Open in another browser/device
   - Join the room with the code
   - Verify real-time sync works

## Troubleshooting

### Single Player Not Working
- Check if `GEMINI_API_KEY` is set in Vercel environment variables
- Verify API key is valid in Google AI Studio

### Multiplayer Not Working
- Ensure Socket.io server is running (check Railway/Render logs)
- Verify `NEXT_PUBLIC_SERVER_URL` points to Socket.io server
- Check browser console for connection errors

### Build Failures
- Ensure all dependencies are in `package.json`
- Check build logs for specific errors
- Verify Node.js version compatibility (18.x or higher)

## Quick Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Gemini API key obtained
- [ ] Vercel project created and connected to GitHub
- [ ] Environment variables set in Vercel
- [ ] Socket.io server deployed (Railway/Render)
- [ ] `NEXT_PUBLIC_SERVER_URL` updated with Socket.io server URL
- [ ] Single player mode tested
- [ ] Multiplayer mode tested
- [ ] Repository README updated with live URL

---

Need help? Check the main [README.md](README.md) for more information.
