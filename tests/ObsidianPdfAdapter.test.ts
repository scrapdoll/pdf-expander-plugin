import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
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

	it('routes page and zoom commands through the native event bus', () => {
		const dispatch = vi.fn();
		const pdfViewer: Record<string, unknown> = {
			currentPageNumber: 1,
			pagesCount: 12,
			currentScale: 1,
			currentScaleValue: 'auto',
			eventBus: { dispatch },
		};
		const leaf = {
			view: {
				containerEl: {
					querySelector: () => null,
					querySelectorAll: () => [],
				},
				viewer: { child: { pdfViewer: { pdfViewer } } },
			},
		} as unknown as WorkspaceLeaf;
		const adapter = new ObsidianPdfAdapter(leaf);

		adapter.goToPage(7);
		expect(dispatch).toHaveBeenCalledWith('pagenumberchanged', {
			source: adapter,
			value: '7',
		});

		expect(adapter.setNativeZoomMode('page-height')).toBe(true);
		expect(dispatch).toHaveBeenCalledWith('scalechanged', {
			source: adapter,
			value: 'page-height',
		});

		adapter.setZoom(1.5);
		expect(dispatch).toHaveBeenCalledWith('scalechanged', {
			source: adapter,
			value: '1.5',
		});
	});

	it('prefers the full PDF.js page count over virtualized page elements', () => {
		const pdfViewer: Record<string, unknown> = {
			currentPageNumber: 1,
			pagesCount: 401,
		};
		const leaf = {
			view: {
				containerEl: {
					querySelector: () => null,
					querySelectorAll: () => [{}, {}, {}, {}],
				},
				viewer: { child: { pdfViewer: { pdfViewer } } },
			},
		} as unknown as WorkspaceLeaf;
		const adapter = new ObsidianPdfAdapter(leaf);

		expect(adapter.getPageCount()).toBe(401);
	});
});
