import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { ObsidianPdfAdapter } from '../src/pdf/ObsidianPdfAdapter';

describe('ObsidianPdfAdapter private boundary', () => {
	it('supports the guarded Obsidian 1.13 PDF.js path', () => {
		const pdfViewer: Record<string, unknown> = {
			currentPageNumber: 4,
			pagesCount: 12,
			currentScale: 1.25,
			currentScaleValue: 'auto',
		};
		const leaf = {
			view: {
				containerEl: {},
				viewer: { child: { pdfViewer: { pdfViewer } } },
			},
		} as unknown as WorkspaceLeaf;
		const adapter = new ObsidianPdfAdapter(leaf);

		expect(adapter.getZoom()).toBe(1.25);
		expect(adapter.setNativeZoomMode('page-width')).toBe(true);
		expect(pdfViewer.currentScaleValue).toBe('page-width');
		adapter.setZoom(1.5);
		expect(pdfViewer.currentScale).toBe(1.5);
	});

	it('degrades when private PDF.js fields are unavailable', () => {
		const leaf = {
			view: { containerEl: {} },
		} as unknown as WorkspaceLeaf;
		const adapter = new ObsidianPdfAdapter(leaf);

		expect(adapter.getZoom()).toBeNull();
		expect(adapter.setNativeZoomMode('page-height')).toBe(false);
		expect(() => adapter.setZoom(2)).not.toThrow();
	});
});
