import { describe, expect, it, vi } from 'vitest';
import { AutoHideController } from '../src/features/progress/AutoHideController';
import type { ReaderSettings } from '../src/reader/ReaderSettings';
import type { ReaderOverlay } from '../src/ui/ReaderOverlay';

describe('AutoHideController desktop activity', () => {
	it('shows controls again when the mouse moves over the PDF view', () => {
		const container = new EventTarget() as unknown as HTMLElement;
		const setVisible = vi.fn();
		const controller = new AutoHideController(
			container,
			{ setVisible } as unknown as ReaderOverlay,
			() => settings(false),
		);
		controller.attach();

		container.dispatchEvent(pointerEvent('mouse'));

		expect(setVisible).toHaveBeenCalledWith(true);
		controller.dispose();
	});

	it('does not treat touch movement as desktop activity', () => {
		const container = new EventTarget() as unknown as HTMLElement;
		const setVisible = vi.fn();
		const controller = new AutoHideController(
			container,
			{ setVisible } as unknown as ReaderOverlay,
			() => settings(false),
		);
		controller.attach();

		container.dispatchEvent(pointerEvent('touch'));

		expect(setVisible).not.toHaveBeenCalled();
		controller.dispose();
	});
});

function pointerEvent(pointerType: string): PointerEvent {
	const event = new Event('pointermove');
	Object.defineProperty(event, 'pointerType', { value: pointerType });
	return event as PointerEvent;
}

function settings(autoHideControls: boolean): ReaderSettings {
	return {
		defaultZoomMode: 'native',
		autoHideControls,
		autoHideDelayMs: 2200,
		rememberPosition: true,
		enableTapZones: true,
		enableSwipeNavigation: true,
		enableKeyboardNavigation: true,
	};
}
