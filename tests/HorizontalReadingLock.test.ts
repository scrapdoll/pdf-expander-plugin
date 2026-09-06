import { describe, expect, it, vi } from 'vitest';
import { HorizontalReadingLock } from '../src/features/smart-crop/HorizontalReadingLock';
import type { PdfViewerAdapter } from '../src/pdf/PdfViewerAdapter';

describe('mobile Fit Content horizontal reading lock', () => {
	it('repairs a native x reset during vertical scrolling without writing y', () => {
		const h = harness();
		h.lock.hold(22, 500);
		h.container.scrollTop = 710;
		h.container.scrollLeft = 0;
		const writeTop = vi.spyOn(h.container, 'scrollTop', 'set');
		h.container.dispatchEvent(new Event('scroll'));
		expect(h.container.scrollLeft).toBe(72);
		expect(h.container.scrollTop).toBe(710);
		expect(writeTop).not.toHaveBeenCalled();

		h.container.scrollTop = 840;
		h.container.scrollLeft = 0;
		writeTop.mockClear();
		h.container.dispatchEvent(new Event('scroll'));
		expect(h.container.scrollLeft).toBe(72);
		expect(h.container.scrollTop).toBe(840);
		expect(writeTop).not.toHaveBeenCalled();
	});

	it('makes no scroll writes while vertical scrolling is already aligned', () => {
		const h = harness();
		h.lock.hold(22, 500);
		const writeLeft = vi.spyOn(h.container, 'scrollLeft', 'set');
		h.container.dispatchEvent(new Event('scroll'));
		h.container.dispatchEvent(new Event('scroll'));
		expect(writeLeft).not.toHaveBeenCalled();
	});

	it('releases for pinch without cancelling the native gesture', () => {
		const h = harness();
		h.lock.hold(22, 500);
		const event = new Event('touchstart', { cancelable: true });
		Object.defineProperty(event, 'touches', { value: [{}, {}] });
		h.container.dispatchEvent(event);
		h.container.scrollLeft = 15;
		h.container.dispatchEvent(new Event('scroll'));
		expect(h.container.scrollLeft).toBe(15);
		expect(event.defaultPrevented).toBe(false);
	});

	it('uses a zero-offset adapter lock until pinch releases it', () => {
		const h = harness(true, true);
		h.lock.hold(22, 500);
		expect(h.container.scrollLeft).toBe(0);
		h.container.dispatchEvent(new Event('scroll'));
		expect(h.stableRelease).not.toHaveBeenCalled();

		const event = new Event('touchstart', { cancelable: true });
		Object.defineProperty(event, 'touches', { value: [{}, {}] });
		h.container.dispatchEvent(event);
		expect(h.stableRelease).toHaveBeenCalledOnce();
		expect(h.container.scrollLeft).toBe(72);
		expect(event.defaultPrevented).toBe(false);
	});

	it('stops enforcing the old anchor on page changes and reacquires the new one', () => {
		const h = harness();
		h.lock.hold(22, 500);
		h.page = 23;
		h.container.scrollLeft = 50;
		h.container.dispatchEvent(new Event('scroll'));
		expect(h.container.scrollLeft).toBe(50);
		h.lock.hold(23, 500);
		h.container.scrollLeft = 0;
		h.container.dispatchEvent(new Event('scroll'));
		expect(h.container.scrollLeft).toBe(50);
	});

	it('releases on zoom or layout change', () => {
		const h = harness();
		h.lock.hold(22, 500);
		h.width = 650;
		h.container.scrollLeft = 30;
		h.container.dispatchEvent(new Event('scroll'));
		expect(h.container.scrollLeft).toBe(30);
	});

	it('cleans up on mode changes or unload', () => {
		const h = harness();
		h.lock.hold(22, 500);
		h.lock.cancel();
		h.lock.cancel();
		h.container.scrollLeft = 0;
		h.container.dispatchEvent(new Event('scroll'));
		expect(h.container.scrollLeft).toBe(0);
	});

	it('does not lock desktop panning', () => {
		const h = harness(false);
		h.lock.hold(22, 500);
		h.container.scrollLeft = 0;
		h.container.dispatchEvent(new Event('scroll'));
		expect(h.container.scrollLeft).toBe(0);
	});
});

class ScrollContainer extends EventTarget {
	private left = 72;
	private top = 600;
	scrollWidth = 500;
	clientWidth = 378;

	get scrollLeft(): number { return this.left; }
	set scrollLeft(value: number) { this.left = value; }
	get scrollTop(): number { return this.top; }
	set scrollTop(value: number) { this.top = value; }
}

function harness(mobile = true, stable = false) {
	const h = { page: 22, width: 500, container: new ScrollContainer(),
		lock: null as unknown as HorizontalReadingLock, stableRelease: vi.fn() };
	const pdf = {
		getViewContainer: () => ({
			ownerDocument: { body: { matches: () => mobile } },
		}),
		getScrollContainer: () => h.container,
		getCurrentPage: () => h.page,
		getPageGeometry: () => ({ pageWidth: h.width }),
		...(stable ? { lockHorizontalPosition: () => {
			const left = h.container.scrollLeft;
			h.container.scrollLeft = 0;
			return () => {
				h.stableRelease();
				h.container.scrollLeft = left;
			};
		} } : {}),
	} as unknown as PdfViewerAdapter;
	h.lock = new HorizontalReadingLock(pdf);
	return h;
}
