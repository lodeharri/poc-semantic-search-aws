import { useState, useEffect } from "react";
import { listDocuments } from "../api";
import type { DocumentSummary } from "../api";

interface DocumentsPaneProps {
	docRefresh?: number;
}

export function DocumentsPane({ docRefresh = 0 }: DocumentsPaneProps) {
	const [documents, setDocuments] = useState<DocumentSummary[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadDocuments = async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await listDocuments(10);
			setDocuments(res.documents);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadDocuments();
	}, [docRefresh]);

	return (
		<aside className="documents-pane">
			<div className="documents-pane__header">
				<h2>Documents</h2>
				<button onClick={loadDocuments} disabled={loading} title="Refresh list">
					↻
				</button>
			</div>
			{error && <div className="documents-pane__error">{error}</div>}
			{loading ? (
				<div className="documents-pane__loading">Loading…</div>
			) : documents.length === 0 ? (
				<div className="documents-pane__empty">No documents yet</div>
			) : (
				<ul className="documents-pane__list">
					{documents.map((doc) => (
						<li key={doc.id} className="documents-pane__item">
							<span className="documents-pane__id" title={doc.id}>
								{doc.id.slice(0, 8)}…
							</span>
							<span className="documents-pane__content">
								{doc.content.length > 80
									? doc.content.slice(0, 80) + "…"
									: doc.content}
							</span>
							<span className="documents-pane__date">
								{new Date(doc.created_at).toLocaleDateString()}
							</span>
						</li>
					))}
				</ul>
			)}
		</aside>
	);
}
