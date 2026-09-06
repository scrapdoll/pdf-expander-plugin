import { Notice, type Plugin } from 'obsidian';
import type { ReaderController } from '../reader/ReaderController';
import {
	copyText,
	createPdfLink,
	getPdfFile,
} from './LinkIntegration';
import type { WorkspaceController } from './WorkspaceController';

export function registerReaderCommands(
	plugin: Plugin,
	workspaceController: WorkspaceController,
): void {
	addReaderCommand(plugin, workspaceController, 'next-page', 'Next page', (reader) => {
		reader.nextPage();
	});
	addReaderCommand(
		plugin,
		workspaceController,
		'previous-page',
		'Previous page',
		(reader) => {
			reader.previousPage();
		},
	);
	addReaderCommand(
		plugin,
		workspaceController,
		'toggle-controls',
		'Toggle reader controls',
		(reader) => {
			reader.toggleControls();
		},
	);
	addReaderCommand(
		plugin,
		workspaceController,
		'toggle-focus-mode',
		'Toggle focus mode',
		(reader) => {
			reader.toggleFocusMode();
		},
	);
	addReaderCommand(
		plugin,
		workspaceController,
		'toggle-horizontal-reading',
		'Toggle horizontal reading',
		(reader) => {
			reader.toggleHorizontalReading();
		},
	);
	addReaderCommand(
		plugin,
		workspaceController,
		'use-vertical-reading',
		'Use vertical reading',
		(reader) => {
			reader.setVerticalReading();
		},
	);
	addReaderCommand(
		plugin,
		workspaceController,
		'use-horizontal-reading',
		'Use horizontal reading',
		(reader) => {
			reader.setHorizontalReading();
		},
	);
	addReaderCommand(
		plugin,
		workspaceController,
		'use-native-zoom',
		'Use native zoom',
		(reader) => {
			reader.setNativeZoom();
		},
	);
	addReaderCommand(
		plugin,
		workspaceController,
		'fit-page',
		'Fit page',
		(reader) => {
			reader.setFitPage();
		},
	);
	addReaderCommand(
		plugin,
		workspaceController,
		'fit-width',
		'Fit width',
		(reader) => {
			reader.setFitWidth();
		},
	);
	addReaderCommand(
		plugin,
		workspaceController,
		'fit-content',
		'Fit content',
		(reader) => {
			reader.setFitContent();
		},
	);

	plugin.addCommand({
		id: 'copy-link-to-current-page',
		name: 'Copy link to current page',
		checkCallback: (checking) => {
			const reader = workspaceController.getActiveReader();
			const file = reader === null ? null : getPdfFile(reader.leaf);
			if (reader === null || file === null) {
				return false;
			}

			if (!checking) {
				const link = createPdfLink(
					plugin.app,
					file,
					reader.getCurrentPage(),
				);
				void copyLink(reader, link, 'Link to the current PDF page copied');
			}
			return true;
		},
	});

	plugin.addCommand({
		id: 'copy-link-to-pdf',
		name: 'Copy link to PDF',
		checkCallback: (checking) => {
			const reader = workspaceController.getActiveReader();
			const file = reader === null ? null : getPdfFile(reader.leaf);
			if (reader === null || file === null) {
				return false;
			}

			if (!checking) {
				void copyLink(
					reader,
					createPdfLink(plugin.app, file),
					'Link to the PDF copied',
				);
			}
			return true;
		},
	});
}

function addReaderCommand(
	plugin: Plugin,
	workspaceController: WorkspaceController,
	id: string,
	name: string,
	action: (reader: ReaderController) => void,
): void {
	plugin.addCommand({
		id,
		name,
		checkCallback: (checking) => {
			const reader = workspaceController.getActiveReader();
			if (reader === null) {
				return false;
			}
			if (!checking) {
				action(reader);
			}
			return true;
		},
	});
}

async function copyLink(
	reader: ReaderController,
	link: string,
	successMessage: string,
): Promise<void> {
	try {
		await copyText(reader.pdf.getViewContainer().ownerDocument, link);
		new Notice(successMessage);
	} catch (error) {
		console.error('PDF Reader: Failed to copy a link', error);
		new Notice('Could not copy the PDF link');
	}
}
