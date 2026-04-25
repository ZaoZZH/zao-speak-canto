# Cantonese Voice Reply MVP

This app lets users type text, generates a short Cantonese reply with Gemini, then synthesizes that reply to audio with MiniMax using your voice ID.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env.local
```

3. Fill `.env.local` with:
- `GEMINI_API_KEY`
- `MINIMAX_API_KEY`
- `MINIMAX_VOICE_ID`

4. Run dev server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000).

## MVP behavior

- Mobile-first single page with textarea, generate button, loading, and audio player.
- Server API route: `POST /api/generate-voice`.
- Keeps latest 3 rounds of chat context in memory per session ID, then sends to Gemini.
- Sends Gemini reply text to MiniMax TTS (`language_boost: Chinese,Yue`) and returns audio base64.

## Vercel deploy

Set the same three env vars in Vercel Project Settings:
- `GEMINI_API_KEY`
- `MINIMAX_API_KEY`
- `MINIMAX_VOICE_ID`

Then deploy the `web` directory as the Next.js project root.
