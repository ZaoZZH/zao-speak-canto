"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type ApiSuccess = {
  replyText: string;
  audioBase64: string;
  mimeType: string;
  historyRounds: number;
};

function makeSessionId() {
  return `sid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function Home() {
  const [text, setText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [historyRounds, setHistoryRounds] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const sessionId = useMemo(() => makeSessionId(), []);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setError("");

    const userText = text.trim();
    if (!userText) {
      setError("请输入一些文字。");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/generate-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: userText,
          sessionId,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "生成失败，请稍后重试。");
      }

      const result = data as ApiSuccess;
      const byteChars = atob(result.audioBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i += 1) {
        bytes[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: result.mimeType || "audio/mpeg" });
      const nextAudioUrl = URL.createObjectURL(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);

      setAudioUrl(nextAudioUrl);
      setReplyText(result.replyText);
      setHistoryRounds(result.historyRounds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 font-sans">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>你想同Zao讲咩呀？</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleGenerate}>
              <Textarea
                placeholder="输入你想讲嘅内容..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-28"
              />
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Zao谂紧点样答你" : "发送"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Card>
            <CardContent className="pt-6 text-sm text-red-600">{error}</CardContent>
          </Card>
        )}

        {replyText && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Zao回复</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-zinc-500">当前上下文轮数: {historyRounds} / 3</p>
              {audioUrl && (
                <audio controls className="w-full" src={audioUrl}>
                  你的浏览器不支持音频播放。
                </audio>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
