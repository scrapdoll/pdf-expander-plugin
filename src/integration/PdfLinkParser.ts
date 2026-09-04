export function parsePdfPageReference(value: string): number | null {
	const match = /(?:^|[#?&])page=(\d+)/i.exec(value);
	return parsePositiveInteger(match?.[1]);
}

export function parsePositiveInteger(value: unknown): number | null {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string'
				? Number.parseInt(value, 10)
				: Number.NaN;
	return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : null;
}
