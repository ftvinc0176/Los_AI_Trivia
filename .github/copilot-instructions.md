# Los_Trivia Project Instructions

## Project Overview
AI-powered trivia web application with single and multiplayer modes, using Gemini AI for question generation.

## Tech Stack
- Next.js 15 (App Router)
- TypeScript
- Socket.io (Real-time multiplayer)
- Tailwind CSS
- Gemini AI API
- Express server for Socket.io
- Vercel deployment

## Features
- **Single Player Mode**: AI-generated trivia with 8 categories and 3 difficulty levels
- **Multiplayer Mode**: Real-time gameplay for up to 4 players
- **Premium UI**: Modern gradient design with smooth animations
- **PayPal Integration**: Donation button on home page
- **Real-time Sync**: Socket.io for live multiplayer functionality

## Project Status
- [x] Create copilot-instructions.md file
- [x] Scaffold Next.js project structure
- [x] Customize project files and components
- [x] Install dependencies and compile
- [x] Create development task
- [x] Complete documentation

## Development Commands

### Start Development Server (with multiplayer support)
```bash
npm run server
```
This starts the custom Express + Socket.io server with Next.js.

### Standard Next.js Development (single player only)
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Start Production Server
```bash
npm start
```

## Important Files

- `/src/app/page.tsx` - Premium home page with 3 options
- `/src/app/singleplayer/page.tsx` - Single player game
- `/src/app/multiplayer/page.tsx` - Multiplayer game with Socket.io
- `/src/app/api/generate-questions/route.ts` - Gemini AI API endpoint
- `/server.js` - Express + Socket.io server
- `/.env.local` - Environment variables (not committed)

## Environment Variables

Required in `.env.local`:
```
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

## Next Steps

1. Get your Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add it to `.env.local`
3. Run `npm run server` to start the development server
4. Open http://localhost:3000 in your browser
5. Test both single player and multiplayer modes
6. Follow DEPLOYMENT.md for deploying to production

## Architecture Notes

- Next.js handles the frontend and single-player API
- Express server wraps Next.js and adds Socket.io for real-time multiplayer
- Socket.io manages game rooms, player states, and real-time question/answer sync
- Gemini AI generates unique trivia questions based on category and difficulty
- Tailwind CSS provides responsive, premium UI design
