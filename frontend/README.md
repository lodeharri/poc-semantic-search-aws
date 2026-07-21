# Frontend — Poc_semantic_search

Small React UI that consumes the `POST /embeddings` and `POST /search` endpoints from the deployed AWS Lambda Function URL.

## Stack

- Vite + React 19 + TypeScript
- Inter (body) + JetBrains Mono (display + data)
- Vanilla CSS with design tokens (`src/styles/tokens.css`)
- "Semantic instrument" aesthetic — see `/home/harri/.agents/skills/frontend-design/SKILL.md`

## Setup

```bash
# From repo root
cd frontend
pnpm install

# Copy env template and fill with your Function URL
cp .env.example .env
# Edit .env and paste your backend URL (no trailing slash)

# Run dev server
pnpm dev
```

Open `http://localhost:5173`.

## How to get your `VITE_API_BASE_URL`

After running `pnpm cdk:deploy` (in `backend/`), grab the `ServingFunctionUrl` output:

```bash
# Using AWS CLI
aws cloudformation describe-stacks \
  --stack-name PocSemanticSearchStackV2 \
  --profile harrison-cicd \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`ServingFunctionUrl`].OutputValue' \
  --output text
```

## Building for production

```bash
pnpm build         # Outputs to dist/
pnpm preview       # Serve dist/ locally to test
```

## Features

- **Add embedding**: textarea + button → POST `/embeddings`
- **Search semantically**: input + button → POST `/search` with `RETRIEVAL_QUERY` task type
- **Distance constellation** (signature element): each result shows similarity as a horizontal bar with dot positioned by score

## Project structure

```
frontend/
├── src/
│   ├── api.ts               # HTTP client (fetch wrapper)
│   ├── App.tsx              # Main layout (two-pane)
│   ├── types.ts
│   ├── components/
│   │   ├── StatusBar.tsx
│   │   ├── InputPane.tsx
│   │   ├── ResultsPane.tsx
│   │   ├── ResultCard.tsx
│   │   └── DistanceBar.tsx     # signature element
│   └── styles/
│       ├── tokens.css          # CSS custom properties (palette, type, spacing)
│       ├── reset.css
│       └── app.css
└── index.html
```
