import type { PdfViewerAdapter, NormalizedPdfRect } from '../../pdf/PdfViewerAdapter';

const LAYOUT_TOLERANCE_PX = 2;
const MAX_LAYOUT_CHECKS = 40;

export class ContentAlignment {
	private frame: number | null = null;
	private timer: number | null = null;
	private generation = 0;

	constructor(private readonly pdf: PdfViewerAdapter) {}

	cancel(): void {
		this.generation += 1;
		const ownerWindow = this.ownerWindow;
		if (this.frame !== null) ownerWindow.cancelAnimationFrame(this.frame);
		if (this.timer !== null) ownerWindow.clearTimeout(this.timer);
		this.frame = null;
		this.timer = null;
	}

	schedule(page: number, crop: NormalizedPdfRect, expectedWidth: number): void {
		this.cancel();
		const generation = this.generation;
		let checks = 0;
		const align = (): void => {
			this.frame = null;
			this.timer = null;
			if (generation !== this.generation || this.pdf.getCurrentPage() !== page) return;
			const geometry = this.pdf.getPageGeometry(page);
			if (geometry !== null &&
				Math.abs(geometry.pageWidth - expectedWidth) <= LAYOUT_TOLERANCE_PX) {
				this.pdf.alignPageRegion(page, crop);
			} else if (++checks < MAX_LAYOUT_CHECKS) {
				// Slow WebViews can need more than two animation frames for zoom.
				this.timer = this.ownerWindow.setTimeout(align, 50);
			}
		};
		this.frame = this.ownerWindow.requestAnimationFrame(align);
	}

	private get ownerWindow(): Window {
		return this.pdf.getViewContainer().ownerDocument.defaultView ?? window;
	}
}
