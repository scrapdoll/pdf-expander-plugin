import { FileView, type App, type TFile, type WorkspaceLeaf } from 'obsidian';
import {
	parsePdfPageReference,
	parsePositiveInteger,
} from './PdfLinkParser';

export function getPdfFile(leaf: WorkspaceLeaf): TFile | null {
	const view = leaf.view;
	return view instanceof FileView && view.file?.extension.toLowerCase() === 'pdf'
		? view.file
		: null;
}

export function getExplicitPdfPage(leaf: WorkspaceLeaf): number | null {
	const state = leaf.getViewState().state;
	const statePage = isRecord(state) ? getPageFromState(state) : null;
	if (statePage !== null) {
		return statePage;
	}
	return getPageFromState(leaf.view.getEphemeralState());
}


function getPageFromState(state: Record<string, unknown>): number | null {
	const directPage = parsePositiveInteger(state.page);
	if (directPage !== null) {
		return directPage;
	}

	for (const value of [state.subpath, state.file]) {
		if (typeof value === 'string') {
			const page = parsePdfPageReference(value);
			if (page !== null) {
				return page;
			}
		}
	}

	return isRecord(state.eState) ? getPageFromState(state.eState) : null;
}

export function createPdfLink(
	app: App,
	file: TFile,
	page?: number,
): string {
	return app.fileManager.generateMarkdownLink(
		file,
		'',
		page === undefined ? undefined : `#page=${page}`,
	);
}

export async function copyText(
	document: Document,
	text: string,
): Promise<void> {
	const clipboard = document.defaultView?.navigator.clipboard;
	if (clipboard === undefined) {
		throw new Error('Clipboard API is unavailable');
	}
	await clipboard.writeText(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
