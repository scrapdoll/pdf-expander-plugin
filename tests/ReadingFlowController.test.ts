import { describe, expect, it, vi } from 'vitest';
import { ReadingFlowController } from '../src/features/navigation/ReadingFlowController';
import type { PdfScrollMode, PdfViewerAdapter } from '../src/pdf/PdfViewerAdapter';

describe('ReadingFlowController', () => {
	it('uses native horizontal scrolling and restores the original mode', () => {
		let nativeMode: PdfScrollMode = 'page';
		const classes = new Set<string>();
		const setScrollMode = vi.fn((mode: PdfScrollMode) => {
			nativeMode = mode;
			return true;
		});
		const pdf = {
			getScrollMode: () => nativeMode,
			setScrollMode,
			getViewContainer: () => ({
				classList: {
					toggle: (name: string, enabled: boolean) =>
						enabled ? classes.add(name) : classes.delete(name),
					remove: (name: string) => classes.delete(name),
				},
			}),
		} as unknown as PdfViewerAdapter;
		const controller = new ReadingFlowController(pdf);

		controller.setMode('horizontal');

		expect(setScrollMode).toHaveBeenCalledWith('horizontal');
		expect(classes.has('pdf-reader-horizontal-reading')).toBe(true);

		controller.dispose();

		expect(setScrollMode).toHaveBeenLastCalledWith('page');
		expect(classes.has('pdf-reader-horizontal-reading')).toBe(false);
	});

	it('retries a requested mode after the native viewer becomes available', () => {
		const setScrollMode = vi
			.fn<(mode: PdfScrollMode) => boolean>()
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(true);
		const pdf = {
			getScrollMode: () => null,
			setScrollMode,
			getViewContainer: () => ({
				classList: { toggle: vi.fn(), remove: vi.fn() },
			}),
		} as unknown as PdfViewerAdapter;
		const controller = new ReadingFlowController(pdf);

		controller.setMode('horizontal');
		controller.apply();

		expect(setScrollMode).toHaveBeenCalledTimes(2);
	});
});
