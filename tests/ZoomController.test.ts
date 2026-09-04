import { describe, expect, it, vi } from 'vitest';
import { ZoomController } from '../src/features/zoom/ZoomController';
import type { PdfViewerAdapter } from '../src/pdf/PdfViewerAdapter';

describe('ZoomController native presets', () => {
	it('uses the native fit-height preset for fit page', () => {
		const setNativeZoomMode = vi.fn(() => true);
		const pdf = {
			setNativeZoomMode,
		} as unknown as PdfViewerAdapter;
		const controller = new ZoomController(pdf, undefined, vi.fn());

		controller.setMode('fit-page', 1, 10);

		expect(setNativeZoomMode).toHaveBeenCalledWith('page-height');
	});
});
