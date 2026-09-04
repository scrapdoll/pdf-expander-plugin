import type { PdfViewerAdapter } from '../../pdf/PdfViewerAdapter';
import type { ReaderDataStore } from '../../reader/ReaderDataStore';
import type { ZoomController } from '../zoom/ZoomController';

interface PendingPositionRestore {
	page: number;
	offset: number;
}

const POSITION_SAVE_DEBOUNCE_MS = 300;

export class ReadingPositionController {
	private restored = false;
	private lastPage = 0;
	private saveTimer: number | null = null;
	private restoreFrame: number | null = null;
	private pendingRestore: PendingPositionRestore | null = null;

	constructor(
		private readonly pdf: PdfViewerAdapter,
		private readonly zoom: ZoomController,
		private readonly store: ReaderDataStore,
		private readonly documentPath: string,
		private readonly getExplicitPage: () => number | null,
	) {}

	get isRestored(): boolean {
		return this.restored;
	}

	handlePositionChange(page: number): void {
		if (!this.restored) {
			this.restore();
			return;
		}

		if (page !== this.lastPage) {
			this.lastPage = page;
			this.zoom.apply(page, this.pdf.getPageCount());
		}
		this.tryRestorePageOffset();
		this.scheduleSave();
	}

	restore(): void {
		const pageCount = this.pdf.getPageCount();
		if (this.restored || pageCount <= 0) {
			return;
		}

		this.restored = true;
		const savedState = this.store.settings.rememberPosition
			? this.store.getDocumentState(this.documentPath)
			: null;
		const mode = savedState?.zoomMode ?? this.store.settings.defaultZoomMode;
		const currentPage = this.pdf.getCurrentPage();
		const savedPage = clampPage(savedState?.page ?? currentPage, pageCount);
		const explicitPage = this.getExplicitPage();
		const targetPage = clampPage(explicitPage ?? savedPage, pageCount);

		if (explicitPage === null && savedState !== null) {
			this.pdf.goToPage(savedPage);
			if (savedState.pageOffset !== undefined) {
				this.pendingRestore = {
					page: savedPage,
					offset: savedState.pageOffset,
				};
			}
		}

		this.lastPage = currentPage;
		this.zoom.setMode(mode, targetPage, pageCount, savedState?.customZoom);
		this.tryRestorePageOffset();
	}

	scheduleSave(): void {
		if (!this.store.settings.rememberPosition) {
			return;
		}

		const ownerWindow =
			this.pdf.getViewContainer().ownerDocument.defaultView ?? window;
		if (this.saveTimer !== null) {
			ownerWindow.clearTimeout(this.saveTimer);
		}
		this.saveTimer = ownerWindow.setTimeout(() => {
			this.saveTimer = null;
			this.save();
		}, POSITION_SAVE_DEBOUNCE_MS);
	}

	save(): void {
		if (!this.restored || !this.store.settings.rememberPosition) {
			return;
		}

		const page = this.pdf.getCurrentPage();
		const pageOffset = this.pdf.getPageOffset(page);
		const customZoom = this.zoom.currentCustomZoom;
		this.store.updateDocumentState(this.documentPath, {
			page,
			...(pageOffset === null ? {} : { pageOffset }),
			zoomMode: this.zoom.currentMode,
			...(customZoom === undefined ? {} : { customZoom }),
			cropProfile: this.zoom.serializeCropProfile(),
		});
	}

	dispose(): void {
		this.save();
		const ownerWindow =
			this.pdf.getViewContainer().ownerDocument.defaultView ?? window;
		if (this.saveTimer !== null) {
			ownerWindow.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.restoreFrame !== null) {
			ownerWindow.cancelAnimationFrame(this.restoreFrame);
			this.restoreFrame = null;
		}
	}

	private tryRestorePageOffset(): void {
		const pending = this.pendingRestore;
		if (pending === null || this.pdf.getCurrentPage() !== pending.page) {
			return;
		}

		const ownerWindow =
			this.pdf.getViewContainer().ownerDocument.defaultView ?? window;
		if (this.restoreFrame !== null) {
			ownerWindow.cancelAnimationFrame(this.restoreFrame);
		}
		this.restoreFrame = ownerWindow.requestAnimationFrame(() => {
			this.restoreFrame = null;
			this.pdf.setPageOffset(pending.page, pending.offset);
			this.pendingRestore = null;
		});
	}
}

function clampPage(page: number, pageCount: number): number {
	return Math.min(Math.max(page, 1), pageCount);
}
