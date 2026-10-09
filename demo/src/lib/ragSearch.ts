import { GEMINI_CONFIG } from '@/config/geminiConfig'
import { knowledgeBase } from '@/data/knowledgeBase'

const { apiBase, embeddingModel, chatModel, rag } = GEMINI_CONFIG

export type RagResult = {
  answerable: boolean
  main: string
  sources: { title: string; page: string }[]
}

export class GeminiError extends Error {
  constructor(
    public readonly code: 'auth' | 'quota' | 'model' | 'cors' | 'unknown',
    message: string,
  ) {
    super(message)
    this.name = 'GeminiError'
  }
}

function buildGeminiError(status: number, body: unknown, context: string): GeminiError {
  const msg = (body as { error?: { message?: string } })?.error?.message ?? ''
  if (status === 401 || status === 403)
    return new GeminiError('auth', `APIキーが無効または権限がありません。Google AI StudioでGemini APIが有効か確認してください。（${context} ${status}）`)
  if (status === 429)
    return new GeminiError('quota', `APIの利用上限に達しました。しばらく待ってから再試行してください。（${context} ${status}）`)
  if (status === 404)
    return new GeminiError('model', `モデルが利用できません。このAPIキーでGemini APIが有効か確認してください。（${context} ${status}）`)
  return new GeminiError('unknown', `${context}でエラーが発生しました: ${msg || status}`)
}

async function embedText(
  text: string,
  apiKey: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
): Promise<number[]> {
  const url = `${apiBase}/${embeddingModel}:embedContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model: `models/${embeddingModel}`,
      content: { parts: [{ text }] },
      taskType,
    }),
  }).catch(() => {
    throw new GeminiError('cors', 'ネットワークエラー: ブラウザからGemini APIへの接続に失敗しました。')
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw buildGeminiError(res.status, body, '埋め込み')
  }

  const data = await res.json() as { embedding?: { values?: number[] } }
  const values = data?.embedding?.values
  if (!values?.length) throw new GeminiError('unknown', '埋め込みベクトルが取得できませんでした。')
  return values
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

// 架空文書7件を順番に埋め込む（初回のみ呼び出し、結果をコンポーネント側でキャッシュ）
export async function embedChunks(apiKey: string): Promise<number[][]> {
  const embeddings: number[][] = []
  for (const chunk of knowledgeBase) {
    const vec = await embedText(chunk.title + '\n' + chunk.content, apiKey, 'RETRIEVAL_DOCUMENT')
    embeddings.push(vec)
  }
  return embeddings
}

export async function ragSearch(
  query: string,
  apiKey: string,
  chunkEmbeddings: number[][],
): Promise<RagResult> {
  const qVec = await embedText(query, apiKey, 'RETRIEVAL_QUERY')

  const scored = chunkEmbeddings
    .map((vec, i) => ({ chunk: knowledgeBase[i], score: cosine(qVec, vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, rag.topK)
    .filter(x => x.score > 0)

  if (scored.length === 0) throw new GeminiError('unknown', '類似する文書が見つかりませんでした。')

  // 文書IDをコンテキストに含め、Geminiが参照IDを返せるようにする
  const context = scored
    .map(({ chunk }) => `[id:${chunk.id}] ${chunk.title}（${chunk.page}）\n${chunk.content}`)
    .join('\n\n')

  const prompt = `あなたは社内ナレッジ検索AIアシスタントです。以下の社内文書のみを情報源として、質問に日本語で回答してください。

${context}

質問：${query}

以下のJSON形式のみで返答してください（他のテキストは一切含めない）：
{"answerable":true,"answer":"回答文","usedSourceIds":["実際に根拠とした文書のidリスト"]}

ルール：
- answerable は、上記の文書に基づいて回答できる場合のみ true にする
- answerable が false の場合、answer は「この質問に関する情報は社内文書に見当たりませんでした」とし、usedSourceIds は [] にする
- usedSourceIds には回答の根拠として実際に使用した文書の id のみ含める（検索上位であっても使用しなかったものは含めない）`

  const genUrl = `${apiBase}/${chatModel}:generateContent`
  const genRes = await fetch(genUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: rag.temperature,
        maxOutputTokens: rag.maxOutputTokens,
        responseMimeType: 'application/json',
      },
    }),
  }).catch(() => {
    throw new GeminiError('cors', 'ネットワークエラー: ブラウザからGemini APIへの接続に失敗しました。')
  })

  if (!genRes.ok) {
    const body = await genRes.json().catch(() => ({}))
    throw buildGeminiError(genRes.status, body, '生成')
  }

  const genData = await genRes.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const raw = genData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!raw) throw new GeminiError('unknown', '回答を取得できませんでした。')

  type GenJSON = { answerable: boolean; answer: string; usedSourceIds: string[] }
  let parsed: GenJSON
  try {
    parsed = JSON.parse(raw) as GenJSON
  } catch {
    // JSON parse failure: plain text fallback（answerableとみなし出典なし）
    return { answerable: true, main: raw.trim(), sources: [] }
  }

  const answerable = Boolean(parsed.answerable)
  const usedIds: string[] = Array.isArray(parsed.usedSourceIds) ? parsed.usedSourceIds : []
  const sources = answerable
    ? scored
        .filter(({ chunk }) => usedIds.includes(chunk.id))
        .map(({ chunk }) => ({ title: chunk.title, page: chunk.page }))
    : []

  return { answerable, main: parsed.answer ?? raw.trim(), sources }
}
