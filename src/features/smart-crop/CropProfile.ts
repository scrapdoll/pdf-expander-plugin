import type { NormalizedPdfRect } from '../../pdf/PdfViewerAdapter';

export type CropBox = NormalizedPdfRect;

export interface SerializedCropProfile {
	odd: CropBox[];
	even: CropBox[];
}

const MAX_SAMPLES_PER_PARITY = 8;

export class CropProfile {
	private readonly odd: CropBox[];
	private readonly even: CropBox[];

	constructor(serialized?: SerializedCropProfile) {
		this.odd = normalizeSamples(serialized?.odd);
		this.even = normalizeSamples(serialized?.even);
	}

	add(page: number, box: CropBox): boolean {
		const normalized = normalizeCropBox(box);
		if (normalized === null) {
			return false;
		}

		const samples = page % 2 === 0 ? this.even : this.odd;
		samples.push(normalized);
		if (samples.length > MAX_SAMPLES_PER_PARITY) {
			samples.shift();
		}
		return true;
	}

	get(page: number): CropBox | null {
		const paritySamples = page % 2 === 0 ? this.even : this.odd;
		const samples =
			paritySamples.length >= 2
				? paritySamples
				: [...this.odd, ...this.even];
		return samples.length > 0 ? medianBox(samples) : null;
	}

	serialize(): SerializedCropProfile {
		return {
			odd: this.odd.map((box) => ({ ...box })),
			even: this.even.map((box) => ({ ...box })),
		};
	}
}

export function normalizeCropProfile(
	value: unknown,
): SerializedCropProfile | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const odd = normalizeSamples(value.odd);
	const even = normalizeSamples(value.even);
	return odd.length > 0 || even.length > 0 ? { odd, even } : undefined;
}

export function normalizeCropBox(value: unknown): CropBox | null {
	if (!isRecord(value)) {
		return null;
	}

	const { left, top, right, bottom } = value;
	if (
		typeof left !== 'number' ||
		typeof top !== 'number' ||
		typeof right !== 'number' ||
		typeof bottom !== 'number' ||
		![left, top, right, bottom].every(Number.isFinite) ||
		left < 0 ||
		top < 0 ||
		right > 1 ||
		bottom > 1 ||
		right - left < 0.1 ||
		bottom - top < 0.1
	) {
		return null;
	}

	return { left, top, right, bottom };
}

function normalizeSamples(value: unknown): CropBox[] {
	return Array.isArray(value)
		? value
				.map((sample) => normalizeCropBox(sample))
				.filter((sample): sample is CropBox => sample !== null)
				.slice(-MAX_SAMPLES_PER_PARITY)
		: [];
}

function medianBox(samples: CropBox[]): CropBox {
	return {
		left: median(samples.map((sample) => sample.left)),
		top: median(samples.map((sample) => sample.top)),
		right: median(samples.map((sample) => sample.right)),
		bottom: median(samples.map((sample) => sample.bottom)),
	};
}

function median(values: number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	const middleValue = sorted[middle] ?? 0;
	if (sorted.length % 2 === 1) {
		return middleValue;
	}
	return ((sorted[middle - 1] ?? middleValue) + middleValue) / 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
