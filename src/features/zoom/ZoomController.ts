import type { PdfViewerAdapter } from '../../pdf/PdfViewerAdapter';
import type { ZoomMode } from '../../reader/ReaderSettings';
import type { SerializedCropProfile } from '../smart-crop/CropProfile';
import { FitContentController } from '../smart-crop/FitContentController';

const VIEWPORT_PADDING = 24;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 10;

export class ZoomController {
	private mode: ZoomMode = 'native';
	private customZoom: number | undefined;
	private readonly fitContentController: FitContentController;

	constructor(
		private readonly pdf: PdfViewerAdapter,
		cropProfile: SerializedCropProfile | undefined,
		onCropProfileChange: (profile: SerializedCropProfile) => void,
	) {
		this.fitContentController = new FitContentController(
			pdf,
			cropProfile,
			onCropProfileChange,
		);
	}

	get currentMode(): ZoomMode {
		return this.mode;
	}

	get currentCustomZoom(): number | undefined {
		return this.customZoom;
	}

	setMode(
		mode: ZoomMode,
		page: number,
		pageCount: number,
		customZoom?: number,
	): void {
		this.mode = mode;
		this.customZoom =
			mode === 'custom' && customZoom !== undefined && customZoom > 0
				? customZoom
				: undefined;
		this.apply(page, pageCount);
	}

	apply(page: number, pageCount: number): void {
		switch (this.mode) {
			case 'native':
				break;
			case 'fit-page':
				this.fitPage(page);
				break;
			case 'fit-width':
				this.fitWidth(page);
				break;
			case 'fit-content':
				if (!this.fitContentController.fit(page, pageCount)) {
					this.fitWidth(page);
				}
				break;
			case 'custom':
				if (this.customZoom !== undefined) {
					this.pdf.setZoom(this.customZoom);
				}
				break;
		}
	}

	serializeCropProfile(): SerializedCropProfile {
		return this.fitContentController.serializeProfile();
	}

	dispose(): void {
		this.fitContentController.dispose();
	}

	private fitPage(page: number): void {
		if (this.pdf.setNativeZoomMode('page-fit')) {
			return;
		}

		const geometry = this.pdf.getPageGeometry(page);
		const currentZoom = this.pdf.getZoom();
		if (geometry === null || currentZoom === null) {
			return;
		}

		const widthRatio =
			Math.max(64, geometry.viewportWidth - VIEWPORT_PADDING) /
			geometry.pageWidth;
		const heightRatio =
			Math.max(64, geometry.viewportHeight - VIEWPORT_PADDING) /
			geometry.pageHeight;
		this.pdf.setZoom(
			clampZoom(currentZoom * Math.min(widthRatio, heightRatio)),
		);
	}

	private fitWidth(page: number): void {
		if (this.pdf.setNativeZoomMode('page-width')) {
			return;
		}

		const geometry = this.pdf.getPageGeometry(page);
		const currentZoom = this.pdf.getZoom();
		if (geometry === null || currentZoom === null) {
			return;
		}

		const availableWidth = Math.max(
			64,
			geometry.viewportWidth - VIEWPORT_PADDING,
		);
		this.pdf.setZoom(
			clampZoom((currentZoom * availableWidth) / geometry.pageWidth),
		);
	}
}

function clampZoom(value: number): number {
	return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}
