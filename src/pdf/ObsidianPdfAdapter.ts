import type { WorkspaceLeaf } from 'obsidian';
import type {
	NativePdfZoomMode,
	NormalizedPdfRect,
	PdfPageGeometry,
	PdfPageRaster,
	PdfViewerAdapter,
} from './PdfViewerAdapter';

type UnknownRecord = Record<string, unknown>;

interface EventBusLike extends UnknownRecord {
	on?: (name: string, callback: () => void) => void;
	off?: (name: string, callback: () => void) => void;
	_on?: (name: string, callback: () => void) => void;
	_off?: (name: string, callback: () => void) => void;
	dispatch?: (name: string, detail: UnknownRecord) => void;
}

const PDF_VIEWER_PATHS = [
	['viewer', 'child', 'pdfViewer', 'pdfViewer'],
	['viewer', 'child', 'pdfViewer'],
	['viewer', 'pdfViewer'],
	['pdfViewer'],
	['viewer', 'child'],
	['viewer'],
] as const;

const PAGE_SELECTOR = [
	'.pdfViewer .page[data-page-number]',
	'.pdf-viewer .page[data-page-number]',
	'.pdf-page[data-page-number]',
].join(', ');

const SCROLL_CONTAINER_SELECTORS = [
	'.pdf-viewer-container',
	'.pdfViewerContainer',
	'.pdf-container',
	'.view-content',
] as const;

const PAGE_INPUT_SELECTORS = [
	'.pdf-toolbar .pdf-page-input',
	'.pdf-toolbar input[type="number"]',
	'.pdf-page-input',
] as const;

const PAGE_COUNT_SELECTORS = [
	'.pdf-toolbar .pdf-page-numbers',
	'.pdf-toolbar .pdf-page-count',
	'.pdf-toolbar .pdf-page-count-label',
	'.pdf-toolbar #numPages',
	'.pdf-page-count',
] as const;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null;
}

function readPath(root: unknown, path: readonly string[]): unknown {
	let value = root;

	for (const key of path) {
		if (!isRecord(value)) {
			return null;
		}
		value = value[key];
	}

	return value;
}

function positiveInteger(value: unknown): number | null {
	const numericValue =
		typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
	return (
		typeof numericValue === 'number' &&
		Number.isFinite(numericValue) &&
		numericValue >= 1
	)
		? Math.floor(numericValue)
		: null;
}

function positiveNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return value;
	}

	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
	}

	return null;
}

export class ObsidianPdfAdapter implements PdfViewerAdapter {
	constructor(private readonly leaf: WorkspaceLeaf) {}

	getCurrentPage(): number {
		const inputPage = this.getPageFromToolbar();
		if (inputPage !== null) {
			return inputPage;
		}

		const visiblePage = this.getMostVisiblePage();
		if (visiblePage !== null) {
			return visiblePage;
		}

		return (
			positiveInteger(this.getInternalPdfViewer()?.currentPageNumber) ?? 1
		);
	}

	getPageCount(): number {
		const toolbarMaximum = positiveInteger(
			Number.parseInt(this.getToolbarPageInput()?.max ?? '', 10),
		);
		if (toolbarMaximum !== null) {
			return toolbarMaximum;
		}

		const toolbarCount = this.getPageCountFromToolbar();
		if (toolbarCount !== null) {
			return toolbarCount;
		}

		const viewer = this.getInternalPdfViewer();
		const internalCount = positiveInteger(viewer?.pagesCount);
		if (internalCount !== null) {
			return internalCount;
		}

		const documentCount = positiveInteger(
			isRecord(viewer?.pdfDocument) ? viewer.pdfDocument.numPages : null,
		);
		if (documentCount !== null) {
			return documentCount;
		}

		const internalPages = viewer?._pages ?? viewer?.pages;
		if (Array.isArray(internalPages)) {
			return internalPages.length;
		}

		const pageElements = this.getPageElements();
		if (pageElements.length > 0) {
			return pageElements.length;
		}

		return 0;
	}

	goToPage(page: number): void {
		if (!Number.isFinite(page)) {
			return;
		}

		const targetPage = this.clampPage(Math.round(page));
		if (
			this.dispatchViewerCommand('pagenumberchanged', {
				source: this,
				value: String(targetPage),
			})
		) {
			return;
		}

		const viewer = this.getInternalPdfViewer();
		if (viewer !== null && 'currentPageNumber' in viewer) {
			viewer.currentPageNumber = targetPage;
			return;
		}

		const scrollPageIntoView = viewer?.scrollPageIntoView;
		if (typeof scrollPageIntoView === 'function') {
			scrollPageIntoView.call(viewer, { pageNumber: targetPage });
			return;
		}

		const pageElement = this.getPageElement(targetPage);
		if (pageElement !== null) {
			pageElement.scrollIntoView({ block: 'start', inline: 'nearest' });
		}
	}

	nextPage(): void {
		this.goToPage(this.getCurrentPage() + 1);
	}

	previousPage(): void {
		this.goToPage(this.getCurrentPage() - 1);
	}

	getZoom(): number | null {
		const viewer = this.getInternalPdfViewer();
		return (
			positiveNumber(viewer?.currentScale) ??
			positiveNumber(viewer?.currentScaleValue)
		);
	}

	setZoom(value: number): void {
		if (!Number.isFinite(value) || value <= 0) {
			return;
		}
		if (
			this.dispatchViewerCommand('scalechanged', {
				source: this,
				value: String(value),
			})
		) {
			return;
		}

		const viewer = this.getInternalPdfViewer();
		if (viewer === null) {
			return;
		}

		if ('currentScale' in viewer) {
			viewer.currentScale = value;
			return;
		}

		if ('currentScaleValue' in viewer) {
			viewer.currentScaleValue = String(value);
		}
	}

	setNativeZoomMode(mode: NativePdfZoomMode): boolean {
		if (
			this.dispatchViewerCommand('scalechanged', {
				source: this,
				value: mode,
			})
		) {
			return true;
		}

		const viewer = this.getInternalPdfViewer();
		if (viewer === null || !('currentScaleValue' in viewer)) {
			return false;
		}

		viewer.currentScaleValue = mode;
		return true;
	}

	getPageGeometry(page: number): PdfPageGeometry | null {
		const pageElement = this.getPageElement(page);
		const scrollContainer = this.getScrollContainer();
		if (pageElement === null || scrollContainer === null) {
			return null;
		}

		const pageRect = pageElement.getBoundingClientRect();
		return {
			pageWidth: pageRect.width,
			pageHeight: pageRect.height,
			viewportWidth: scrollContainer.clientWidth,
			viewportHeight: scrollContainer.clientHeight,
		};
	}

	getPageRaster(page: number, maxDimension: number): PdfPageRaster | null {
		const viewer = this.getInternalPdfViewer();
		if (typeof viewer?.getPageView === 'function') {
			const getPageView = viewer.getPageView as (index: number) => unknown;
			const pageView = getPageView.call(viewer, page - 1);
			// PDF.js RenderingStates.FINISHED = 3. Never cache partial paint.
			if (isRecord(pageView) && typeof pageView.renderingState === 'number' &&
				pageView.renderingState !== 3) return null;
		}
		const pageElement = this.getPageElement(page);
		const source = pageElement?.querySelector<HTMLCanvasElement>('canvas');
		if (
			source === null ||
			source === undefined ||
			source.width === 0 ||
			source.height === 0 ||
			maxDimension < 1
		) {
			return null;
		}

		const scale = Math.min(
			1,
			maxDimension / Math.max(source.width, source.height),
		);
		const width = Math.max(1, Math.round(source.width * scale));
		const height = Math.max(1, Math.round(source.height * scale));
		const analysisCanvas = source.ownerDocument.createElement('canvas');
		analysisCanvas.width = width;
		analysisCanvas.height = height;
		const context = analysisCanvas.getContext('2d', {
			willReadFrequently: true,
		});
		if (context === null) {
			return null;
		}

		try {
			context.drawImage(source, 0, 0, width, height);
			return {
				width,
				height,
				data: context.getImageData(0, 0, width, height).data,
			};
		} catch (error) {
			console.debug('PDF Reader: Page pixels are unavailable', error);
			return null;
		}
	}

	getPageOffset(page: number): number | null {
		const metrics = this.getPagePosition(page);
		if (metrics === null || metrics.pageHeight <= 0) {
			return null;
		}

		return Math.min(
			Math.max((metrics.scrollTop - metrics.pageTop) / metrics.pageHeight, 0),
			1,
		);
	}

	setPageOffset(page: number, offset: number): void {
		const metrics = this.getPagePosition(page);
		if (metrics === null || !Number.isFinite(offset)) {
			return;
		}

		metrics.scrollContainer.scrollTo({
			left: metrics.scrollLeft,
			top:
				metrics.pageTop +
					metrics.pageHeight * Math.min(Math.max(offset, 0), 1),
			behavior: 'auto',
		});
	}

	alignPageRegion(page: number, region: NormalizedPdfRect): void {
		const metrics = this.getPagePosition(page);
		if (metrics === null) {
			return;
		}

		const horizontalMargin = Math.max(
			0,
			(metrics.viewportWidth -
				metrics.pageWidth * (region.right - region.left)) /
				2,
		);
		metrics.scrollContainer.scrollTo({
			left:
				metrics.pageLeft +
					metrics.pageWidth * region.left -
					horizontalMargin,
			top: metrics.scrollTop,
			behavior: 'auto',
		});
	}

	getScrollContainer(): HTMLElement | null {
		const viewContainer = this.getViewContainer();
		for (const selector of SCROLL_CONTAINER_SELECTORS) {
			const element = viewContainer.querySelector<HTMLElement>(selector);
			if (element !== null) {
				return element;
			}
		}

		const internalContainer = this.getInternalPdfViewer()?.container;
		const ownerWindow = viewContainer.ownerDocument.defaultView;
		return ownerWindow !== null &&
			internalContainer instanceof ownerWindow.HTMLElement
			? internalContainer
			: null;
	}

	getViewContainer(): HTMLElement {
		return this.leaf.view.containerEl;
	}

	onPageChange(callback: (page: number) => void): () => void {
		return this.observeViewer(callback, true);
	}

	onPositionChange(callback: (page: number) => void): () => void {
		return this.observeViewer(callback, false);
	}

	private observeViewer(
		callback: (page: number) => void,
		onlyWhenPageChanges: boolean,
	): () => void {
		const viewContainer = this.getViewContainer();
		const ownerWindow = viewContainer.ownerDocument.defaultView ?? window;
		let frameId: number | null = null;
		let lastPage = 0;
		let lastPageCount = -1;
		let scrollContainer: HTMLElement | null = null;
		let eventBus: EventBusLike | null = null;

		const emit = (): void => {
			frameId = null;
			bindDynamicSources();
			const page = this.getCurrentPage();
			const pageCount = this.getPageCount();
			if (
				!onlyWhenPageChanges ||
				page !== lastPage ||
				pageCount !== lastPageCount
			) {
				lastPage = page;
				lastPageCount = pageCount;
				callback(page);
			}
		};

		const schedule = (): void => {
			if (frameId === null) {
				frameId = ownerWindow.requestAnimationFrame(emit);
			}
		};

		const bindDynamicSources = (): void => {
			const nextScrollContainer = this.getScrollContainer();
			if (nextScrollContainer !== scrollContainer) {
				scrollContainer?.removeEventListener('scroll', schedule);
				scrollContainer = nextScrollContainer;
				scrollContainer?.addEventListener('scroll', schedule, {
					passive: true,
				});
			}

			const nextEventBus = this.getEventBus();
			if (nextEventBus !== eventBus) {
				this.removeEventBusListener(eventBus, schedule);
				eventBus = nextEventBus;
				this.addEventBusListener(eventBus, schedule);
			}
		};

		const observer = new ownerWindow.MutationObserver((records) => {
			const hasNativeMutation = records.some((record) => {
				const target = record.target;
				return !(
					target.instanceOf(ownerWindow.Element) &&
					target.closest('.pdf-reader-overlay') !== null
				);
			});
			if (hasNativeMutation) {
				schedule();
			}
		});
		observer.observe(viewContainer, {
			attributes: true,
			attributeFilter: ['class', 'data-page-number', 'max', 'value'],
			childList: true,
			subtree: true,
		});

		viewContainer.addEventListener('input', schedule);
		bindDynamicSources();
		schedule();

		return () => {
			if (frameId !== null) {
				ownerWindow.cancelAnimationFrame(frameId);
			}
			observer.disconnect();
			viewContainer.removeEventListener('input', schedule);
			scrollContainer?.removeEventListener('scroll', schedule);
			this.removeEventBusListener(eventBus, schedule);
		};
	}

	private getPagePosition(page: number): {
		pageLeft: number;
		pageTop: number;
		pageWidth: number;
		pageHeight: number;
		viewportWidth: number;
		scrollLeft: number;
		scrollTop: number;
		scrollContainer: HTMLElement;
	} | null {
		const pageElement = this.getPageElement(page);
		const scrollContainer = this.getScrollContainer();
		if (pageElement === null || scrollContainer === null) {
			return null;
		}

		const pageRect = pageElement.getBoundingClientRect();
		const viewportRect = scrollContainer.getBoundingClientRect();
		return {
			pageLeft: pageRect.left - viewportRect.left + scrollContainer.scrollLeft,
			pageTop: pageRect.top - viewportRect.top + scrollContainer.scrollTop,
			pageWidth: pageRect.width,
			pageHeight: pageRect.height,
			viewportWidth: scrollContainer.clientWidth,
			scrollLeft: scrollContainer.scrollLeft,
			scrollTop: scrollContainer.scrollTop,
			scrollContainer,
		};
	}

	private clampPage(page: number): number {
		const pageCount = this.getPageCount();
		return Math.min(Math.max(page, 1), pageCount > 0 ? pageCount : page);
	}

	private getInternalPdfViewer(): UnknownRecord | null {
		for (const path of PDF_VIEWER_PATHS) {
			const candidate = readPath(this.leaf.view, path);
			if (this.looksLikePdfViewer(candidate)) {
				return candidate;
			}
		}

		return null;
	}

	private looksLikePdfViewer(value: unknown): value is UnknownRecord {
		return (
			isRecord(value) &&
			('currentPageNumber' in value ||
				'pagesCount' in value ||
				'pdfDocument' in value ||
				'scrollPageIntoView' in value)
		);
	}

	private getEventBus(): EventBusLike | null {
		const eventBus = this.getInternalPdfViewer()?.eventBus;
		return isRecord(eventBus) ? eventBus : null;
	}

	private dispatchViewerCommand(
		name: string,
		detail: UnknownRecord,
	): boolean {
		const eventBus = this.getEventBus();
		if (typeof eventBus?.dispatch !== 'function') {
			return false;
		}

		try {
			eventBus.dispatch.call(eventBus, name, detail);
			return true;
		} catch (error) {
			console.debug(`PDF Reader: Native ${name} command failed`, error);
			return false;
		}
	}

	private addEventBusListener(
		eventBus: EventBusLike | null,
		callback: () => void,
	): void {
		const addListener = eventBus?.on ?? eventBus?._on;
		addListener?.call(eventBus, 'pagechanging', callback);
		addListener?.call(eventBus, 'pagerendered', callback);
	}

	private removeEventBusListener(
		eventBus: EventBusLike | null,
		callback: () => void,
	): void {
		const removeListener = eventBus?.off ?? eventBus?._off;
		removeListener?.call(eventBus, 'pagechanging', callback);
		removeListener?.call(eventBus, 'pagerendered', callback);
	}

	private getToolbarPageInput(): HTMLInputElement | null {
		const viewContainer = this.getViewContainer();
		for (const selector of PAGE_INPUT_SELECTORS) {
			const input = viewContainer.querySelector<HTMLInputElement>(selector);
			if (input !== null) {
				return input;
			}
		}
		return null;
	}

	private getPageFromToolbar(): number | null {
		return positiveInteger(this.getToolbarPageInput()?.valueAsNumber);
	}

	private getPageCountFromToolbar(): number | null {
		const viewContainer = this.getViewContainer();
		for (const selector of PAGE_COUNT_SELECTORS) {
			const text = viewContainer.querySelector<HTMLElement>(selector)?.textContent;
			const count = parseLastPositiveInteger(text);
			if (count !== null) {
				return count;
			}
		}

		return null;
	}

	private getPageElements(): HTMLElement[] {
		return Array.from(
			this.getViewContainer().querySelectorAll<HTMLElement>(PAGE_SELECTOR),
		);
	}

	private getPageElement(page: number): HTMLElement | null {
		return (
			this.getPageElements().find(
				(element) => positiveInteger(element.dataset.pageNumber) === page,
			) ?? null
		);
	}

	private getMostVisiblePage(): number | null {
		const scrollContainer = this.getScrollContainer();
		if (scrollContainer === null) {
			return null;
		}

		const viewport = scrollContainer.getBoundingClientRect();
		let visiblePage: number | null = null;
		let visibleArea = 0;

		for (const pageElement of this.getPageElements()) {
			const pageRect = pageElement.getBoundingClientRect();
			const overlapWidth = Math.max(
				0,
				Math.min(pageRect.right, viewport.right) -
					Math.max(pageRect.left, viewport.left),
			);
			const overlapHeight = Math.max(
				0,
				Math.min(pageRect.bottom, viewport.bottom) -
					Math.max(pageRect.top, viewport.top),
			);
			const area = overlapWidth * overlapHeight;
			const page = positiveInteger(pageElement.dataset.pageNumber);
			if (page !== null && area > visibleArea) {
				visiblePage = page;
				visibleArea = area;
			}
		}

		return visiblePage;
	}
}

function parseLastPositiveInteger(value: string | null | undefined): number | null {
	const match = /(\d[\d\s,.\u00a0]*)\D*$/u.exec(value ?? '');
	const digits = match?.[1]?.replace(/\D/g, '') ?? '';
	return positiveInteger(Number.parseInt(digits, 10));
}
