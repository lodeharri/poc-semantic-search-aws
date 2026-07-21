const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface DocumentInput {
	content: string;
	metadata?: Record<string, unknown>;
}

export interface DocumentCreated {
	id: string;
	content: string;
	embedding_dim: number;
	created_at: string;
}

export interface SearchInput {
	query: string;
	limit?: number;
	threshold?: number;
}

export interface SearchResult {
	id: string;
	content: string;
	similarity: number;
	metadata?: Record<string, unknown> | null;
	created_at: string;
}

export interface SearchResponse {
	query: string;
	count: number;
	results: SearchResult[];
}

export async function createEmbedding(
	input: DocumentInput,
): Promise<DocumentCreated> {
	const res = await fetch(`${API_BASE_URL}/embeddings`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: "Unknown error" }));
		throw new Error(err.error ?? `HTTP ${res.status}`);
	}
	return res.json();
}

export async function searchDocuments(
	input: SearchInput,
): Promise<SearchResponse> {
	const res = await fetch(`${API_BASE_URL}/search`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ limit: 10, ...input }),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: "Unknown error" }));
		throw new Error(err.error ?? `HTTP ${res.status}`);
	}
	return res.json();
}

export interface DocumentSummary {
	id: string;
	content: string;
	metadata?: Record<string, unknown> | null;
	created_at: string;
}

export interface ListDocumentsResponse {
	count: number;
	documents: DocumentSummary[];
}

export async function listDocuments(
	limit = 20,
): Promise<ListDocumentsResponse> {
	const res = await fetch(`${API_BASE_URL}/documents?limit=${limit}`);
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: "Unknown error" }));
		throw new Error(err.error ?? `HTTP ${res.status}`);
	}
	return res.json();
}

export async function healthCheck(): Promise<unknown> {
	const res = await fetch(API_BASE_URL);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}
