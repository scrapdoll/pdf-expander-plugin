import type {
	PdfScrollMode,
	PdfViewerAdapter,
} from '../../pdf/PdfViewerAdapter';
import type { ReadingFlow } from '../../reader/ReaderSettings';

const HORIZONTAL_READING_CLASS = 'pdf-reader-horizontal-reading';

/** Coordinates the persisted reading flow with PDF.js' native scroll mode. */
export class ReadingFlowController {
	private mode: ReadingFlow = 'vertical';
	private originalNativeMode: PdfScrollMode | null = null;
	private changedNativeMode = false;

	constructor(private readonly pdf: PdfViewerAdapter) {}

	get currentMode(): ReadingFlow {
		return this.mode;
	}

	setMode(mode: ReadingFlow): void {
		this.mode = mode;
		this.apply();
	}

	apply(): void {
		this.pdf
			.getViewContainer()
			.classList.toggle(HORIZONTAL_READING_CLASS, this.mode === 'horizontal');

		const nativeMode = this.pdf.getScrollMode();
		if (nativeMode === this.mode) {
			return;
		}
		if (!this.changedNativeMode && nativeMode !== null) {
			this.originalNativeMode = nativeMode;
		}
		if (this.pdf.setScrollMode(this.mode)) {
			this.changedNativeMode = true;
		}
	}

	dispose(): void {
		this.pdf
			.getViewContainer()
			.classList.remove(HORIZONTAL_READING_CLASS);
		if (this.changedNativeMode && this.originalNativeMode !== null) {
			this.pdf.setScrollMode(this.originalNativeMode);
		}
		this.changedNativeMode = false;
		this.originalNativeMode = null;
	}
}
