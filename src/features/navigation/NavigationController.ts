import { Component } from 'obsidian';
import type { PdfViewerAdapter } from '../../pdf/PdfViewerAdapter';
import type { ReaderSettings } from '../../reader/ReaderSettings';

interface NavigationActions {
	nextPage(): void;
	previousPage(): void;
	firstPage(): void;
	lastPage(): void;
	showControls(): void;
	toggleControls(): void;
	areControlsVisible(): boolean;
}

interface PointerStart {
	id: number;
	x: number;
	y: number;
	time: number;
	target: EventTarget | null;
}

const TAP_MAX_DISTANCE = 12;
const TAP_MAX_DURATION_MS = 450;
const SWIPE_MIN_DISTANCE = 64;

export class NavigationController extends Component {
	private pointerStart: PointerStart | null = null;

	constructor(
		private readonly pdf: PdfViewerAdapter,
		private readonly getSettings: () => Readonly<ReaderSettings>,
		private readonly actions: NavigationActions,
	) {
		super();
	}

	override onload(): void {
		const container = this.pdf.getViewContainer();
		this.registerDomEvent(
			container,
			'keydown',
			(event) => this.handleKeyDown(event),
			true,
		);
		this.registerDomEvent(container, 'pointerdown', (event) => {
			this.handlePointerDown(event);
		});
		this.registerDomEvent(container, 'pointerup', (event) => {
			this.handlePointerUp(event);
		});
		this.registerDomEvent(container, 'pointercancel', () => {
			this.pointerStart = null;
		});
	}

	private handleKeyDown(event: KeyboardEvent): void {
		if (
			!this.getSettings().enableKeyboardNavigation ||
			event.defaultPrevented ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.shiftKey ||
			this.shouldIgnoreTarget(event.target) ||
			this.hasTextSelection()
		) {
			return;
		}

		let handled = true;
		switch (event.key) {
			case 'ArrowRight':
			case 'PageDown':
				this.actions.nextPage();
				break;
			case 'ArrowLeft':
			case 'PageUp':
				this.actions.previousPage();
				break;
			case 'Home':
				this.actions.firstPage();
				break;
			case 'End':
				this.actions.lastPage();
				break;
			default:
				handled = false;
		}

		if (handled) {
			event.preventDefault();
			event.stopPropagation();
			this.actions.showControls();
		}
	}

	private handlePointerDown(event: PointerEvent): void {
		if (
			!event.isPrimary ||
			this.shouldIgnoreTarget(event.target) ||
			event.button !== 0
		) {
			this.pointerStart = null;
			return;
		}

		this.pointerStart = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			time: performance.now(),
			target: event.target,
		};
	}

	private handlePointerUp(event: PointerEvent): void {
		const start = this.pointerStart;
		this.pointerStart = null;
		if (
			start === null ||
			start.id !== event.pointerId ||
			this.shouldIgnoreTarget(start.target) ||
			this.hasTextSelection()
		) {
			return;
		}

		const deltaX = event.clientX - start.x;
		const deltaY = event.clientY - start.y;
		const distance = Math.hypot(deltaX, deltaY);
		const duration = performance.now() - start.time;
		const isTouch = event.pointerType === 'touch';

		if (
			isTouch &&
			this.getSettings().enableSwipeNavigation &&
			Math.abs(deltaX) >= SWIPE_MIN_DISTANCE &&
			Math.abs(deltaX) > Math.abs(deltaY) * 1.5 &&
			!this.hasHorizontalPan()
		) {
			if (deltaX < 0) {
				this.actions.nextPage();
			} else {
				this.actions.previousPage();
			}
			this.actions.showControls();
			return;
		}

		if (distance > TAP_MAX_DISTANCE || duration > TAP_MAX_DURATION_MS) {
			return;
		}

		if (!this.actions.areControlsVisible()) {
			this.actions.showControls();
			return;
		}

		if (!isTouch || !this.getSettings().enableTapZones) {
			this.actions.toggleControls();
			return;
		}

		const rect = this.pdf.getViewContainer().getBoundingClientRect();
		const relativeX = (event.clientX - rect.left) / Math.max(rect.width, 1);
		if (relativeX <= 0.3) {
			this.actions.previousPage();
			this.actions.showControls();
		} else if (relativeX >= 0.7) {
			this.actions.nextPage();
			this.actions.showControls();
		} else {
			this.actions.toggleControls();
		}
	}

	private shouldIgnoreTarget(target: EventTarget | null): boolean {
		const ownerWindow =
			this.pdf.getViewContainer().ownerDocument.defaultView ?? window;
		if (target === null) {
			return true;
		}
		const node = target as Node;
		return (
			!node.instanceOf(ownerWindow.Element) ||
			node.closest(
				'a, button, input, select, textarea, [contenteditable="true"], ' +
					'[role="button"], .pdf-toolbar, .pdf-findbar, ' +
					'.pdf-sidebar-container, .pdf-reader-overlay',
			) !== null
		);
	}

	private hasTextSelection(): boolean {
		const ownerWindow =
			this.pdf.getViewContainer().ownerDocument.defaultView ?? window;
		const selection = ownerWindow.getSelection();
		return selection !== null && !selection.isCollapsed;
	}

	private hasHorizontalPan(): boolean {
		const scrollContainer = this.pdf.getScrollContainer();
		return (
			scrollContainer !== null &&
			scrollContainer.scrollWidth > scrollContainer.clientWidth + 4
		);
	}
}
