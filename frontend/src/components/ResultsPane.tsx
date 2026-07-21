import type { SearchResult } from "../api";
import { ResultCard } from "./ResultCard";

interface ResultsPaneProps {
	results: SearchResult[];
	loading: boolean;
	error: string | null;
	hasSearched: boolean;
	onClear: () => void;
}

export function ResultsPane({
	results,
	loading,
	error,
	hasSearched,
	onClear,
}: ResultsPaneProps) {
	return (
		<section className="results-pane">
			<div className="results-pane__header">
				<span>results</span>
				{results.length > 0 && (
					<>
						<span className="results-pane__count">{results.length}</span>
						{hasSearched && (
							<button
								className="btn btn--ghost"
								style={{
									marginLeft: "auto",
									padding: "2px 8px",
									fontSize: "0.7rem",
								}}
								onClick={onClear}
							>
								clear
							</button>
						)}
					</>
				)}
			</div>

			<div className="results-pane__body">
				{loading && (
					<div className="empty-state">
						<span
							className="spinner"
							style={{ width: 24, height: 24, borderWidth: 2 }}
						/>
						<span>querying embeddings...</span>
					</div>
				)}

				{!loading && error && <div className="inline-error">{error}</div>}

				{!loading && !error && results.length === 0 && !hasSearched && (
					<div className="empty-state">
						<div className="empty-state__icon">_</div>
						<span>no documents yet — add one to start</span>
					</div>
				)}

				{!loading && !error && results.length === 0 && hasSearched && (
					<div className="empty-state">
						<div className="empty-state__icon">∅</div>
						<span>no matches found</span>
					</div>
				)}

				{results.map((result, i) => (
					<ResultCard key={result.id} result={result} index={i} />
				))}
			</div>
		</section>
	);
}
