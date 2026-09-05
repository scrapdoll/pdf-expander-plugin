import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZoomController } from '../src/features/zoom/ZoomController';
import type { PdfViewerAdapter } from '../src/pdf/PdfViewerAdapter';

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('Fit Content on slow mobile viewers', () => {
	it('fits a canvas that becomes ready well after the original 250 ms retry', () => {
		const h = harness();
		h.zoom.setMode('fit-content', 1, 10);
		vi.advanceTimersByTime(1000);
		expect(h.nativeZoom).toHaveBeenCalledWith('page-width');
		expect(h.setZoom).not.toHaveBeenCalled();
		h.ready = true;
		vi.advanceTimersByTime(500);
		expect(h.setZoom).toHaveBeenCalledOnce();
		expect(h.width * 0.83).toBeCloseTo(354);
		expect(h.align).toHaveBeenCalledOnce();
		vi.advanceTimersByTime(2000);
		expect(h.align).toHaveBeenCalledOnce();
	});

	it('resumes from a render notification after bounded polling expires', () => {
		const h = harness();
		h.zoom.setMode('fit-content', 1, 10);
		vi.advanceTimersByTime(12000);
		expect(vi.getTimerCount()).toBe(0);
		h.ready = true;
		h.zoom.handleViewerUpdate(1);
		vi.advanceTimersByTime(500);
		expect(h.align).toHaveBeenCalledOnce();
	});

	it('waits for actual zoom layout before aligning', () => {
		const h = harness();
		h.ready = true;
		h.layoutDelay = 400;
		h.zoom.setMode('fit-content', 1, 10);
		vi.advanceTimersByTime(300);
		expect(h.align).not.toHaveBeenCalled();
		vi.advanceTimersByTime(200);
		expect(h.align).toHaveBeenCalledOnce();
	});

	it('cancels pending fitting when the user selects Native zoom', () => {
		const h = harness();
		h.zoom.setMode('fit-content', 1, 10);
		h.zoom.setMode('native', 1, 10);
		h.ready = true;
		h.zoom.handleViewerUpdate(1);
		vi.advanceTimersByTime(1000);
		expect(h.setZoom).not.toHaveBeenCalled();
		expect(h.align).not.toHaveBeenCalled();
	});

	it('does not align an old page after navigating away', () => {
		const h = harness();
		h.ready = true;
		h.zoom.setMode('fit-content', 1, 10);
		h.page = 2;
		vi.advanceTimersByTime(1000);
		expect(h.align).not.toHaveBeenCalled();
	});

	it('cancels delayed layout alignment when leaving Fit Content', () => {
		const h = harness();
		h.ready = true;
		h.layoutDelay = 400;
		h.zoom.setMode('fit-content', 1, 10);
		vi.advanceTimersByTime(100);
		h.zoom.setMode('native', 1, 10);
		vi.advanceTimersByTime(1000);
		expect(h.align).not.toHaveBeenCalled();
	});

	it('uses the current canvas instead of an incompatible saved median', () => {
		const crop = { left: 0.3, top: 0.1, right: 0.7, bottom: 0.9 };
		const h = harness({ odd: [crop, crop, crop], even: [] });
		h.ready = true;
		h.zoom.setMode('fit-content', 1, 10);
		vi.advanceTimersByTime(500);
		expect(h.width * 0.83).toBeCloseTo(354);
	});
});

function harness(profile?: ConstructorParameters<typeof ZoomController>[1]) {
	vi.useFakeTimers();
	vi.stubGlobal('window', { setTimeout, clearTimeout });
	const h = {
		ready: false, page: 1, width: 378, scale: 1, layoutDelay: 0,
		setZoom: vi.fn<(value: number) => void>(),
		align: vi.fn(), nativeZoom: vi.fn(() => true),
		zoom: null as unknown as ZoomController,
	};
	const ownerWindow = {
		setTimeout: (callback: () => void, delay: number) => windowTimer(callback, delay),
		clearTimeout: (timer: number) => window.clearTimeout(timer),
		requestAnimationFrame: (callback: () => void) => windowTimer(callback, 16),
		cancelAnimationFrame: (timer: number) => window.clearTimeout(timer),
	};
	h.setZoom.mockImplementation((value) => {
		const width = h.width * value / h.scale;
		h.scale = value;
		if (h.layoutDelay) windowTimer(() => { h.width = width; }, h.layoutDelay);
		else h.width = width;
	});
	const data = new Uint8ClampedArray(100 * 120 * 4);
	for (let y = 20; y < 100; y++) {
		for (let x = 10; x < 90; x++) data[(y * 100 + x) * 4 + 3] = 255;
	}
	const pdf = {
		getViewContainer: () => ({ ownerDocument: { defaultView: ownerWindow } }),
		getCurrentPage: () => h.page,
		getPageRaster: () => h.ready ? { width: 100, height: 120, data } : null,
		getPageGeometry: () => ({
			pageWidth: h.width, pageHeight: h.width * 1.4,
			viewportWidth: 378, viewportHeight: 680,
		}),
		getZoom: () => h.scale,
		setZoom: h.setZoom,
		setNativeZoomMode: h.nativeZoom,
		alignPageRegion: h.align,
	} as unknown as PdfViewerAdapter;
	h.zoom = new ZoomController(pdf, profile, vi.fn());
	return h;
}

function windowTimer(callback: () => void, delay: number): number {
	return window.setTimeout(callback, delay);
}
