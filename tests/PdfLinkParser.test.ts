import { describe, expect, it } from 'vitest';
import {
	parsePdfPageReference,
	parsePositiveInteger,
} from '../src/integration/PdfLinkParser';

describe('PDF link parsing', () => {
	it('reads standard Obsidian PDF page subpaths', () => {
		expect(parsePdfPageReference('#page=137')).toBe(137);
		expect(parsePdfPageReference('Book.pdf#page=42')).toBe(42);
	});

	it('rejects invalid or missing pages', () => {
		expect(parsePdfPageReference('#page=0')).toBeNull();
		expect(parsePdfPageReference('#selection=10')).toBeNull();
		expect(parsePositiveInteger('not-a-page')).toBeNull();
	});
});
