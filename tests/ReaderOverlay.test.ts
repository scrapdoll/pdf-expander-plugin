import { describe, expect, it, vi } from 'vitest';
import { connectOverlay } from '../src/ui/OverlayHost';

describe('ReaderOverlay', () => {
	it('reconnects an overlay after the native PDF view removes it', () => {
		const addClass = vi.fn();
		const overlay = { parentElement: null } as unknown as HTMLElement;
		let container: HTMLElement;
		const append = vi.fn((child: HTMLElement) => {
			Object.defineProperty(child, 'parentElement', {
				configurable: true,
				value: container,
			});
		});
		container = {
			classList: { add: addClass },
			append,
		} as unknown as HTMLElement;
		connectOverlay(container, overlay);
		Object.defineProperty(overlay, 'parentElement', {
			configurable: true,
			value: null,
		});

		connectOverlay(container, overlay);

		expect(append).toHaveBeenCalledTimes(2);
		expect(addClass).toHaveBeenCalledWith('pdf-reader-enhanced');
	});
});
