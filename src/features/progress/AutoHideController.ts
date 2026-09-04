import type { ReaderSettings } from '../../reader/ReaderSettings';
import type { ReaderOverlay } from '../../ui/ReaderOverlay';

export class AutoHideController {
	private hideTimer: number | null = null;
	private interactionCleanup: (() => void) | null = null;
	private lastPointerActivity: number | null = null;

	constructor(
		private readonly container: HTMLElement,
		private readonly overlay: ReaderOverlay,
		private readonly getSettings: () => Readonly<ReaderSettings>,
	) {}

	attach(): void {
		if (this.interactionCleanup !== null) {
			return;
		}

		const handlePointerMove = (event: PointerEvent): void => {
			if (event.pointerType !== 'mouse') {
				return;
			}

			const now = event.timeStamp;
			if (
				this.lastPointerActivity !== null &&
				now - this.lastPointerActivity < 250
			) {
				return;
			}
			this.lastPointerActivity = now;
			this.show();
		};
		const handleFocusIn = (): void => this.show();

		this.container.addEventListener('pointermove', handlePointerMove, {
			passive: true,
		});
		this.container.addEventListener('focusin', handleFocusIn);
		this.interactionCleanup = () => {
			this.container.removeEventListener('pointermove', handlePointerMove);
			this.container.removeEventListener('focusin', handleFocusIn);
		};
	}

	show(): void {
		this.overlay.setVisible(true);
		this.scheduleHide();
	}

	toggle(): void {
		if (this.overlay.isVisible()) {
			this.clearTimer();
			this.overlay.setVisible(false);
		} else {
			this.show();
		}
	}

	handleInteraction(active: boolean): void {
		if (active) {
			this.clearTimer();
			this.overlay.setVisible(true);
		} else {
			this.scheduleHide();
		}
	}

	refreshSettings(): void {
		if (this.getSettings().autoHideControls) {
			this.scheduleHide();
		} else {
			this.clearTimer();
			this.overlay.setVisible(true);
		}
	}

	dispose(): void {
		this.clearTimer();
		this.interactionCleanup?.();
		this.interactionCleanup = null;
		this.lastPointerActivity = null;
	}

	private scheduleHide(): void {
		this.clearTimer();
		const settings = this.getSettings();
		if (!settings.autoHideControls) {
			return;
		}

		const ownerWindow = this.container.ownerDocument.defaultView ?? window;
		this.hideTimer = ownerWindow.setTimeout(() => {
			this.hideTimer = null;
			this.overlay.setVisible(false);
		}, settings.autoHideDelayMs);
	}

	private clearTimer(): void {
		if (this.hideTimer === null) {
			return;
		}
		const ownerWindow = this.container.ownerDocument.defaultView ?? window;
		ownerWindow.clearTimeout(this.hideTimer);
		this.hideTimer = null;
	}
}
