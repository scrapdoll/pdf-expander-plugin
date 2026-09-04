import type { PdfViewerAdapter } from '../../pdf/PdfViewerAdapter';
import { CropDetector } from './CropDetector';
import {
	CropProfile,
	type CropBox,
	type SerializedCropProfile,
} from './CropProfile';

const RASTER_MAX_DIMENSION = 384;
const VIEWPORT_PADDING = 24;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 10;
const ZOOM_RELATIVE_TOLERANCE = 0.005;

export class FitContentController {
	private readonly detector = new CropDetector();
	private readonly profile: CropProfile;
	private readonly analyzedPages = new Set<number>();
	private analysisTimer: number | null = null;
	private firstAlignmentFrame: number | null = null;
	private secondAlignmentFrame: number | null = null;

	constructor(
		private readonly pdf: PdfViewerAdapter,
		serializedProfile: SerializedCropProfile | undefined,
		private readonly onProfileChange: (
			profile: SerializedCropProfile,
		) => void,
	) {
		this.profile = new CropProfile(serializedProfile);
	}

	fit(page: number, pageCount: number): boolean {
		this.analyzePage(page);
		this.scheduleNearbyAnalysis(page, pageCount);
		return this.applyProfile(page);
	}

	private applyProfile(page: number): boolean {
		const crop = this.profile.get(page);
		const geometry = this.pdf.getPageGeometry(page);
		const currentZoom = this.pdf.getZoom();
		if (crop === null || geometry === null || currentZoom === null) {
			return false;
		}

		const contentWidth = geometry.pageWidth * (crop.right - crop.left);
		if (contentWidth <= 0) {
			return false;
		}

		const availableWidth = Math.max(
			64,
			geometry.viewportWidth - VIEWPORT_PADDING,
		);
		const targetZoom = Math.min(
			Math.max((currentZoom * availableWidth) / contentWidth, MIN_ZOOM),
			MAX_ZOOM,
		);
		const zoomChanges =
			Math.abs(targetZoom - currentZoom) / currentZoom >
			ZOOM_RELATIVE_TOLERANCE;
		if (zoomChanges) {
			this.pdf.setZoom(targetZoom);
		}
		this.scheduleAlignment(page, crop, zoomChanges);
		return true;
	}

	serializeProfile(): SerializedCropProfile {
		return this.profile.serialize();
	}

	dispose(): void {
		const ownerWindow =
			this.pdf.getViewContainer().ownerDocument.defaultView ?? window;
		if (this.analysisTimer !== null) {
			ownerWindow.clearTimeout(this.analysisTimer);
		}
		if (this.firstAlignmentFrame !== null) {
			ownerWindow.cancelAnimationFrame(this.firstAlignmentFrame);
		}
		if (this.secondAlignmentFrame !== null) {
			ownerWindow.cancelAnimationFrame(this.secondAlignmentFrame);
		}
	}

	private analyzePage(page: number): void {
		if (this.analyzedPages.has(page)) {
			return;
		}
		const raster = this.pdf.getPageRaster(page, RASTER_MAX_DIMENSION);
		if (raster === null) {
			return;
		}
		const crop = this.detector.detect(raster);
		if (crop !== null) {
			this.analyzedPages.add(page);
		}
		if (crop !== null && this.profile.add(page, crop)) {
			this.onProfileChange(this.profile.serialize());
		}
	}

	private scheduleNearbyAnalysis(page: number, pageCount: number): void {
		const ownerWindow =
			this.pdf.getViewContainer().ownerDocument.defaultView ?? window;
		if (this.analysisTimer !== null) {
			ownerWindow.clearTimeout(this.analysisTimer);
		}

		this.analysisTimer = ownerWindow.setTimeout(() => {
			this.analysisTimer = null;
			const candidates = [page, page - 2, page - 1, page + 1, page + 2];
			for (const candidate of candidates) {
				if (candidate >= 1 && candidate <= pageCount) {
					this.analyzePage(candidate);
				}
			}
			if (this.pdf.getCurrentPage() === page) {
				this.applyProfile(page);
			}
		}, 250);
	}

	private scheduleAlignment(
		page: number,
		crop: CropBox,
		waitForZoom: boolean,
	): void {
		const ownerWindow =
			this.pdf.getViewContainer().ownerDocument.defaultView ?? window;
		if (this.firstAlignmentFrame !== null) {
			ownerWindow.cancelAnimationFrame(this.firstAlignmentFrame);
		}
		if (this.secondAlignmentFrame !== null) {
			ownerWindow.cancelAnimationFrame(this.secondAlignmentFrame);
		}

		this.firstAlignmentFrame = ownerWindow.requestAnimationFrame(() => {
			this.firstAlignmentFrame = null;
			if (!waitForZoom) {
				this.pdf.alignPageRegion(page, crop);
				return;
			}
			this.secondAlignmentFrame = ownerWindow.requestAnimationFrame(() => {
				this.secondAlignmentFrame = null;
				this.pdf.alignPageRegion(page, crop);
			});
		});
	}
}
