import { Menu, setIcon } from 'obsidian';
import type { ReadingFlow, ZoomMode } from '../reader/ReaderSettings';
import { connectOverlay } from './OverlayHost';

export interface ReaderOverlayActions {
	onScrub(page: number): void;
	onSetNativeZoom(): void;
	onFitPage(): void;
	onFitWidth(): void;
	onFitContent(): void;
	onSetVerticalReading(): void;
	onSetHorizontalReading(): void;
	onToggleFocus(): void;
	onInteractionChange(active: boolean): void;
}

export class ReaderOverlay {
	private rootElement: HTMLElement | null = null;
	private pageElement: HTMLElement | null = null;
	private scrubberElement: HTMLInputElement | null = null;
	private menuButton: HTMLButtonElement | null = null;
	private visible = true;
	private dragging = false;
	private dragPointerId: number | null = null;
	private dragPointerType: string | null = null;
	private pendingScrubPage: number | null = null;
	private scrubFrame: number | null = null;
	private activeMenu: Menu | null = null;
	private currentMode: ZoomMode = 'native';
	private currentReadingFlow: ReadingFlow = 'vertical';
	private focusMode = false;

	constructor(
		private readonly container: HTMLElement,
		private readonly actions: ReaderOverlayActions,
	) {}

	attach(): void {
		if (this.rootElement !== null) {
			connectOverlay(this.container, this.rootElement);
			return;
		}

		this.container.classList.add('pdf-reader-enhanced');
		const document = this.container.ownerDocument;
		const root = document.createElement('div');
		root.className = 'pdf-reader-overlay is-visible';
		const controls = document.createElement('div');
		controls.className = 'pdf-reader-controls';
		controls.addEventListener('click', stopPropagation);
		controls.addEventListener('pointerdown', stopPropagation);
		controls.addEventListener('pointerup', stopPropagation);
		controls.addEventListener('pointercancel', stopPropagation);
		controls.addEventListener('pointerenter', (event) => {
			if (event.pointerType === 'mouse') {
				this.actions.onInteractionChange(true);
			}
		});
		controls.addEventListener('pointerleave', (event) => {
			if (event.pointerType === 'mouse' && !this.dragging) {
				this.actions.onInteractionChange(false);
			}
		});

		const page = document.createElement('span');
		page.className = 'pdf-reader-page-indicator';
		page.setAttribute('aria-live', 'polite');
		page.setAttribute('aria-atomic', 'true');
		page.textContent = '– / –';

		const scrubber = document.createElement('input');
		scrubber.className = 'pdf-reader-scrubber';
		scrubber.type = 'range';
		scrubber.min = '1';
		scrubber.max = '1';
		scrubber.step = '1';
		scrubber.value = '1';
		scrubber.disabled = true;
		scrubber.setAttribute('aria-label', 'PDF page');
		scrubber.addEventListener('pointerdown', (event) => {
			this.dragging = true;
			this.dragPointerId = event.pointerId;
			this.dragPointerType = event.pointerType;
			try {
				scrubber.setPointerCapture(event.pointerId);
			} catch {
				// Older mobile WebViews may not support capture on range inputs.
			}
			this.actions.onInteractionChange(true);
		});
		scrubber.addEventListener('pointerup', () => this.finishScrub(true));
		scrubber.addEventListener('pointercancel', () => this.finishScrub(false));
		scrubber.addEventListener('change', () => this.finishScrub(true));
		scrubber.addEventListener('input', () => {
			const targetPage = Number.parseInt(scrubber.value, 10);
			if (Number.isFinite(targetPage)) {
				if (this.pageElement !== null) {
					this.pageElement.textContent = `${targetPage} / ${scrubber.max}`;
				}
				this.pendingScrubPage = targetPage;
				if (!(this.dragging && this.dragPointerType === 'touch')) {
					this.scheduleScrub();
				}
			}
		});

		const menuButton = document.createElement('button');
		menuButton.className = 'clickable-icon pdf-reader-display-menu';
		menuButton.type = 'button';
		menuButton.setAttribute('aria-label', 'PDF reader display options');
		setIcon(menuButton, 'settings-2');
		menuButton.addEventListener('click', (event) => {
			this.actions.onInteractionChange(true);
			this.openDisplayMenu(event);
		});

		controls.append(page, scrubber, menuButton);
		root.append(controls);
		connectOverlay(this.container, root);
		this.rootElement = root;
		this.pageElement = page;
		this.scrubberElement = scrubber;
		this.menuButton = menuButton;
	}

	update(
		page: number,
		pageCount: number,
		mode: ZoomMode,
		readingFlow: ReadingFlow,
		focusMode: boolean,
	): void {
		// Obsidian can rebuild the native PDF view after file-open and remove
		// injected children. Reconnect the existing overlay when that happens.
		this.attach();
		this.currentMode = mode;
		this.currentReadingFlow = readingFlow;
		this.focusMode = focusMode;
		if (this.pageElement !== null) {
			this.pageElement.textContent =
				pageCount > 0
					? `${Math.min(Math.max(page, 1), pageCount)} / ${pageCount}`
					: '– / –';
		}

		if (this.scrubberElement !== null) {
			this.scrubberElement.disabled = pageCount <= 1;
			this.scrubberElement.max = String(Math.max(pageCount, 1));
			if (!this.dragging) {
				this.scrubberElement.value = String(
					Math.min(Math.max(page, 1), Math.max(pageCount, 1)),
				);
			}
			this.scrubberElement.setAttribute(
				'aria-valuetext',
				pageCount > 0 ? `Page ${page} of ${pageCount}` : 'PDF loading',
			);
		}

		this.menuButton?.classList.toggle(
			'is-active',
			mode !== 'native' || readingFlow !== 'vertical',
		);
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.rootElement?.classList.toggle('is-visible', visible);
	}

	isVisible(): boolean {
		return this.visible;
	}

	detach(): void {
		this.activeMenu?.hide();
		this.activeMenu = null;
		this.rootElement?.remove();
		this.container.classList.remove(
			'pdf-reader-enhanced',
			'pdf-reader-focus-mode',
			'pdf-reader-horizontal-reading',
		);
		this.rootElement = null;
		this.pageElement = null;
		this.scrubberElement = null;
		this.menuButton = null;
		this.dragging = false;
		this.dragPointerId = null;
		this.dragPointerType = null;
		this.pendingScrubPage = null;
		if (this.scrubFrame !== null) {
			const ownerWindow = this.container.ownerDocument.defaultView ?? window;
			ownerWindow.cancelAnimationFrame(this.scrubFrame);
			this.scrubFrame = null;
		}
	}

	private finishScrub(commit: boolean): void {
		const scrubber = this.scrubberElement;
		if (scrubber !== null && this.dragPointerId !== null) {
			try {
				if (scrubber.hasPointerCapture(this.dragPointerId)) {
					scrubber.releasePointerCapture(this.dragPointerId);
				}
			} catch {
				// Pointer capture is best-effort on mobile range controls.
			}
		}

		this.dragging = false;
		this.dragPointerId = null;
		this.dragPointerType = null;
		if (commit) {
			this.flushScrub();
		} else {
			this.cancelScrub();
		}
		this.actions.onInteractionChange(false);
	}

	private scheduleScrub(): void {
		if (this.scrubFrame !== null) {
			return;
		}

		const ownerWindow = this.container.ownerDocument.defaultView ?? window;
		this.scrubFrame = ownerWindow.requestAnimationFrame(() => {
			this.scrubFrame = null;
			const targetPage = this.pendingScrubPage;
			this.pendingScrubPage = null;
			if (targetPage !== null) {
				this.actions.onScrub(targetPage);
			}
		});
	}

	private flushScrub(): void {
		this.cancelScrubFrame();
		const targetPage = this.pendingScrubPage;
		this.pendingScrubPage = null;
		if (targetPage !== null) {
			this.actions.onScrub(targetPage);
		}
	}

	private cancelScrub(): void {
		this.cancelScrubFrame();
		this.pendingScrubPage = null;
	}

	private cancelScrubFrame(): void {
		if (this.scrubFrame === null) {
			return;
		}

		const ownerWindow = this.container.ownerDocument.defaultView ?? window;
		ownerWindow.cancelAnimationFrame(this.scrubFrame);
		this.scrubFrame = null;
	}

	private openDisplayMenu(event: MouseEvent): void {
		this.activeMenu?.hide();
		const menu = new Menu()
			.addItem((item) => {
				item
					.setTitle('Native zoom')
					.setIcon('rotate-ccw')
					.setChecked(this.currentMode === 'native')
					.onClick(() => this.actions.onSetNativeZoom());
			})
			.addItem((item) => {
				item
					.setTitle('Fit page')
					.setIcon('move-vertical')
					.setChecked(this.currentMode === 'fit-page')
					.onClick(() => this.actions.onFitPage());
			})
			.addItem((item) => {
				item
					.setTitle('Fit width')
					.setIcon('move-horizontal')
					.setChecked(this.currentMode === 'fit-width')
					.onClick(() => this.actions.onFitWidth());
			})
			.addItem((item) => {
				item
					.setTitle('Fit content')
					.setIcon('scan')
					.setChecked(this.currentMode === 'fit-content')
					.onClick(() => this.actions.onFitContent());
			})
			.addSeparator()
			.addItem((item) => {
				item
					.setTitle('Vertical reading')
					.setIcon('rows-3')
					.setChecked(this.currentReadingFlow === 'vertical')
					.onClick(() => this.actions.onSetVerticalReading());
			})
			.addItem((item) => {
				item
					.setTitle('Horizontal reading')
					.setIcon('columns-3')
					.setChecked(this.currentReadingFlow === 'horizontal')
					.onClick(() => this.actions.onSetHorizontalReading());
			})
			.addSeparator()
			.addItem((item) => {
				item
					.setTitle(this.focusMode ? 'Exit focus mode' : 'Enter focus mode')
					.setIcon('focus')
					.setChecked(this.focusMode)
					.onClick(() => this.actions.onToggleFocus());
			});

		menu.onHide(() => {
			if (this.activeMenu === menu) {
				this.activeMenu = null;
			}
			this.actions.onInteractionChange(false);
		});
		this.activeMenu = menu;
		menu.showAtMouseEvent(event);
	}
}

function stopPropagation(event: Event): void {
	event.stopPropagation();
}
