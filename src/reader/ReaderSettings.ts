export type ZoomMode =
	| 'native'
	| 'fit-page'
	| 'fit-width'
	| 'fit-content'
	| 'custom';

export type ReadingFlow = 'vertical' | 'horizontal';

export interface ReaderSettings {
	defaultZoomMode: Exclude<ZoomMode, 'custom'>;
	defaultReadingFlow: ReadingFlow;
	autoHideControls: boolean;
	autoHideDelayMs: number;
	rememberPosition: boolean;
	enableTapZones: boolean;
	enableSwipeNavigation: boolean;
	enableKeyboardNavigation: boolean;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
	defaultZoomMode: 'native',
	defaultReadingFlow: 'vertical',
	autoHideControls: true,
	autoHideDelayMs: 2200,
	rememberPosition: true,
	enableTapZones: true,
	enableSwipeNavigation: true,
	enableKeyboardNavigation: true,
};

const DEFAULT_ZOOM_MODES = new Set<ReaderSettings['defaultZoomMode']>([
	'native',
	'fit-page',
	'fit-width',
	'fit-content',
]);

export function isZoomMode(value: unknown): value is ZoomMode {
	return (
		value === 'native' ||
		value === 'fit-page' ||
		value === 'fit-width' ||
		value === 'fit-content' ||
		value === 'custom'
	);
}

export function normalizeReaderSettings(value: unknown): ReaderSettings {
	const source = isRecord(value) ? value : {};
	const defaultZoomMode = DEFAULT_ZOOM_MODES.has(
		source.defaultZoomMode as ReaderSettings['defaultZoomMode'],
	)
		? (source.defaultZoomMode as ReaderSettings['defaultZoomMode'])
		: DEFAULT_SETTINGS.defaultZoomMode;

	return {
		defaultZoomMode,
		defaultReadingFlow: isReadingFlow(source.defaultReadingFlow)
			? source.defaultReadingFlow
			: DEFAULT_SETTINGS.defaultReadingFlow,
		autoHideControls: booleanOrDefault(
			source.autoHideControls,
			DEFAULT_SETTINGS.autoHideControls,
		),
		autoHideDelayMs: numberInRange(
			source.autoHideDelayMs,
			800,
			10000,
			DEFAULT_SETTINGS.autoHideDelayMs,
		),
		rememberPosition: booleanOrDefault(
			source.rememberPosition,
			DEFAULT_SETTINGS.rememberPosition,
		),
		enableTapZones: booleanOrDefault(
			source.enableTapZones,
			DEFAULT_SETTINGS.enableTapZones,
		),
		enableSwipeNavigation: booleanOrDefault(
			source.enableSwipeNavigation,
			DEFAULT_SETTINGS.enableSwipeNavigation,
		),
		enableKeyboardNavigation: booleanOrDefault(
			source.enableKeyboardNavigation,
			DEFAULT_SETTINGS.enableKeyboardNavigation,
		),
	};
}

export function isReadingFlow(value: unknown): value is ReadingFlow {
	return value === 'vertical' || value === 'horizontal';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function numberInRange(
	value: unknown,
	minimum: number,
	maximum: number,
	fallback: number,
): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.min(Math.max(Math.round(value), minimum), maximum)
		: fallback;
}
