# Poc_semantic_search

Proof-of-concept: semantic search using AWS Lambda + Neon (Postgres) + pgvector + Gemini embeddings.

## Stack

| Layer           | Choice                     | Rationale                                 |
| --------------- | -------------------------- | ----------------------------------------- |
| Runtime         | Node.js 20 LTS             | Lambda Node 20 runtime                    |
| Language        | TypeScript (strict)        | Type safety                               |
| DB              | Neon (serverless Postgres) | Free tier, connection pooling, pgvector   |
| Vector ext      | pgvector                   | Native vector ops in Postgres             |
| ORM             | Drizzle ORM                | Lightweight, typed, works with serverless |
| Embeddings      | gemini-embedding-001       | 1536 dims, configurable output            |
| Validation      | Zod                        | Env validation + runtime safety           |
| Logging         | Pino                       | Structured, production-grade              |
| Testing         | Vitest                     | Fast, native ESM                          |
| Package manager | pnpm                       | Fast, strict, workspace support           |

## Architecture

Hexagonal (ports & adapters):

```
src/
├── domain/          # Pure business logic — no infrastructure imports
│   ├── entities/     # Domain objects (Document, SearchResult)
│   ├── ports/        # Interface contracts (EmbeddingGenerator, DocumentRepository, DocumentSearcher)
│   └── errors/       # Domain-level error types (AppError, ValidationError, ExternalServiceError)
├── application/      # Use cases — orchestrate domain logic
│   └── use-cases/
│       ├── create-embedding.ts
│       └── search-similar.ts       # Semantic search use case
└── infrastructure/   # Adapters — DB, LLM, config, logging
    ├── db/
    │   ├── client.ts              # Shared Neon singleton factory
    │   ├── schema/                # Drizzle table definitions
    │   └── repositories/          # Repository adapters
    │       ├── neon-document-repository.ts
    │       └── neon-document-searcher.ts  # Cosine similarity search
    ├── llm/
    │   └── gemini-embedding-generator.ts  # LLM adapter (shared)
    ├── config/
    │   └── env.ts                 # Zod-validated env (reads .env)
    └── logger.ts                  # Pino logger

lambda/
└── serving.ts        # Lambda handler with routing
```

## Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- AWS CLI v2 (configured with `aws configure`)
- GitHub CLI (`gh`) authenticated with `gh auth login`
- `jq` (for the bootstrap scripts)
- An AWS account where you have permission to create IAM roles, OIDC providers, and Secrets Manager entries

### One-time setup (per AWS account + GitHub repo)

```bash
# 1. Populate backend/.env with your values
cp backend/.env.example backend/.env
# Edit backend/.env and set DATABASE_URL and GEMINI_API_KEY

# 2. Run the AWS bootstrap (creates secrets, OIDC provider, and IAM role)
pnpm bootstrap:aws

# 3. Run the GitHub bootstrap (sets repository Variables)
pnpm bootstrap:github

# 4. Push to main
git push origin main
```

That is it. CI runs for every pull request and push to `main`; deployment runs after CI succeeds on `main`.

After populating `backend/.env`, you can run both bootstrap steps with one command: `pnpm bootstrap:all`.

### What the bootstrap does

**`pnpm bootstrap:aws`** creates or reconciles, idempotently:

- AWS Secrets Manager entries `poc-semantic-search/database-url` and `poc-semantic-search/gemini-api-key`, using values read from `backend/.env`
- IAM OIDC Identity Provider for `token.actions.githubusercontent.com`, so GitHub Actions can assume roles without long-lived keys
- IAM role `github-actions-deploy-role` with `AdministratorAccess` (PoC scope — tighten for production)
- A trust policy restricted to `repo:<owner>/<repo>:ref:refs/heads/main`, so only this repository on `main` can assume the role

The script writes the resulting `DATABASE_SECRET_ARN` and `GEMINI_SECRET_ARN` values to the gitignored `backend/.env`, allowing the next bootstrap command and local CDK commands to use them automatically. Existing secret values are not changed unless you explicitly run `pnpm bootstrap:aws --confirm-update`.

**`pnpm bootstrap:github`** sets, idempotently:

- Repository Variable `DATABASE_SECRET_ARN`
- Repository Variable `GEMINI_SECRET_ARN`

The ARNs are identifiers, not secret values, so they are stored as GitHub Variables and referenced through `vars.` in workflows.

### How deploy works

1. A pull request or push to `main` triggers CI (`.github/workflows/ci.yml`): lint, type-check, unit tests, CDK synth, and security scans.
2. After CI succeeds for `main`, the Deploy workflow (`.github/workflows/deploy.yml`):
   - Checks out the exact commit that passed CI
   - Assumes the IAM role through OIDC, with no long-lived AWS keys
   - Runs `cdk deploy --context databaseSecretArn=... --context geminiSecretArn=...`
   - Lets CloudFormation resolve Secrets Manager dynamic references during deployment, so secret values never appear in the synthesized template or GitHub configuration

### Local development

```bash
pnpm install
cp backend/.env.example backend/.env  # edit with your values
pnpm --filter backend dev              # run Lambda locally with hot reload
pnpm backend:deploy                    # deploy using ARNs written by bootstrap:aws
```

To re-run the bootstrap on a fresh account: `pnpm bootstrap:all`.

### Troubleshooting

- **"Missing required context: databaseSecretArn"** when running `cdk:synth` locally → run `pnpm bootstrap:aws`; it writes `DATABASE_SECRET_ARN` and `GEMINI_SECRET_ARN` to `backend/.env`. If that write failed, add the printed ARNs manually.
- **"Profile harrison-cicd not found"** → your local scripts are out of date; update with `pnpm install` and remove any local `--profile` flags.
- **Bootstrap script says "AWS credentials not configured"** → run `aws configure` and set the region to `us-east-1`.
- **CDK deploy fails with "Role ... cannot be assumed"** → re-run `pnpm bootstrap:aws` and verify the role trust policy is restricted to this repository's `main` branch in the IAM console.

## Endpoints

### GET / — Health Check

Verifies database connectivity, pgvector extension, and returns document count.

**Response (200 OK):**

```json
{
  "message": "Poc_semantic_search Lambda ready (deployed via CDK)",
  "postgres": "PostgreSQL 15...",
  "pgvector": "0.8.0",
  "documentsCount": 42,
  "timestamp": "2025-01-15T10:30:00.000Z",
  "requestId": "uuid"
}
```

### POST /embeddings — Create Embedding

Generates a semantic embedding for the given text and stores it in the database.

**Request:**

```json
{
  "content": "The quick brown fox jumps over the lazy dog",
  "metadata": { "source": "example", "category": "test" }
}
```

| Field    | Type   | Required | Constraints         |
| -------- | ------ | -------- | ------------------- |
| content  | string | ✅       | 1-8000 characters   |
| metadata | object | ❌       | Optional JSONB data |

**Response (201 Created):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "content": "The quick brown fox jumps over the lazy dog",
  "embedding_dim": 1536,
  "created_at": "2025-01-15T10:30:00.000Z"
}
```

**Error Responses:**

| Status | Code                   | Description                                          |
| ------ | ---------------------- | ---------------------------------------------------- |
| 400    | VALIDATION_ERROR       | Invalid request (empty/long content, malformed JSON) |
| 502    | EXTERNAL_SERVICE_ERROR | Gemini API or Neon DB error                          |
| 500    | APP_ERROR              | Unexpected internal error                            |

    **Example curl:**

    ```bash
    curl -X POST https://your-lambda-url.lambda-url.region.on.aws/embeddings \
      -H "Content-Type: application/json" \
      -d '{"content": "Hello world from semantic search POC"}'
    ```

    **Latency target:** < 3s p95 (cold start + Gemini API + Neon write)

    ### POST /search — Semantic Search

    Performs cosine similarity search against stored document embeddings.
    Uses `RETRIEVAL_QUERY` task type for the search query (optimized for similarity scoring).

    **Request:**

    ```json
    {
      "query": "brown fox behavior",
      "limit": 10,
      "threshold": 0.7
    }
    ```

    | Field     | Type   | Required | Constraints                        |
    | --------- | ------ | -------- | ---------------------------------- |
    | query     | string | ✅       | 1-8000 characters                  |
    | limit     | number | ❌       | 1-100 (default: 10)                |
    | threshold | number | ❌       | 0-1 (minimum similarity, optional) |

    **Response (200 OK):**

    ```json
    {
      "query": "brown fox behavior",
      "count": 2,
      "results": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440000",
          "content": "The quick brown fox jumps over the lazy dog",
          "similarity": 0.87,
          "metadata": { "source": "example" },
          "created_at": "2025-01-15T10:30:00.000Z"
        }
      ]
    }
    ```

    **Error Responses:**

    | Status | Code                   | Description                                          |
    | ------ | ---------------------- | ---------------------------------------------------- |
    | 400    | VALIDATION_ERROR       | Invalid request (empty query, out-of-range limit)    |
    | 502    | EXTERNAL_SERVICE_ERROR | Gemini API or Neon DB error                          |
    | 500    | APP_ERROR              | Unexpected internal error                            |

    **Example curl:**

    ```bash
    # First, insert some documents
    curl -X POST https://your-lambda-url.lambda-url.region.on.aws/embeddings \
      -H "Content-Type: application/json" \
      -d '{"content": "The quick brown fox jumps over the lazy dog"}'

    curl -X POST https://your-lambda-url.lambda-url.region.on.aws/embeddings \
      -H "Content-Type: application/json" \
      -d '{"content": "A lazy cat sleeps on the warm windowsill"}'

    curl -X POST https://your-lambda-url.lambda-url.region.on.aws/embeddings \
      -H "Content-Type: application/json" \
      -d '{"content": "Programming languages and software development practices"}'

    # Then, search for similar content
    curl -X POST https://your-lambda-url.lambda-url.region.on.aws/search \
      -H "Content-Type: application/json" \
      -d '{"query": "fast animal jumping", "limit": 5}'
    ```

    **Latency target:** < 500ms p95 (without index); < 100ms p95 (with HNSW index)

## Try it

```bash
# Test Neon + pgvector connection
pnpm test:connection

# Run unit tests
pnpm test

# Dev mode (watch + tsx) — simulates Lambda locally
pnpm dev

# Build for production
pnpm build
```

## Deploy

The CDK stack references secrets that already live in AWS Secrets Manager — secret values are never embedded in the stack or read from `.env` during synthesis.

1. Populate `backend/.env` from `backend/.env.example` for local Lambda runs.
2. Run `pnpm bootstrap:aws` to reconcile AWS resources and write the secret ARNs to `backend/.env`.
3. Run `pnpm install`.
4. Run `pnpm --filter backend cdk:bootstrap` the first time you use CDK in an AWS account and region.
5. Run `pnpm backend:deploy`.

The stack:

- ✅ Reads secret ARNs from CDK context (fails fast with clear message if missing)
- ✅ References pre-existing secrets in AWS Secrets Manager — never creates them
- ✅ Creates Lambdas (migrator + serving)
- ✅ Creates CustomResource that runs migrations automatically
- ✅ Waits for migrations before activating serving Lambda

To update existing secret values after deployment, edit `backend/.env` and confirm the rotation explicitly:

```bash
pnpm bootstrap:aws --confirm-update
```

## CDK commands

```bash
# Generate the CloudFormation template
pnpm --filter backend cdk:synth

# Deploy the stack
pnpm backend:deploy

# Preview changes before deploying
pnpm --filter backend cdk:diff

# Destroy the stack (careful!)
pnpm --filter backend cdk:destroy
```

## Roadmap

- **Phase 1 — Infrastructure setup**: hexagonal scaffold, env validation, Neon connection, Pino logging.
- **Phase 2 — CDK deployment with migrations**: CDK stack with Lambda migrator, Lambda serving, Secrets Manager integration.
- **Phase 3 — /embeddings endpoint**: Gemini embedding generation, store vectors in pgvector, `/embeddings` POST endpoint.
- **Phase 4 — Semantic search endpoint** (current): `POST /search` with cosine similarity using pgvector.

## Task type optimization

Gemini embeddings support different task types that optimize for specific use cases:

| Task Type            | Use Case                         | Behavior                              |
| -------------------- | -------------------------------- | ------------------------------------- |
| `RETRIEVAL_DOCUMENT` | Indexing stored documents        | Optimized for document retrieval      |
| `RETRIEVAL_QUERY`    | Search queries (used by /search) | Optimized for query-document matching |
| `RETRIEVAL_FAQ`      | FAQ matching                     | Optimized for question-answer pairs   |

The `/embeddings` endpoint uses `RETRIEVAL_DOCUMENT` (default), while `/search` uses `RETRIEVAL_QUERY` for better similarity scoring.

    ## Architectural notes

    - **Domain has zero infrastructure imports.** Dependency direction always points inward.
    - **Neon serverless driver** uses HTTP websockets — ideal for Lambda cold starts.
    - **pgvector `vector` type** supports up to 2000 dimensions; gemini-embedding-001 outputs 1536 dims.
    - **Composition root** in `lambda/serving.ts` wires adapters to use cases via manual DI.
    - **Interface Segregation (ISP)**: `DocumentSearcher` is a SEPARATE interface from `DocumentRepository`.
      - `DocumentRepository`: `save()` — persists documents
      - `DocumentSearcher`: `searchSimilar()` — semantic search
      - This keeps interfaces focused and allows swapping implementations independently.
    - **Dependency Inversion (DIP)**: Use cases depend on interfaces (`EmbeddingGenerator`, `DocumentSearcher`), not concrete adapters.
    - **Singleton sharing**: `GeminiEmbeddingGenerator` is shared between `CreateEmbeddingUseCase` and `SearchSimilarUseCase` (same instance, not duplicated).
