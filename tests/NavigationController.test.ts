import { describe, expect, it } from 'vitest';
import { hasAvailableHorizontalPan } from '../src/features/navigation/HorizontalPan';

describe('NavigationController horizontal pan', () => {
	it('reserves horizontal gestures for native panning when content is wider', () => {
		expect(hasAvailableHorizontalPan(1200, 400, false)).toBe(true);
	});

	it('releases horizontal gestures for page navigation when the view is locked', () => {
		expect(hasAvailableHorizontalPan(1200, 400, true)).toBe(false);
	});

	it('ignores insignificant horizontal overflow', () => {
		expect(hasAvailableHorizontalPan(404, 400, false)).toBe(false);
	});
});
