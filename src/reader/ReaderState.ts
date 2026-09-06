import {
	normalizeCropProfile,
	type SerializedCropProfile,
} from '../features/smart-crop/CropProfile';
import {
	isReadingFlow,
	isZoomMode,
	type ReadingFlow,
	type ZoomMode,
} from './ReaderSettings';

export interface DocumentReadingState {
	page: number;
	pageOffset?: number;
	zoomMode: ZoomMode;
	readingFlow: ReadingFlow;
	customZoom?: number;
	cropProfile?: SerializedCropProfile;
}

export function normalizeDocumentReadingState(
	value: unknown,
): DocumentReadingState | null {
	if (!isRecord(value)) {
		return null;
	}

	const page = positiveInteger(value.page);
	const zoomMode = isZoomMode(value.zoomMode) ? value.zoomMode : 'native';
	if (page === null) {
		return null;
	}

	const readingFlow = isReadingFlow(value.readingFlow)
		? value.readingFlow
		: 'vertical';
	const state: DocumentReadingState = { page, zoomMode, readingFlow };
	if (
		typeof value.pageOffset === 'number' &&
		Number.isFinite(value.pageOffset)
	) {
		state.pageOffset = Math.min(Math.max(value.pageOffset, 0), 1);
	}
	if (
		typeof value.customZoom === 'number' &&
		Number.isFinite(value.customZoom) &&
		value.customZoom > 0
	) {
		state.customZoom = value.customZoom;
	}

	state.cropProfile = normalizeCropProfile(value.cropProfile);
	return state;
}

function positiveInteger(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 1
		? Math.floor(value)
		: null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
