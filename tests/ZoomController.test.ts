import { describe, expect, it, vi } from 'vitest';
import { ZoomController } from '../src/features/zoom/ZoomController';
import type {
	PdfPageRaster,
	PdfViewerAdapter,
} from '../src/pdf/PdfViewerAdapter';

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

	it('fits content detected on a transparent PDF canvas', () => {
		const setZoom = vi.fn();
		const ownerWindow = {
			setTimeout: vi.fn(() => 1),
			clearTimeout: vi.fn(),
			requestAnimationFrame: vi.fn(() => 1),
			cancelAnimationFrame: vi.fn(),
		};
		const pdf = {
			getPageRaster: () => transparentRaster(),
			getPageGeometry: () => ({
				pageWidth: 1000,
				pageHeight: 1200,
				viewportWidth: 1000,
				viewportHeight: 800,
			}),
			getZoom: () => 1,
			setZoom,
			getViewContainer: () =>
				({ ownerDocument: { defaultView: ownerWindow } }) as unknown as HTMLElement,
		} as unknown as PdfViewerAdapter;
		const controller = new ZoomController(pdf, undefined, vi.fn());

		controller.setMode('fit-content', 1, 10);

		expect(setZoom).toHaveBeenCalledOnce();
		expect(setZoom.mock.calls[0]?.[0]).toBeGreaterThan(1);
	});

	it('keeps a stable fit-content zoom and aligns in the next frame', () => {
		const setZoom = vi.fn();
		const alignPageRegion = vi.fn();
		let frameId = 0;
		const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
			frameId += 1;
			callback(frameId);
			return frameId;
		});
		const ownerWindow = {
			setTimeout: vi.fn(() => 1),
			clearTimeout: vi.fn(),
			requestAnimationFrame,
			cancelAnimationFrame: vi.fn(),
		};
		const crop = { left: 0.1, top: 0.05, right: 0.9, bottom: 0.95 };
		const pdf = {
			getPageRaster: () => null,
			getCurrentPage: () => 1,
			getPageGeometry: () => ({
				pageWidth: 1220,
				pageHeight: 1500,
				viewportWidth: 1000,
				viewportHeight: 800,
			}),
			getZoom: () => 1,
			setZoom,
			alignPageRegion,
			getViewContainer: () =>
				({ ownerDocument: { defaultView: ownerWindow } }) as unknown as HTMLElement,
		} as unknown as PdfViewerAdapter;
		const controller = new ZoomController(
			pdf,
			{ odd: [crop, crop], even: [] },
			vi.fn(),
		);

		controller.setMode('fit-content', 1, 10);

		expect(setZoom).not.toHaveBeenCalled();
		expect(requestAnimationFrame).toHaveBeenCalledOnce();
		expect(alignPageRegion).toHaveBeenCalledWith(1, crop);
	});
});

function transparentRaster(): PdfPageRaster {
	const width = 100;
	const height = 120;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 15; y < 100; y += 1) {
		for (let x = 20; x < 80; x += 1) {
			const index = (y * width + x) * 4;
			data[index] = 20;
			data[index + 1] = 20;
			data[index + 2] = 20;
			data[index + 3] = 255;
		}
	}
	return { width, height, data };
}
