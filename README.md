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

```bash
# 1. Clone and enter project
cd poc_semantic_search

# 2. Install dependencies
pnpm install

# 3. Copy env template and fill in values
cp .env.example .env
# Edit .env with your DATABASE_URL (Neon) and GEMINI_API_KEY

# 4. Verify the project builds
pnpm type-check
```

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

The CDK reads automatically from `.env`:

1. Populate `.env` with your credentials (use `.env.example` as template).
   - `DATABASE_URL=postgresql://...`
   - `GEMINI_API_KEY=AIza...`
2. `pnpm install`
3. `pnpm cdk:bootstrap` (first time per region)
4. `pnpm cdk:deploy`

The stack:

- ✅ Validates env vars exist (fails fast with clear message)
- ✅ Creates secrets in AWS Secrets Manager
- ✅ Creates Lambdas (migrator + serving)
- ✅ Creates CustomResource that runs migrations automatically
- ✅ Waits for migrations before activating serving Lambda

To update secrets after deployment:

```bash
aws secretsmanager update-secret \
  --secret-id poc-semantic-search/database-url \
  --secret-string "postgresql://NEW..." \
  --profile harrison-cicd
```

## CDK commands

```bash
# Generate CloudFormation template (validates .env first)
pnpm cdk:synth

# Deploy the stack
pnpm cdk:deploy

# Preview changes before deploying
pnpm cdk:diff

# Destroy the stack (careful!)
pnpm cdk:destroy
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
