// モデル名の唯一の設定場所。src/lib/llm/gemini.ts と同じモデルを使用する。
// デモ側でモデルを変える場合はここだけ変更する。
export const GEMINI_CONFIG = {
  embeddingModel: 'gemini-embedding-001',
  chatModel: 'gemini-3.5-flash-lite',
  apiBase: 'https://generativelanguage.googleapis.com/v1beta/models',
  rag: {
    topK: 3,
    temperature: 0.1,
    maxOutputTokens: 1024,
  },
} as const
