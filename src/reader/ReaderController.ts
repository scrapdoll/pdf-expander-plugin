import { Component, type WorkspaceLeaf } from 'obsidian';
import { NavigationController } from '../features/navigation/NavigationController';
import { AutoHideController } from '../features/progress/AutoHideController';
import { ReadingPositionController } from '../features/restore-position/ReadingPositionController';
import { ZoomController } from '../features/zoom/ZoomController';
import type { PdfViewerAdapter } from '../pdf/PdfViewerAdapter';
import { ReaderOverlay } from '../ui/ReaderOverlay';
import type { ReaderDataStore } from './ReaderDataStore';
import type { ZoomMode } from './ReaderSettings';

export class ReaderController extends Component {
	private readonly overlay: ReaderOverlay;
	private readonly navigation: NavigationController;
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
		this.zoom = new ZoomController(
			pdf,
			savedState?.cropProfile,
			() => this.position?.scheduleSave(),
		);
		this.position = new ReadingPositionController(
			pdf,
			this.zoom,
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
				this.updateOverlay();
				this.position?.handlePositionChange(page);
			}),
		);
		this.showControls();
	}

	override onunload(): void {
		this.position?.dispose();
		this.zoom.dispose();
		this.overlay.detach();
		this.autoHide.dispose();
		this.viewContainer.classList.remove('pdf-reader-focus-mode');
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
		this.zoom.setMode(
			mode,
			this.pdf.getCurrentPage(),
			this.pdf.getPageCount(),
		);
		this.updateOverlay();
		this.position?.scheduleSave();
		this.showControls();
	}

	private updateOverlay(): void {
		this.overlay.update(
			this.pdf.getCurrentPage(),
			this.pdf.getPageCount(),
			this.zoom.currentMode,
			this.focusMode,
		);
	}

	private finishFocusModeChange(): void {
		this.updateOverlay();
		this.showControls();
		this.handleResize();
	}
}
