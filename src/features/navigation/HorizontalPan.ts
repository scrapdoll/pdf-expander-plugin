const HORIZONTAL_PAN_TOLERANCE = 4;

export function hasAvailableHorizontalPan(
	scrollWidth: number,
	clientWidth: number,
	isLocked: boolean,
): boolean {
	return (
		!isLocked && scrollWidth > clientWidth + HORIZONTAL_PAN_TOLERANCE
	);
}
