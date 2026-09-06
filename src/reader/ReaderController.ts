import { Component, type WorkspaceLeaf } from 'obsidian';
import { NavigationController } from '../features/navigation/NavigationController';
import { ReadingFlowController } from '../features/navigation/ReadingFlowController';
import { AutoHideController } from '../features/progress/AutoHideController';
import { ReadingPositionController } from '../features/restore-position/ReadingPositionController';
import { ZoomController } from '../features/zoom/ZoomController';
import type { PdfViewerAdapter } from '../pdf/PdfViewerAdapter';
import { ReaderOverlay } from '../ui/ReaderOverlay';
import type { ReaderDataStore } from './ReaderDataStore';
import type { ReadingFlow, ZoomMode } from './ReaderSettings';

export class ReaderController extends Component {
	private readonly overlay: ReaderOverlay;
	private readonly navigation: NavigationController;
	private readonly readingFlow: ReadingFlowController;
	private readonly zoom: ZoomController;
	private readonly autoHide: AutoHideController;
	private readonly viewContainer: HTMLElement;
	private position: ReadingPositionController | null = null;
	private attached = false;
	private focusMode = false;

	constructor(
		readonly leaf: WorkspaceLeaf,
		readonly pdf: PdfViewerAdapter,
		readonly documentPath: string,
		getExplicitPage: () => number | null,
		private readonly store: ReaderDataStore,
	) {
		super();
		this.viewContainer = pdf.getViewContainer();
		const savedState = store.getDocumentState(documentPath);
		this.readingFlow = new ReadingFlowController(pdf);
		this.zoom = new ZoomController(
			pdf,
			savedState?.cropProfile,
			() => this.position?.scheduleSave(),
		);
		this.position = new ReadingPositionController(
			pdf,
			this.zoom,
			this.readingFlow,
			store,
			documentPath,
			getExplicitPage,
		);
		this.overlay = new ReaderOverlay(this.viewContainer, {
			onScrub: (page) => this.goToPage(page),
			onSetNativeZoom: () => this.setNativeZoom(),
			onFitPage: () => this.setFitPage(),
			onFitWidth: () => this.setFitWidth(),
			onFitContent: () => this.setFitContent(),
			onSetVerticalReading: () => this.setVerticalReading(),
			onSetHorizontalReading: () => this.setHorizontalReading(),
			onToggleFocus: () => this.toggleFocusMode(),
			onInteractionChange: (active) =>
				this.autoHide.handleInteraction(active),
		});
		this.autoHide = new AutoHideController(
			this.viewContainer,
			this.overlay,
			() => this.store.settings,
		);
		this.navigation = new NavigationController(
			pdf,
			() => this.store.settings,
			{
				nextPage: () => this.nextPage(),
				previousPage: () => this.previousPage(),
				firstPage: () => this.goToPage(1),
				lastPage: () => this.goToPage(this.pdf.getPageCount()),
				showControls: () => this.showControls(),
				toggleControls: () => this.toggleControls(),
				areControlsVisible: () => this.overlay.isVisible(),
			},
			() =>
				this.readingFlow.currentMode === 'vertical' &&
				this.zoom.currentMode === 'fit-content',
		);
	}

	attach(): void {
		if (!this.attached) {
			this.attached = true;
			this.load();
		}
	}

	detach(): void {
		if (this.attached) {
			this.savePosition();
			this.unload();
			this.attached = false;
		}
	}

	override onload(): void {
		this.overlay.attach();
		this.autoHide.attach();
		this.addChild(this.navigation);
		this.register(
			this.pdf.onPositionChange((page) => {
				this.position?.handlePositionChange(page);
				this.zoom.handleViewerUpdate(page);
				this.updateOverlay();
			}),
		);
		this.updateOverlay();
		this.showControls();
	}

	override onunload(): void {
		this.position?.dispose();
		this.zoom.dispose();
		this.readingFlow.dispose();
		this.overlay.detach();
		this.autoHide.dispose();
		this.viewContainer.classList.remove(
			'pdf-reader-focus-mode',
			'pdf-reader-fit-content',
			'pdf-reader-horizontal-reading',
		);
	}

	nextPage(): void {
		this.pdf.nextPage();
	}

	previousPage(): void {
		this.pdf.previousPage();
	}

	goToPage(page: number): void {
		if (page >= 1) {
			this.pdf.goToPage(page);
		}
	}

	toggleControls(): void {
		this.autoHide.toggle();
	}

	showControls(): void {
		this.autoHide.show();
	}

	enterFocusMode(): void {
		this.focusMode = true;
		this.viewContainer.classList.add('pdf-reader-focus-mode');
		this.finishFocusModeChange();
	}

	exitFocusMode(): void {
		this.focusMode = false;
		this.viewContainer.classList.remove('pdf-reader-focus-mode');
		this.finishFocusModeChange();
	}

	toggleFocusMode(): void {
		if (this.focusMode) {
			this.exitFocusMode();
		} else {
			this.enterFocusMode();
		}
	}

	setNativeZoom(): void {
		this.setZoomMode('native');
	}

	setFitPage(): void {
		this.setZoomMode('fit-page');
	}

	setFitWidth(): void {
		this.setZoomMode('fit-width');
	}

	setFitContent(): void {
		this.setZoomMode('fit-content');
	}

	setVerticalReading(): void {
		this.setReadingFlow('vertical');
	}

	setHorizontalReading(): void {
		this.setReadingFlow('horizontal');
	}

	toggleHorizontalReading(): void {
		this.setReadingFlow(
			this.readingFlow.currentMode === 'horizontal'
				? 'vertical'
				: 'horizontal',
		);
	}

	restorePosition(): void {
		this.position?.restore();
	}

	savePosition(): void {
		this.position?.save();
	}

	refreshSettings(): void {
		this.autoHide.refreshSettings();
	}

	handleResize(): void {
		if (
			this.zoom.currentMode === 'native' ||
			this.position?.isRestored !== true
		) {
			return;
		}

		const ownerWindow = this.viewContainer.ownerDocument.defaultView ?? window;
		ownerWindow.requestAnimationFrame(() => {
			this.readingFlow.apply();
			this.zoom.apply(this.pdf.getCurrentPage(), this.pdf.getPageCount());
		});
	}

	getCurrentPage(): number {
		return this.pdf.getCurrentPage();
	}

	isAttachedToCurrentView(): boolean {
		return this.viewContainer === this.pdf.getViewContainer();
	}

	private setZoomMode(mode: ZoomMode): void {
		const page = this.pdf.getCurrentPage();
		const pageCount = this.pdf.getPageCount();
		if (
			mode === 'fit-content' &&
			this.readingFlow.currentMode === 'horizontal'
		) {
			this.setReadingFlowMode('vertical');
		}
		if (this.position === null) {
			this.zoom.setMode(mode, page, pageCount);
		} else {
			this.position.setUserZoomMode(mode, page, pageCount);
		}
		this.updateOverlay();
		this.showControls();
	}

	private setReadingFlow(mode: ReadingFlow): void {
		if (
			mode === 'horizontal' &&
			this.readingFlow.currentMode !== 'horizontal'
		) {
			const page = this.pdf.getCurrentPage();
			const pageCount = this.pdf.getPageCount();
			if (this.position === null) {
				this.zoom.setMode('fit-page', page, pageCount);
			} else {
				this.position.setUserZoomMode('fit-page', page, pageCount);
			}
		}
		this.setReadingFlowMode(mode);
		this.updateOverlay();
		this.showControls();
	}

	private setReadingFlowMode(mode: ReadingFlow): void {
		if (this.position === null) {
			this.readingFlow.setMode(mode);
		} else {
			this.position.setUserReadingFlow(mode);
		}
	}

	private updateOverlay(): void {
		this.viewContainer.classList.toggle(
			'pdf-reader-fit-content',
			this.zoom.currentMode === 'fit-content',
		);
		this.overlay.update(
			this.pdf.getCurrentPage(),
			this.pdf.getPageCount(),
			this.zoom.currentMode,
			this.readingFlow.currentMode,
			this.focusMode,
		);
	}

	private finishFocusModeChange(): void {
		this.updateOverlay();
		this.showControls();
		this.handleResize();
	}
}
