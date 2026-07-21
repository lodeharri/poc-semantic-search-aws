import { useState, useCallback } from "react";
import { StatusBar } from "./components/StatusBar";
import { InputPane } from "./components/InputPane";
import { ResultsPane } from "./components/ResultsPane";
import { DocumentsPane } from "./components/DocumentsPane";
import { createEmbedding, searchDocuments } from "./api";
import type { SearchResult } from "./api";

const MODEL = "gemini-embedding-001";
const DIMS = 1536;

export default function App() {
	const [results, setResults] = useState<SearchResult[]>([]);
	const [hasSearched, setHasSearched] = useState(false);
	const [addingLoading, setAddingLoading] = useState(false);
	const [searchLoading, setSearchLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMsg, setSuccessMsg] = useState<string | null>(null);
	const [docRefresh, setDocRefresh] = useState(0);

	const clearFeedback = useCallback(() => {
		setError(null);
		setSuccessMsg(null);
	}, []);

	const handleAddEmbedding = useCallback(
		async (input: { content: string; metadata?: Record<string, unknown> }) => {
			setAddingLoading(true);
			clearFeedback();
			try {
				const doc = await createEmbedding(input);
				setSuccessMsg(
					`stored · ${doc.id.slice(0, 8)}… · ${doc.embedding_dim} dims`,
				);
				setDocRefresh((n) => n + 1); // trigger documents pane refresh
				setTimeout(() => setSuccessMsg(null), 3000);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to add embedding",
				);
			} finally {
				setAddingLoading(false);
			}
		},
		[clearFeedback],
	);

	const handleSearch = useCallback(
		async (input: { query: string; limit?: number; threshold?: number }) => {
			setSearchLoading(true);
			clearFeedback();
			setResults([]);
			try {
				const res = await searchDocuments(input);
				setResults(res.results);
				setHasSearched(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Search failed");
			} finally {
				setSearchLoading(false);
			}
		},
		[clearFeedback],
	);

	return (
		<div className="app">
			<StatusBar dims={DIMS} docsCount={0} model={MODEL} />
			<main className="panes">
				<InputPane
					onAddEmbedding={handleAddEmbedding}
					onSearch={handleSearch}
					addingLoading={addingLoading}
					searchLoading={searchLoading}
				/>
				<ResultsPane
					results={results}
					loading={searchLoading}
					error={error}
					hasSearched={hasSearched}
					onClear={() => {
						setResults([]);
						setHasSearched(false);
						setError(null);
					}}
				/>
				<DocumentsPane docRefresh={docRefresh} />
			</main>
			{successMsg && (
				<div
					style={{
						position: "fixed",
						bottom: 16,
						left: "50%",
						transform: "translateX(-50%)",
						background: "var(--surface)",
						border: "1px solid var(--accent-success)",
						borderRadius: "var(--radius-md)",
						padding: "8px 16px",
						fontFamily: "var(--font-display)",
						fontSize: "var(--fs-xs)",
						color: "var(--accent-success)",
						zIndex: 100,
					}}
				>
					{successMsg}
				</div>
			)}
		</div>
	);
}
