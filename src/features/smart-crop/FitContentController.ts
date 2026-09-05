import type { PdfViewerAdapter } from '../../pdf/PdfViewerAdapter';
import { CropDetector } from './CropDetector';
import { CropProfile, type CropBox, type SerializedCropProfile } from './CropProfile';
import { ContentAlignment } from './ContentAlignment';

const RASTER_MAX_DIMENSION = 384;
const VIEWPORT_PADDING = 24;
const MAX_CACHED_PAGES = 64;
const RETRY_DELAY_MS = 250;
const MAX_RETRIES = 40;
const ZOOM_RELATIVE_TOLERANCE = 0.005;

export class FitContentController {
	private readonly detector = new CropDetector();
	private readonly profile: CropProfile;
	private readonly crops = new Map<number, CropBox>();
	private readonly alignment: ContentAlignment;
	private analysisTimer: number | null = null;
	private activePage: number | null = null;
	private retries = 0;

	constructor(
		private readonly pdf: PdfViewerAdapter,
		serializedProfile: SerializedCropProfile | undefined,
		private readonly onProfileChange: (profile: SerializedCropProfile) => void,
	) {
		this.profile = new CropProfile(serializedProfile);
		this.alignment = new ContentAlignment(pdf);
	}

	fit(page: number, _pageCount: number): boolean {
		this.cancel();
		this.activePage = page;
		this.analyzePage(page);
		const applied = this.applyProfile(page);
		this.scheduleAnalysis();
		return applied;
	}

	// Position notifications include native pagerendered events. Resume after
	// bounded polling if a slow page finally becomes available.
	handleViewerUpdate(page: number): void {
		if (page === this.activePage && !this.crops.has(page)) {
			this.scheduleAnalysis();
		}
	}

	serializeProfile(): SerializedCropProfile {
		return this.profile.serialize();
	}

	cancel(): void {
		this.activePage = null;
		this.retries = 0;
		if (this.analysisTimer !== null) {
			this.ownerWindow.clearTimeout(this.analysisTimer);
			this.analysisTimer = null;
		}
		this.alignment.cancel();
	}

	dispose(): void {
		this.cancel();
	}

	private get ownerWindow(): Window {
		return this.pdf.getViewContainer().ownerDocument.defaultView ?? window;
	}

	private applyProfile(page: number): boolean {
		// Use the saved median only until this page's actual bounds are known.
		const crop = this.crops.get(page) ?? this.profile.get(page);
		const geometry = this.pdf.getPageGeometry(page);
		const currentZoom = this.pdf.getZoom();
		if (
			crop === null || geometry === null || currentZoom === null ||
			currentZoom <= 0 || geometry.pageWidth <= 0 ||
			geometry.viewportWidth <= VIEWPORT_PADDING
		) {
			return false;
		}

		const contentWidth = geometry.pageWidth * (crop.right - crop.left);
		const availableWidth = geometry.viewportWidth - VIEWPORT_PADDING;
		const targetZoom = Math.min(Math.max(
			currentZoom * availableWidth / contentWidth, 0.25,
		), 10);
		const zoomChanges =
			Math.abs(targetZoom - currentZoom) / currentZoom > ZOOM_RELATIVE_TOLERANCE;
		const expectedWidth = zoomChanges
			? geometry.pageWidth * targetZoom / currentZoom
			: geometry.pageWidth;
		if (zoomChanges) {
			this.pdf.setZoom(targetZoom);
		}
		this.alignment.schedule(page, crop, expectedWidth);
		return true;
	}

	private analyzePage(page: number): boolean {
		if (this.crops.has(page)) return true;
		const raster = this.pdf.getPageRaster(page, RASTER_MAX_DIMENSION);
		if (raster === null) return false;
		const crop = this.detector.detect(raster);
		if (crop === null) return false;
		this.crops.set(page, crop);
		if (this.crops.size > MAX_CACHED_PAGES) {
			const oldest = this.crops.keys().next().value;
			if (oldest !== undefined) this.crops.delete(oldest);
		}
		if (this.profile.add(page, crop)) {
			this.onProfileChange(this.profile.serialize());
		}
		return true;
	}

	private scheduleAnalysis(): void {
		const page = this.activePage;
		if (page === null || this.crops.has(page) || this.analysisTimer !== null) return;
		this.analysisTimer = this.ownerWindow.setTimeout(() => {
			this.analysisTimer = null;
			if (this.activePage !== page || this.pdf.getCurrentPage() !== page) return;
			if (this.analyzePage(page)) {
				this.applyProfile(page);
				return;
			}
			this.retries += 1;
			if (this.retries < MAX_RETRIES) this.scheduleAnalysis();
		}, RETRY_DELAY_MS);
	}
}
