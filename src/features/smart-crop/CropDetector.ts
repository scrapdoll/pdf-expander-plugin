import type { PdfPageRaster } from '../../pdf/PdfViewerAdapter';
import type { CropBox } from './CropProfile';

const COLOR_DISTANCE_THRESHOLD = 24;
const LUMINANCE_DISTANCE_THRESHOLD = 18;
const CROP_PADDING = 0.015;

export class CropDetector {
	detect(raster: PdfPageRaster): CropBox | null {
		const { width, height, data } = raster;
		if (width < 8 || height < 8 || data.length < width * height * 4) {
			return null;
		}

		const background = estimateBackground(raster);
		const rowInk = new Uint32Array(height);
		const columnInk = new Uint32Array(width);

		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const index = (y * width + x) * 4;
				if (isContentPixel(data, index, background)) {
					rowInk[y] = (rowInk[y] ?? 0) + 1;
					columnInk[x] = (columnInk[x] ?? 0) + 1;
				}
			}
		}

		const rowThreshold = Math.max(2, Math.floor(width * 0.003));
		const columnThreshold = Math.max(2, Math.floor(height * 0.003));
		const top = findStart(rowInk, rowThreshold);
		const bottom = findEnd(rowInk, rowThreshold);
		const left = findStart(columnInk, columnThreshold);
		const right = findEnd(columnInk, columnThreshold);
		if (top === null || bottom === null || left === null || right === null) {
			return null;
		}

		const box: CropBox = {
			left: Math.max(0, left / width - CROP_PADDING),
			top: Math.max(0, top / height - CROP_PADDING),
			right: Math.min(1, (right + 1) / width + CROP_PADDING),
			bottom: Math.min(1, (bottom + 1) / height + CROP_PADDING),
		};

		return box.right - box.left >= 0.1 && box.bottom - box.top >= 0.1
			? box
			: null;
	}
}

interface RgbColor {
	red: number;
	green: number;
	blue: number;
}

function estimateBackground(raster: PdfPageRaster): RgbColor {
	const { width, height, data } = raster;
	const insetX = Math.min(2, width - 1);
	const insetY = Math.min(2, height - 1);
	const points = [
		[insetX, insetY],
		[width - 1 - insetX, insetY],
		[insetX, height - 1 - insetY],
		[width - 1 - insetX, height - 1 - insetY],
	] as const;
	let red = 0;
	let green = 0;
	let blue = 0;

	for (const [x, y] of points) {
		const index = (y * width + x) * 4;
		red += data[index] ?? 255;
		green += data[index + 1] ?? 255;
		blue += data[index + 2] ?? 255;
	}

	return {
		red: red / points.length,
		green: green / points.length,
		blue: blue / points.length,
	};
}

function isContentPixel(
	data: Uint8ClampedArray,
	index: number,
	background: RgbColor,
): boolean {
	const alpha = data[index + 3] ?? 0;
	if (alpha < 16) {
		return false;
	}

	const red = data[index] ?? background.red;
	const green = data[index + 1] ?? background.green;
	const blue = data[index + 2] ?? background.blue;
	const colorDistance = Math.max(
		Math.abs(red - background.red),
		Math.abs(green - background.green),
		Math.abs(blue - background.blue),
	);
	const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
	const backgroundLuminance =
		0.2126 * background.red +
		0.7152 * background.green +
		0.0722 * background.blue;

	return (
		colorDistance >= COLOR_DISTANCE_THRESHOLD ||
		Math.abs(luminance - backgroundLuminance) >=
			LUMINANCE_DISTANCE_THRESHOLD
	);
}

function findStart(values: Uint32Array, threshold: number): number | null {
	for (let index = 0; index < values.length; index += 1) {
		if ((values[index] ?? 0) >= threshold) {
			return index;
		}
	}
	return null;
}

function findEnd(values: Uint32Array, threshold: number): number | null {
	for (let index = values.length - 1; index >= 0; index -= 1) {
		if ((values[index] ?? 0) >= threshold) {
			return index;
		}
	}
	return null;
}
