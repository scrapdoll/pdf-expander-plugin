export function connectOverlay(
	container: HTMLElement,
	overlay: HTMLElement,
): void {
	container.classList.add('pdf-reader-enhanced');
	if (overlay.parentElement !== container) {
		container.append(overlay);
	}
}
