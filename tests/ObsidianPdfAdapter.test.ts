import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { ObsidianPdfAdapter } from '../src/pdf/ObsidianPdfAdapter';

describe('ObsidianPdfAdapter private boundary', () => {
	it('aligns content horizontally without jumping back to its top', () => {
		const scrollTo = vi.fn();
		const page = {
			dataset: { pageNumber: '1' },
			getBoundingClientRect: () => ({ left: -30, top: -700, width: 500, height: 900 }),
		};
		const scroll = {
			scrollLeft: 30, scrollTop: 1800, clientWidth: 378,
			getBoundingClientRect: () => ({ left: 0, top: 100 }), scrollTo,
		};
		const adapter = new ObsidianPdfAdapter({
			view: { containerEl: {
				querySelector: () => scroll, querySelectorAll: () => [page],
			} },
		} as unknown as WorkspaceLeaf);
		adapter.alignPageRegion(1, { left: 0.15, top: 0.1, right: 0.85, bottom: 0.9 });
		expect(scrollTo).toHaveBeenCalledWith({ left: 61, top: 1800, behavior: 'auto' });
	});

	it('locks mobile horizontal movement without retaining a scroll offset', () => {
		const containerClasses = classList();
		const viewerClasses = classList();
		const viewerStyle = styleDeclaration();
		const viewer = { classList: viewerClasses, style: viewerStyle };
		const scroll = {
			scrollLeft: 72,
			classList: containerClasses,
			querySelector: () => viewer,
		};
		const adapter = new ObsidianPdfAdapter({
			view: { containerEl: {
				querySelector: (selector: string) =>
					selector === '.pdf-viewer-container' ? scroll : null,
			} },
		} as unknown as WorkspaceLeaf);

		const release = adapter.lockHorizontalPosition();
		expect(release).not.toBeNull();
		expect(scroll.scrollLeft).toBe(0);
		expect(containerClasses.contains('pdf-reader-horizontal-lock')).toBe(true);
		expect(viewerClasses.contains('pdf-reader-horizontal-offset')).toBe(true);
		expect(viewerStyle.getPropertyValue('--pdf-reader-horizontal-offset')).toBe('-72px');

		release?.();
		release?.();
		expect(scroll.scrollLeft).toBe(72);
		expect(containerClasses.contains('pdf-reader-horizontal-lock')).toBe(false);
		expect(viewerClasses.contains('pdf-reader-horizontal-offset')).toBe(false);
		expect(viewerStyle.getPropertyValue('--pdf-reader-horizontal-offset')).toBe('');
	});

	it('does not analyze a partially painted PDF.js canvas', () => {
		const getPageView = vi.fn(() => ({ renderingState: 1 }));
		const adapter = new ObsidianPdfAdapter({
			view: { containerEl: {}, viewer: { child: { pdfViewer: {
				pdfViewer: { getPageView, currentPageNumber: 2 },
			} } } },
		} as unknown as WorkspaceLeaf);
		expect(adapter.getPageRaster(2, 384)).toBeNull();
		expect(getPageView).toHaveBeenCalledWith(1);
	});
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

	it('resolves PDF.js pages whose data-page-number is a string', () => {
		const pageElement = {
			dataset: { pageNumber: '28' },
			getBoundingClientRect: () => ({ width: 800, height: 1200 }),
		};
		const scrollContainer = {
			clientWidth: 1000,
			clientHeight: 700,
		};
		const viewContainer = {
			querySelector: (selector: string) =>
				selector === '.pdf-viewer-container' ? scrollContainer : null,
			querySelectorAll: () => [pageElement],
		};
		const leaf = {
			view: { containerEl: viewContainer },
		} as unknown as WorkspaceLeaf;
		const adapter = new ObsidianPdfAdapter(leaf);

		expect(adapter.getPageGeometry(28)).toEqual({
			pageWidth: 800,
			pageHeight: 1200,
			viewportWidth: 1000,
			viewportHeight: 700,
		});
	});
});

function classList() {
	const classes = new Set<string>();
	return {
		add: (value: string) => classes.add(value),
		remove: (value: string) => classes.delete(value),
		contains: (value: string) => classes.has(value),
	};
}

function styleDeclaration() {
	const properties = new Map<string, string>();
	return {
		getPropertyValue: (name: string) => properties.get(name) ?? '',
		setProperty: (name: string, value: string) => properties.set(name, value),
		removeProperty: (name: string) => properties.delete(name),
	};
}
