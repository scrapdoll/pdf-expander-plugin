import { describe, expect, it, vi } from 'vitest';
import { ReadingPositionController } from '../src/features/restore-position/ReadingPositionController';
import type { ZoomController } from '../src/features/zoom/ZoomController';
import type { PdfViewerAdapter } from '../src/pdf/PdfViewerAdapter';
import type { ReaderDataStore } from '../src/reader/ReaderDataStore';
import type { DocumentReadingState } from '../src/reader/ReaderState';
import type { ReaderSettings } from '../src/reader/ReaderSettings';

describe('ReadingPositionController zoom restoration', () => {
	it('preserves a user zoom selection made before delayed restoration', () => {
		const updateDocumentState = vi.fn();
		const setMode = vi.fn();
		const zoom = {
			currentMode: 'fit-content',
			currentCustomZoom: undefined,
			setMode,
			serializeCropProfile: () => ({ odd: [], even: [] }),
		} as unknown as ZoomController;
		const controller = new ReadingPositionController(
			pdfAdapter(),
			zoom,
			store(
				{ page: 3, zoomMode: 'native' },
				updateDocumentState,
			),
			'Books/example.pdf',
			() => null,
		);

		controller.setUserZoomMode('fit-content', 1, 10);
		controller.restore();

		expect(setMode).toHaveBeenLastCalledWith(
			'fit-content',
			3,
			10,
			undefined,
		);

		controller.save();
		expect(updateDocumentState).toHaveBeenLastCalledWith(
			'Books/example.pdf',
			expect.objectContaining({
				page: 1,
				zoomMode: 'fit-content',
			}),
		);
	});

	it('restores the persisted zoom when there is no user override', () => {
		const setMode = vi.fn();
		const zoom = {
			setMode,
		} as unknown as ZoomController;
		const controller = new ReadingPositionController(
			pdfAdapter(),
			zoom,
			store({ page: 3, zoomMode: 'fit-page' }, vi.fn()),
			'Books/example.pdf',
			() => null,
		);

		controller.restore();

		expect(setMode).toHaveBeenCalledWith('fit-page', 3, 10, undefined);
	});
});

function pdfAdapter(): PdfViewerAdapter {
	const ownerWindow = {
		setTimeout: vi.fn(() => 1),
		clearTimeout: vi.fn(),
	};
	return {
		getPageCount: () => 10,
		getCurrentPage: () => 1,
		goToPage: vi.fn(),
		getPageOffset: () => null,
		getViewContainer: () =>
			({ ownerDocument: { defaultView: ownerWindow } }) as unknown as HTMLElement,
	} as unknown as PdfViewerAdapter;
}

function store(
	documentState: DocumentReadingState,
	updateDocumentState: ReturnType<typeof vi.fn>,
): ReaderDataStore {
	const settings: ReaderSettings = {
		defaultZoomMode: 'native',
		autoHideControls: true,
		autoHideDelayMs: 2200,
		rememberPosition: true,
		enableTapZones: true,
		enableSwipeNavigation: true,
		enableKeyboardNavigation: true,
	};
	return {
		settings,
		getDocumentState: () => structuredClone(documentState),
		updateDocumentState,
	} as unknown as ReaderDataStore;
}
