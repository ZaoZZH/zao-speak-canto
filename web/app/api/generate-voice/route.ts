import { NextRequest, NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MINIMAX_API_URL = "https://api.minimax.io/v1/t2a_v2";
const MAX_USER_TEXT_LENGTH = 240;
const MAX_HISTORY_TURNS = 3;

const SYSTEM_PROMPT = `
你是一个自然粤语语音聊天助手。

规则：
1. 只用自然粤语口语回复。
2. 只输出可以直接给 TTS 朗读的纯文本。
3. 不要粤拼、不要拼音、不要英文翻译、不要普通话解释。
4. 不要 markdown、不要 bullet points、不要括号。
5. 每次只回复 1-2 句，最多 60 个中文字。
6. 把你当作你的中文名叫“泽豪”，英文名叫“Gerald”，昵称叫“Zao”。
7. 语气像朋友聊天，轻松自然，不要像 AI 助手。
8. 多用粤语特有的词汇和表达方式。
9. 如果用户输入了“[粗鲁模式]”，则到处夹杂粗俗表达（例如屌、鳩、柒、扑街、痴线、食屎等）。
`;

type GeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};

type SessionStoreValue = {
  history: GeminiContent[];
};

const sessionStore = new Map<string, SessionStoreValue>();

function sanitizeInput(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function trimHistory(history: GeminiContent[]) {
  // 1 turn = user + model, so keep only the latest 3*2 messages.
  const keepMessages = MAX_HISTORY_TURNS * 2;
  if (history.length <= keepMessages) return history;
  return history.slice(history.length - keepMessages);
}

async function generateCantoneseReply(
  apiKey: string,
  userText: string,
  history: GeminiContent[],
) {
  const contents = [...history, { role: "user" as const, parts: [{ text: userText }] }];
  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: 0.8,
      topP: 0.9,
      maxOutputTokens: 100,
    },
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    throw new Error("Gemini returned empty text.");
  }
  return text;
}

async function synthesizeAudio(minimaxKey: string, voiceId: string, text: string) {
  const payload = {
    model: "speech-2.8-turbo",
    text,
    stream: false,
    language_boost: "Chinese,Yue",
    output_format: "hex",
    voice_setting: {
      voice_id: voiceId,
      speed: 1,
      vol: 1,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1,
    },
  };

  const response = await fetch(MINIMAX_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${minimaxKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`MiniMax request failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  if (data?.base_resp?.status_code !== 0) {
    throw new Error(`MiniMax response error: ${JSON.stringify(data?.base_resp ?? data)}`);
  }
  const audioHex = data?.data?.audio as string | undefined;
  if (!audioHex) {
    throw new Error("MiniMax returned empty audio.");
  }

  const audioBase64 = Buffer.from(audioHex, "hex").toString("base64");
  return audioBase64;
}

export async function POST(request: NextRequest) {
  try {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const minimaxApiKey = process.env.MINIMAX_API_KEY;
    const minimaxVoiceId = process.env.MINIMAX_VOICE_ID;
    if (!geminiApiKey || !minimaxApiKey || !minimaxVoiceId) {
      return NextResponse.json(
        { error: "Missing required environment variables on server." },
        { status: 500 },
      );
    }

    const body = await request.json();
    const rawText = typeof body?.text === "string" ? body.text : "";
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    const text = sanitizeInput(rawText);

    if (!text) {
      return NextResponse.json({ error: "Input text cannot be empty." }, { status: 400 });
    }
    if (text.length > MAX_USER_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Input text is too long. Max ${MAX_USER_TEXT_LENGTH} characters.` },
        { status: 400 },
      );
    }
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
    }

    const session = sessionStore.get(sessionId) ?? { history: [] };
    const trimmedHistory = trimHistory(session.history);

    const replyText = await generateCantoneseReply(geminiApiKey, text, trimmedHistory);
    const audioBase64 = await synthesizeAudio(minimaxApiKey, minimaxVoiceId, replyText);

    const updatedHistory = trimHistory([
      ...trimmedHistory,
      { role: "user", parts: [{ text }] },
      { role: "model", parts: [{ text: replyText }] },
    ]);
    sessionStore.set(sessionId, { history: updatedHistory });

    return NextResponse.json({
      replyText,
      audioBase64,
      mimeType: "audio/mpeg",
      historyRounds: Math.floor(updatedHistory.length / 2),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
