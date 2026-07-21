interface StatusBarProps {
	dims: number;
	docsCount: number;
	model: string;
}

export function StatusBar({ dims, docsCount, model }: StatusBarProps) {
	return (
		<header className="status-bar">
			<span className="status-bar__dot" aria-hidden />
			<span>{dims.toLocaleString()} dims</span>
			<span className="status-bar__sep">·</span>
			<span>{docsCount.toLocaleString()} docs</span>
			<span className="status-bar__sep">·</span>
			<span className="status-bar__model">{model}</span>
		</header>
	);
}
