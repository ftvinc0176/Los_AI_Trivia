# Deploy Socket.io Server to Railway

## Quick Deploy Steps

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Deploy Socket.io Server**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `Los_AI_Trivia` repository
   - Railway will auto-detect Node.js

3. **Configure Environment Variables**
   In Railway project settings, add:
   ```
   GEMINI_API_KEY=AIzaSyDNudVudmF4tqANq7GWwECYjYuqqDj45gc
   PORT=3001
   ```

4. **Set Build Command**
   - Go to Settings → Deploy
   - Root Directory: `/`
   - Build Command: (leave empty)
   - Start Command: `node server-standalone.js`

5. **Get Your Server URL**
   - After deployment, Railway provides a URL like: `https://your-app.railway.app`
   - Copy this URL

6. **Update Vercel Environment Variable**
   - Go to Vercel dashboard → Your project → Settings → Environment Variables
   - Update `NEXT_PUBLIC_SERVER_URL` to your Railway URL
   - Redeploy your Vercel app

## Alternative: Deploy to Render

1. Go to [render.com](https://render.com)
2. Create New Web Service
3. Connect your GitHub repo
4. Settings:
   - Build Command: `npm install`
   - Start Command: `node server-standalone.js`
   - Environment Variables: Add `GEMINI_API_KEY`
5. Copy the provided URL and update Vercel

## Testing

After deployment:
1. Single Player mode works on Vercel (no server needed)
2. Multiplayer mode connects to your Railway/Render server
3. Test by creating a public lobby and checking browser console for connection logs
