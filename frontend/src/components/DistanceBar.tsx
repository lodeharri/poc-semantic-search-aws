interface DistanceBarProps {
	similarity: number; // 0..1
}

export function DistanceBar({ similarity }: DistanceBarProps) {
	const pct = Math.max(0, Math.min(1, similarity));

	return (
		<div className="distance-bar">
			<span className="distance-bar__label">distance</span>
			<div className="distance-bar__track">
				<div
					className="distance-bar__fill"
					style={{ width: `${pct * 100}%` }}
					aria-hidden
				/>
				<div
					className="distance-bar__dot"
					style={{ left: `${pct * 100}%` }}
					aria-hidden
				/>
			</div>
			<span className="distance-bar__value">{(1 - pct).toFixed(3)}</span>
			<span className="distance-bar__score">{pct.toFixed(3)}</span>
		</div>
	);
}
