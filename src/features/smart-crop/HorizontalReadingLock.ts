import type { PdfViewerAdapter } from '../../pdf/PdfViewerAdapter';

const POSITION_TOLERANCE_PX = 1;
const LAYOUT_TOLERANCE_PX = 2;

/** Keeps a fitted mobile viewport anchored when native scrolling resets x. */
export class HorizontalReadingLock {
	private release: (() => void) | null = null;

	constructor(private readonly pdf: PdfViewerAdapter) {}

	hold(page: number, pageWidth: number): void {
		this.cancel();
		const document = this.pdf.getViewContainer().ownerDocument;
		if (!document.body?.matches('.is-mobile, .is-phone')) return;
		const container = this.pdf.getScrollContainer();
		if (container === null) return;
		const left = container.scrollLeft;
		if (!Number.isFinite(left)) return;

		const isValid = (): boolean => {
			const geometry = this.pdf.getPageGeometry(page);
			return !(
				this.pdf.getScrollContainer() !== container ||
				this.pdf.getCurrentPage() !== page ||
				geometry === null ||
				Math.abs(geometry.pageWidth - pageWidth) > LAYOUT_TOLERANCE_PX
			);
		};
		const releaseForPinch = (event: TouchEvent): void => {
			if (event.touches.length > 1) this.cancel();
		};
		const stableRelease = this.pdf.lockHorizontalPosition?.() ?? null;
		if (stableRelease !== null) {
			container.addEventListener('touchstart', releaseForPinch, {
				passive: true,
				capture: true,
			});
			this.release = () => {
				container.removeEventListener('touchstart', releaseForPinch, true);
				stableRelease();
			};
			return;
		}

		const restore = (): void => {
			if (!isValid()) {
				this.cancel();
				return;
			}
			const target = Math.min(
				Math.max(left, 0),
				Math.max(container.scrollWidth - container.clientWidth, 0),
			);
			if (Math.abs(container.scrollLeft - target) > POSITION_TOLERANCE_PX) {
				// Do not call scrollTo with a sampled y: vertical momentum can
				// have moved on since that sample. Only repair the horizontal axis.
				container.scrollLeft = target;
			}
		};
		container.addEventListener('scroll', restore, { passive: true });
		container.addEventListener('touchstart', releaseForPinch, {
			passive: true,
			capture: true,
		});
		this.release = () => {
			container.removeEventListener('scroll', restore);
			container.removeEventListener('touchstart', releaseForPinch, true);
		};
	}

	cancel(): void {
		this.release?.();
		this.release = null;
	}
}
