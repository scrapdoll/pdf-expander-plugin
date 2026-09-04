import { describe, expect, it } from 'vitest';
import { CropDetector } from '../src/features/smart-crop/CropDetector';
import type { PdfPageRaster } from '../src/pdf/PdfViewerAdapter';

describe('CropDetector', () => {
	it('detects a padded content box on a light page', () => {
		const raster = createRaster(100, 120, 255);
		paintRectangle(raster, 20, 15, 80, 100, 20);

		const crop = new CropDetector().detect(raster);

		expect(crop).not.toBeNull();
		expect(crop?.left).toBeCloseTo(0.185, 2);
		expect(crop?.top).toBeCloseTo(0.11, 2);
		expect(crop?.right).toBeCloseTo(0.815, 2);
		expect(crop?.bottom).toBeCloseTo(0.85, 2);
	});

	it('ignores isolated pixel noise', () => {
		const raster = createRaster(100, 120, 255);
		setPixel(raster, 50, 60, 0);

		expect(new CropDetector().detect(raster)).toBeNull();
	});

	it('detects light content on a dark page', () => {
		const raster = createRaster(80, 100, 10);
		paintRectangle(raster, 12, 10, 68, 90, 240);

		const crop = new CropDetector().detect(raster);

		expect(crop).not.toBeNull();
		expect(crop?.left).toBeLessThan(0.16);
		expect(crop?.right).toBeGreaterThan(0.84);
	});

	it('detects opaque text on a transparent PDF canvas', () => {
		const raster = createRaster(100, 120, 0, 0);
		paintRectangle(raster, 20, 15, 80, 100, 20);

		const crop = new CropDetector().detect(raster);

		expect(crop).not.toBeNull();
		expect(crop?.left).toBeCloseTo(0.185, 2);
		expect(crop?.right).toBeCloseTo(0.815, 2);
	});
});

function createRaster(
	width: number,
	height: number,
	value: number,
	alpha = 255,
): PdfPageRaster {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let index = 0; index < data.length; index += 4) {
		data[index] = value;
		data[index + 1] = value;
		data[index + 2] = value;
		data[index + 3] = alpha;
	}
	return { width, height, data };
}

function paintRectangle(
	raster: PdfPageRaster,
	left: number,
	top: number,
	right: number,
	bottom: number,
	value: number,
): void {
	for (let y = top; y < bottom; y += 1) {
		for (let x = left; x < right; x += 1) {
			setPixel(raster, x, y, value);
		}
	}
}

function setPixel(
	raster: PdfPageRaster,
	x: number,
	y: number,
	value: number,
): void {
	const index = (y * raster.width + x) * 4;
	raster.data[index] = value;
	raster.data[index + 1] = value;
	raster.data[index + 2] = value;
	raster.data[index + 3] = 255;
}
