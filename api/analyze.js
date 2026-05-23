export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

async function analyzeOneImage(imageContent, childName, childGrade, today, apiKey) {
  const prompt = `You are a learning support AI for Japanese students. Analyze this workbook image.

Student: ${childName}, Grade: ${childGrade}, Date: ${today}

Output ONLY a valid JSON object. No explanation, no markdown, no code blocks.

Rules:
- question field: English sentence only, blank as "( )", max 60 chars
- childAnswer and correctAnswer: format "N. word" (e.g. "4. my")
- mistakeType: short English label (e.g. "present perfect", "gerund")
- For example problems (例題): isCorrect:true, childAnswer:""
- praisePoint, voicePrompt, nextAction: Japanese, max 80 chars each
- All strings must be valid JSON (no unescaped quotes or newlines)

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
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [imageContent, { type: 'text', text: prompt }],
      }],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic APIエラー: ${errData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const raw = data.content.map(c => c.text || '').join('').trim();

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSON not found in response');

  let jsonStr = jsonMatch[0];

  const opens = (jsonStr.match(/\{/g) || []).length;
  const closes = (jsonStr.match(/\}/g) || []).length;
  if (opens > closes) jsonStr += '}'.repeat(opens - closes);
  const openArr = (jsonStr.match(/\[/g) || []).length;
  const closeArr = (jsonStr.match(/\]/g) || []).length;
  if (openArr > closeArr) jsonStr += ']'.repeat(openArr - closeArr);

  return JSON.parse(jsonStr);
}

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

    const results = [];
    for (const img of images) {
      const imageContent = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType || 'image/jpeg',
          data: img.data,
        },
      };
      try {
        const result = await analyzeOneImage(imageContent, childName, childGrade, today, apiKey);
        results.push(result);
      } catch(e) {
        console.error('画像1枚の解析失敗:', e.message);
      }
    }

    if (results.length === 0) {
      return res.status(500).json({ error: '全画像の解析に失敗しました' });
    }

    const merged = {
      pageTitle: results.map(r => r.pageTitle).filter(Boolean).join(' / ') || 'レポート',
      pageNumber: results.map(r => r.pageNumber).filter(Boolean).join(', '),
      sections: results.flatMap(r => r.sections || []),
      totalCorrect: results.reduce((sum, r) => sum + (r.totalCorrect || 0), 0),
      totalProblems: results.reduce((sum, r) => sum + (r.totalProblems || 0), 0),
      mistakePatterns: results.flatMap(r => r.mistakePatterns || []),
      praisePoint: results[results.length - 1]?.praisePoint || '',
      voicePrompt: results[results.length - 1]?.voicePrompt || '',
      nextAction: results[results.length - 1]?.nextAction || '',
    };

    const seen = new Set();
    merged.mistakePatterns = merged.mistakePatterns.filter(mp => {
      if (!mp.pattern || seen.has(mp.pattern)) return false;
      seen.add(mp.pattern);
      return true;
    });

    return res.status(200).json(merged);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '不明なエラー' });
  }
}
