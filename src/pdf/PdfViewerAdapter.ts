export type NativePdfZoomMode = 'page-width' | 'page-height' | 'page-fit';
export type PdfScrollMode =
	| 'vertical'
	| 'horizontal'
	| 'wrapped'
	| 'page';

export interface NormalizedPdfRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface PdfPageGeometry {
	pageWidth: number;
	pageHeight: number;
	viewportWidth: number;
	viewportHeight: number;
}

export interface PdfPageRaster {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}

export interface PdfViewerAdapter {
	getCurrentPage(): number;
	getPageCount(): number;

	goToPage(page: number): void;

	nextPage(): void;
	previousPage(): void;

	getZoom(): number | null;
	setZoom(value: number): void;
	setNativeZoomMode(mode: NativePdfZoomMode): boolean;
	getScrollMode(): PdfScrollMode | null;
	setScrollMode(mode: PdfScrollMode): boolean;

	getPageGeometry(page: number): PdfPageGeometry | null;
	getPageRaster(page: number, maxDimension: number): PdfPageRaster | null;
	getPageOffset(page: number): number | null;
	setPageOffset(page: number, offset: number): void;
	alignPageRegion(page: number, region: NormalizedPdfRect): void;
	lockHorizontalPosition(): (() => void) | null;

	getScrollContainer(): HTMLElement | null;
	getViewContainer(): HTMLElement;

	onPageChange(callback: (page: number) => void): () => void;
	onPositionChange(callback: (page: number) => void): () => void;
}
