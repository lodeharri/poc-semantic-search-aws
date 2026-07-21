import type { SearchResult } from "../api";
import { DistanceBar } from "./DistanceBar";

interface ResultCardProps {
	result: SearchResult;
	index: number;
}

function formatDate(iso: string): string {
	try {
		const d = new Date(iso);
		return d.toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}

export function ResultCard({ result, index }: ResultCardProps) {
	return (
		<article className="result-card">
			<div className="result-card__meta">
				<span className="result-card__id" title={result.id}>
					#{index + 1}
				</span>
				{result.metadata &&
					typeof result.metadata === "object" &&
					"source" in result.metadata && (
						<span>
							{String((result.metadata as Record<string, unknown>).source)}
						</span>
					)}
				<span className="result-card__timestamp">
					{formatDate(result.created_at)}
				</span>
			</div>
			<p className="result-card__content">{result.content}</p>
			<DistanceBar similarity={result.similarity} />
		</article>
	);
}
