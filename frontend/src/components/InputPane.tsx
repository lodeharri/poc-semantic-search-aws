import { useState } from "react";
import type { DocumentInput, SearchInput } from "../api";

interface InputPaneProps {
	onAddEmbedding: (input: DocumentInput) => Promise<void>;
	onSearch: (input: SearchInput) => Promise<void>;
	addingLoading: boolean;
	searchLoading: boolean;
}

export function InputPane({
	onAddEmbedding,
	onSearch,
	addingLoading,
	searchLoading,
}: InputPaneProps) {
	const [content, setContent] = useState("");
	const [query, setQuery] = useState("");

	async function handleAdd(e: React.FormEvent) {
		e.preventDefault();
		if (!content.trim() || addingLoading) return;
		await onAddEmbedding({ content: content.trim() });
		setContent("");
	}

	async function handleSearch(e: React.FormEvent) {
		e.preventDefault();
		if (!query.trim() || searchLoading) return;
		await onSearch({ query: query.trim() });
	}

	return (
		<aside className="input-pane">
			{/* Add embedding section */}
			<section className="section">
				<div className="section__header">
					<span className="section__eyebrow">add embedding</span>
					<div className="section__divider" />
				</div>
				<form onSubmit={handleAdd} style={{ display: "contents" }}>
					<textarea
						className="section__textarea"
						placeholder="Text to embed..."
						value={content}
						onChange={(e) => setContent(e.target.value)}
						rows={4}
						disabled={addingLoading}
					/>
					<div className="section__actions">
						<button
							type="submit"
							className="btn btn--primary"
							disabled={!content.trim() || addingLoading}
						>
							{addingLoading && <span className="spinner" aria-hidden />}
							{addingLoading ? "Adding..." : "Add embedding"}
						</button>
					</div>
				</form>
			</section>

			{/* Search section */}
			<section className="section">
				<div className="section__header">
					<span className="section__eyebrow">search</span>
					<div className="section__divider" />
				</div>
				<form onSubmit={handleSearch} style={{ display: "contents" }}>
					<input
						className="section__input"
						type="text"
						placeholder="Query..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						disabled={searchLoading}
					/>
					<div className="section__actions">
						<button
							type="submit"
							className="btn btn--primary"
							disabled={!query.trim() || searchLoading}
						>
							{searchLoading && <span className="spinner" aria-hidden />}
							{searchLoading ? "Searching..." : "Search"}
						</button>
					</div>
				</form>
			</section>
		</aside>
	);
}
