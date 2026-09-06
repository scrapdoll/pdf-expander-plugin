import { describe, expect, it } from 'vitest';
import {
	CropProfile,
	normalizeCropProfile,
} from '../src/features/smart-crop/CropProfile';
import { normalizeReaderSettings } from '../src/reader/ReaderSettings';
import { normalizeDocumentReadingState } from '../src/reader/ReaderState';

describe('CropProfile', () => {
	it('keeps separate median profiles for odd and even pages', () => {
		const profile = new CropProfile();
		profile.add(1, box(0.1, 0.12, 0.9, 0.88));
		profile.add(3, box(0.12, 0.1, 0.88, 0.9));
		profile.add(2, box(0.2, 0.1, 0.94, 0.9));
		profile.add(4, box(0.22, 0.12, 0.92, 0.88));

		expect(profile.get(5)?.left).toBeCloseTo(0.11);
		expect(profile.get(6)?.left).toBeCloseTo(0.21);
	});

	it('rejects invalid persisted crop boxes', () => {
		expect(
			normalizeCropProfile({
				odd: [{ left: -1, top: 0, right: 1, bottom: 1 }],
				even: [{ left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 }],
			}),
		).toEqual({
			odd: [],
			even: [{ left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 }],
		});
	});
});

describe('persisted reader data normalization', () => {
	it('clamps settings and falls back from unknown values', () => {
		const settings = normalizeReaderSettings({
			defaultZoomMode: 'unknown',
			autoHideControls: false,
			autoHideDelayMs: 20_000,
		});

		expect(settings.defaultZoomMode).toBe('native');
		expect(settings.defaultReadingFlow).toBe('vertical');
		expect(settings.autoHideControls).toBe(false);
		expect(settings.autoHideDelayMs).toBe(10_000);
	});

	it('normalizes page, offset, zoom, and crop profile', () => {
		const state = normalizeDocumentReadingState({
			page: 12.8,
			pageOffset: 3,
			zoomMode: 'fit-content',
			cropProfile: {
				odd: [box(0.1, 0.1, 0.9, 0.9)],
				even: [],
			},
		});

		expect(state?.page).toBe(12);
		expect(state?.pageOffset).toBe(1);
		expect(state?.zoomMode).toBe('fit-content');
		expect(state?.readingFlow).toBe('vertical');
		expect(state?.cropProfile?.odd).toHaveLength(1);
	});

	it('keeps valid persisted reading flow values', () => {
		expect(
			normalizeDocumentReadingState({
				page: 2,
				zoomMode: 'fit-page',
				readingFlow: 'horizontal',
			})?.readingFlow,
		).toBe('horizontal');
	});

	it('rejects states without a valid page', () => {
		expect(normalizeDocumentReadingState({ page: 0 })).toBeNull();
	});
});

function box(left: number, top: number, right: number, bottom: number) {
	return { left, top, right, bottom };
}
