# Los_Trivia 1.0 🎯

A premium AI-powered trivia web application with single and multiplayer modes, featuring real-time gameplay and dynamic question generation using OpenAI GPT-5-nano.

## ✨ Features

- **🎯 Single Player Mode**: Challenge yourself with AI-generated trivia questions
- **👥 Multiplayer Mode**: Compete with up to 4 players in real-time
- **🤖 AI-Powered Questions**: Dynamic question generation using Google's Gemini AI
- **⚡ Real-time Gameplay**: Live multiplayer using Socket.io
- **🎨 Premium Design**: Modern, responsive UI with smooth animations
- **📊 Multiple Categories**: 8 different trivia categories
- **🎚️ Difficulty Levels**: Easy, Medium, and Hard difficulties
- **💝 Support**: Integrated donation button

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Google Gemini API key

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd LOS_TRIVIA
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

4. Get your Gemini API key:
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy it to your `.env.local` file

### Development

Run the development server with Socket.io support:

```bash
npm run server
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For standard Next.js development (without multiplayer):
```bash
npm run dev
```

### Building for Production

```bash
npm run build
npm start
```

## 🎮 How to Play

### Single Player
1. Click "Single Player" on the home page
2. Choose your category and difficulty
3. Click "Start Game"
4. Answer 10 questions within the time limit
5. View your final score!

### Multiplayer
1. Click "Multiplayer" on the home page
2. Enter your name
3. Either:
   - Create a new room and share the code
   - Join an existing room with a code
4. Wait for players (2-4 players)
5. Host selects category and difficulty
6. Host starts the game when ready
7. Compete in real-time!
8. View the final leaderboard

## 🌐 Deployment

### Vercel Deployment

This project is optimized for deployment on Vercel:

1. Push your code to GitHub
2. Import your repository in Vercel
3. Add your environment variables:
   - `GEMINI_API_KEY`
   - `NEXT_PUBLIC_SERVER_URL` (your Vercel URL)
4. Deploy!

**Note**: For full multiplayer functionality on Vercel, you may need to deploy the Socket.io server separately (e.g., on Railway, Render, or Heroku) and update the `NEXT_PUBLIC_SERVER_URL` accordingly.

### Environment Variables

- `GEMINI_API_KEY`: Your Google Gemini API key (required)
- `NEXT_PUBLIC_SERVER_URL`: The URL of your server (optional, defaults to localhost:3000)

## 🛠️ Tech Stack

- **Framework**: Next.js 15
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Real-time**: Socket.io
- **AI**: Google Gemini AI
- **Runtime**: Node.js

## 📁 Project Structure

```
LOS_TRIVIA/
├── src/
│   └── app/
│       ├── api/
│       │   └── generate-questions/
│       │       └── route.ts          # Gemini AI API endpoint
│       ├── multiplayer/
│       │   └── page.tsx              # Multiplayer game page
│       ├── singleplayer/
│       │   └── page.tsx              # Single player game page
│       ├── globals.css               # Global styles
│       ├── layout.tsx                # Root layout
│       └── page.tsx                  # Home page
├── server.js                         # Socket.io server
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── README.md
```

## 🎨 Categories

- General Knowledge
- Science & Nature
- History
- Geography
- Sports
- Entertainment
- Technology
- Art & Literature

## 💝 Support

If you enjoy Los_Trivia, consider supporting development via [PayPal](https://www.paypal.com/paypalme/ftvinc1999)!

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 👨‍💻 Author

Created with ❤️ by Frank

---

**Los_Trivia 1.0** - Powered by AI, Built for Fun! 🎮
