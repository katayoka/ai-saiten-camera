export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

async function analyzeOneImage(imageContent, childName, childGrade, childSubject, today, apiKey) {
  const isEnglish = childSubject === 'english';

  const englishPrompt = `You are a learning support AI for Japanese students. Analyze this workbook image.

Student: ${childName}, Grade: ${childGrade}, Date: ${today}

Output ONLY a valid JSON object. No explanation, no markdown, no code blocks.

Rules:
- question field: Write ONLY the sentence that contains the blank ( ). This is usually the B: line or the fill-in sentence, NOT the A: question sentence. Example: write "It made ( ) very happy." not "Did you receive a letter from Jane?" Keep under 70 chars.
- childAnswer: the answer option the child actually wrote in the blank. Format "N. word" (e.g. "4. my"). Read carefully what the child wrote.
- correctAnswer: the grammatically correct answer for the blank. Format "N. word" (e.g. "3. me").
- CRITICAL for isCorrect: compare only the word part (ignore number prefix). If words match exactly -> isCorrect: true. If different -> isCorrect: false. Double-check every problem before setting this.
- mistakeType: short English label only when isCorrect is false (e.g. "present perfect", "gerund"). Empty string if correct.
- For example problems (例題): isCorrect:true, childAnswer:"", mistakeType:""
- praisePoint, voicePrompt, nextAction: Japanese, max 80 chars each
- All strings must be valid JSON (no unescaped quotes or newlines)

{"pageTitle":"","pageNumber":"","sections":[{"sectionName":"","problems":[{"number":"(1)","question":"","childAnswer":"","correctAnswer":"","isCorrect":true,"mistakeType":""}]}],"totalCorrect":0,"totalProblems":0,"mistakePatterns":[{"pattern":"","detail":""}],"praisePoint":"","voicePrompt":"","nextAction":""}`;

  const mathPrompt = `You are a learning support AI for Japanese students. Analyze this math workbook image.

Student: ${childName}, Grade: ${childGrade}, Date: ${today}

Output ONLY a valid JSON object. No explanation, no markdown, no code blocks.

Rules:
- question field: Write the math problem in short form (e.g. "24 + 38 = ?", "□ x 3 = 12"). Keep under 60 chars.
- childAnswer: what the child wrote as the final answer (e.g. "62", "4"). If blank, use "未記入".
- correctAnswer: the correct final answer (e.g. "62", "4").
- CRITICAL for isCorrect: compare final answers only. If child answer matches correct answer -> isCorrect: true.
- mistakeType: classify the mistake type in Japanese when isCorrect is false. Choose from: 計算ミス/繰り上がり/繰り下がり/かけ算/割り算/式の立て方/単位の変換/分数/小数/その他. Empty string if correct.
- processNote: if child showed working/scratch work, briefly describe where the error occurred in Japanese (e.g. "繰り下がりで10を忘れた"). Empty string if no working shown or if correct.
- For example problems (例題): isCorrect:true, childAnswer:"", mistakeType:"", processNote:""
- praisePoint, voicePrompt, nextAction: Japanese, max 80 chars each. Focus on math-specific encouragement.
- All strings must be valid JSON (no unescaped quotes or newlines)

{"pageTitle":"","pageNumber":"","sections":[{"sectionName":"","problems":[{"number":"(1)","question":"","childAnswer":"","correctAnswer":"","isCorrect":true,"mistakeType":"","processNote":""}]}],"totalCorrect":0,"totalProblems":0,"mistakePatterns":[{"pattern":"","detail":""}],"praisePoint":"","voicePrompt":"","nextAction":""}`;

  const prompt = isEnglish ? englishPrompt : mathPrompt;

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
    const { images, childName, childGrade, childSubject, today } = req.body;

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
        const result = await analyzeOneImage(imageContent, childName, childGrade, childSubject, today, apiKey);
        results.push(result);
      } catch(e) {
        console.error('画像1枚の解析失敗:', e.message);
      }
    }

    if (results.length === 0) {
      return res.status(500).json({ error: '全画像の解析に失敗しました' });
    }

    const merged = {
      pageTitle: results.map(r => r.pageTitle).filter(Boolean).join(' /
