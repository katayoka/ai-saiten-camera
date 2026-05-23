export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY が設定されていません' });
  }

  try {
    const { images, childName, childGrade, today } = req.body;

    if (!images || !images.length) {
      return res.status(400).json({ error: '画像がありません' });
    }

    const imageContents = images.map(img => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType || 'image/jpeg',
        data: img.data,
      },
    }));

    const prompt = `学習サポートAIです。画像はワークブックです。
子ども：${childName}（${childGrade}）、日付：${today}

JSONのみ出力。前置き不要。空欄は(          )で表示。解答は「番号. 単語」形式（例：4. my）。例題セクションはisCorrect:trueで記録。

{"pageTitle":"","pageNumber":"","sections":[{"sectionName":"","problems":[{"number":"(1)","question":"","childAnswer":"","correctAnswer":"","isCorrect":true,"mistakeType":""}]}],"totalCorrect":0,"totalProblems":0,"mistakePatterns":[{"pattern":"","detail":""}],"praisePoint":"","voicePrompt":"","nextAction":""}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: [...imageContents, { type: 'text', text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: `Anthropic APIエラー: ${errData.error?.message || response.statusText}`,
      });
    }

    const data = await response.json();
    const raw = data.content.map(c => c.text || '').join('').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({ error: 'レポートの生成に失敗しました', raw });
    }

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '不明なエラー' });
  }
}
