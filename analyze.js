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

    const prompt = `You are a learning support AI for Japanese students. Analyze ALL the workbook images provided (there may be multiple pages).

Student: ${childName}, Grade: ${childGrade}, Date: ${today}

IMPORTANT: Analyze every single image and include ALL problems from ALL pages in one combined JSON response.

Output ONLY a valid JSON object. No explanation, no markdown, no code blocks.

Rules:
- Combine all problems from all images into the sections array
- question field: write only the English sentence with blank shown as "( )" - keep it SHORT, max 60 chars
- childAnswer and correctAnswer: use format "N. word" (e.g. "4. my")
- mistakeType: short English label (e.g. "present perfect", "gerund")
- For example problems (例題), set isCorrect:true and childAnswer:""
- praisePoint, voicePrompt, nextAction: write in Japanese, keep under 80 chars each
- Ensure all strings are properly escaped JSON - no unescaped quotes or newlines inside strings

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
