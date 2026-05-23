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

    const prompt = `あなたは小学生・中学生の学習サポートAIです。
添付した画像はワークブックの問題ページです。

子どもの名前：${childName}さん
学年：${childGrade}
撮影日：${today}

画像を分析して、以下のJSON形式のみで出力してください。前置き・説明文・Markdownコードブロックは一切不要です。JSONだけ出力してください。

分析手順：
1. ページタイトル・課名・ページ番号を読み取る
2. セクション名（ウォームアップ、演習問題など）を認識する
3. 各問題の選択肢と子どもの解答を読み取る（空欄は「(          )」で表示）
4. 正誤を判定する
5. 誤答の原因を推定する

解答の表記：「番号. 単語」形式（例：「4. my」「2. done」）

出力フォーマット：
{"pageTitle":"ページタイトル","pageNumber":"ページ番号（不明なら空）","sections":[{"sectionName":"セクション名","problems":[{"number":"(1)","question":"問題文（空欄は(          )）","childAnswer":"子の解答","correctAnswer":"正解","isCorrect":true,"mistakeType":"誤答時のみ記載"}]}],"totalCorrect":7,"totalProblems":13,"mistakePatterns":[{"pattern":"パターン名","detail":"親向け説明"}],"praisePoint":"褒めどころ","voicePrompt":"親への声かけワンフレーズ","nextAction":"次のアクション"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
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
