# おまかせ採点カメラ

ワークブックの写真をAIが自動採点・分析するアプリです。

## 構成

```
saiten-app/
├── api/
│   └── analyze.js      ← Vercel API Route（Anthropic APIを呼ぶ）
├── public/
│   └── index.html      ← フロントエンド（全画面）
├── vercel.json         ← ルーティング設定
└── package.json
```

## デプロイ手順

### 1. GitHubにプッシュ
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/あなたのユーザー名/saiten-camera.git
git push -u origin main
```

### 2. Vercelにインポート
1. https://vercel.com にログイン
2. 「Add New Project」→ 上記リポジトリを選択
3. 「Deploy」をクリック

### 3. 環境変数を設定（重要）
Vercelのプロジェクト設定 → Environment Variables に追加：

| キー | 値 |
|------|-----|
| `ANTHROPIC_API_KEY` | `sk-ant-...` |

追加後、「Redeploy」を実行してください。

### 4. 完成
デプロイされたURLにアクセスすればすぐ使えます。
スマホのブラウザからも動作します。

## ローカルで試す場合
```bash
npm install -g vercel
vercel dev
```
`.env.local` ファイルを作成して：
```
ANTHROPIC_API_KEY=sk-ant-...
```
