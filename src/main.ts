import { Plugin } from 'obsidian';
import { registerReaderCommands } from './integration/Commands';
import { WorkspaceController } from './integration/WorkspaceController';
import { ReaderDataStore } from './reader/ReaderDataStore';
import { ReaderSettingsTab } from './ui/ReaderSettingsTab';

export default class PdfReaderPlugin extends Plugin {
	override async onload(): Promise<void> {
		const store = new ReaderDataStore(this);
		await store.loadPersistedData();
		this.addChild(store);
		const workspaceController = this.addChild(
			new WorkspaceController(this.app, store),
		);

		registerReaderCommands(this, workspaceController);
		this.addSettingTab(
			new ReaderSettingsTab(this.app, this, store, () => {
				workspaceController.refreshSettings();
			}),
		);
	}
}
