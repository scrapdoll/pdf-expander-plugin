import { describe, expect, it, vi } from 'vitest';
import { ContentAlignment } from '../src/features/smart-crop/ContentAlignment';
import type { PdfViewerAdapter } from '../src/pdf/PdfViewerAdapter';

describe('Fit Content page transitions', () => {
	it('keeps the old horizontal lock until the new page aligns', () => {
		const frames: FrameRequestCallback[] = [];
		const events: string[] = [];
		const container = Object.assign(new EventTarget(), {
			scrollLeft: 72,
			scrollWidth: 600,
			clientWidth: 390,
		});
		let page = 1;
		let width = 500;
		const ownerWindow = {
			requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
				frames.push(callback);
				return frames.length;
			}),
			cancelAnimationFrame: vi.fn(),
			setTimeout: vi.fn(() => 1),
			clearTimeout: vi.fn(),
		};
		const pdf = {
			getViewContainer: () => ({ ownerDocument: {
				defaultView: ownerWindow,
				body: { matches: () => true },
			} }),
			getScrollContainer: () => container,
			getCurrentPage: () => page,
			getPageGeometry: () => ({ pageWidth: width }),
			alignPageRegion: (targetPage: number) => {
				events.push(`align:${targetPage}`);
				container.scrollLeft = targetPage === 1 ? 72 : 96;
			},
			lockHorizontalPosition: () => {
				const lockedPage = page;
				const left = container.scrollLeft;
				events.push(`lock:${lockedPage}`);
				container.scrollLeft = 0;
				return () => {
					events.push(`release:${lockedPage}`);
					container.scrollLeft = left;
				};
			},
		} as unknown as PdfViewerAdapter;
		const alignment = new ContentAlignment(pdf);
		const crop = { left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 };

		alignment.schedule(1, crop, 500);
		frames.shift()?.(0);
		expect(events).toEqual(['align:1', 'lock:1']);

		page = 2;
		width = 600;
		alignment.schedule(2, crop, 600);
		expect(events).toEqual(['align:1', 'lock:1']);
		frames.shift()?.(16);
		expect(events).toEqual([
			'align:1',
			'lock:1',
			'release:1',
			'align:2',
			'lock:2',
		]);

		alignment.cancel();
		expect(events.at(-1)).toBe('release:2');
	});
});
