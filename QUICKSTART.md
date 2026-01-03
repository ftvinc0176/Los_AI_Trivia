# 🚀 Quick Start Guide

## Get Started in 3 Minutes

### 1️⃣ Get Your API Key
Visit [Google AI Studio](https://makersuite.google.com/app/apikey) and create a free Gemini API key.

### 2️⃣ Configure Environment
Open `.env.local` and add your API key:
```env
GEMINI_API_KEY=paste_your_key_here
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

### 3️⃣ Start the Server
```bash
npm run server
```

### 4️⃣ Open Your Browser
Navigate to [http://localhost:3000](http://localhost:3000)

## 🎮 Test the Features

### Single Player
1. Click "Single Player"
2. Choose category and difficulty
3. Click "Start Game"
4. Answer 10 questions
5. View your score!

### Multiplayer
1. Click "Multiplayer"
2. Enter your name
3. Click "Create Room" (or join existing room with code)
4. Share the room code with friends
5. Host selects category/difficulty
6. Host clicks "Start Game" when ready
7. Compete in real-time!

### Donate
Click the "Donate" button to support via PayPal (opens in new tab)

## ⚡ Troubleshooting

### "Failed to generate questions"
- Check if your `GEMINI_API_KEY` is set in `.env.local`
- Verify the API key is valid at Google AI Studio
- Ensure you have an active internet connection

### Server won't start
- Make sure port 3000 is not in use
- Run `npm install` if you haven't already
- Check for error messages in the terminal

### Multiplayer not working
- Ensure the server is running (`npm run server`, not `npm run dev`)
- Check browser console for Socket.io connection errors
- Try refreshing the page

## 📝 Development Tips

- The server uses **hot reload** - changes to most files will auto-refresh
- Check the terminal for any error messages
- Use browser DevTools to debug frontend issues
- Socket.io events are logged in the server terminal

## 🚀 Ready to Deploy?

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment instructions to Vercel and other platforms.

## 💡 Need Help?

- Check the main [README.md](README.md) for detailed documentation
- Review [DEPLOYMENT.md](DEPLOYMENT.md) for deployment guides
- Check `.github/copilot-instructions.md` for project architecture notes

---

**Enjoy building with Los_Trivia! 🎯**
