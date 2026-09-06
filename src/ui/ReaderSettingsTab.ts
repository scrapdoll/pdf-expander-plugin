import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { ReaderDataStore } from '../reader/ReaderDataStore';
import type { ReaderSettings } from '../reader/ReaderSettings';

export class ReaderSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly store: ReaderDataStore,
		private readonly onSettingsChange: () => void,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName('Global defaults').setHeading();

		new Setting(containerEl)
			.setName('Default zoom mode')
			.setDesc('Applied when a PDF has no saved document state.')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('native', 'Native')
					.addOption('fit-page', 'Fit page')
					.addOption('fit-width', 'Fit width')
					.addOption('fit-content', 'Fit content')
					.setValue(this.store.settings.defaultZoomMode)
					.onChange((value) => {
						this.updateSetting({
							defaultZoomMode:
								value as ReaderSettings['defaultZoomMode'],
						});
					});
			});

		new Setting(containerEl)
			.setName('Default reading flow')
			.setDesc('Applied when a PDF has no saved document state.')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('vertical', 'Vertical')
					.addOption('horizontal', 'Horizontal')
					.setValue(this.store.settings.defaultReadingFlow)
					.onChange((value) => {
						this.updateSetting({
							defaultReadingFlow:
								value as ReaderSettings['defaultReadingFlow'],
						});
					});
			});

		new Setting(containerEl)
			.setName('Auto-hide controls')
			.setDesc('Hide the reader overlay while reading.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.store.settings.autoHideControls)
					.onChange((value) => {
						this.updateSetting({ autoHideControls: value });
						this.display();
					});
			});

		if (this.store.settings.autoHideControls) {
			new Setting(containerEl)
				.setName('Auto-hide delay')
				.setDesc('Seconds before the reader controls fade out.')
				.addSlider((slider) => {
					slider
						.setLimits(1, 10, 0.5)
						.setDynamicTooltip()
						.setValue(this.store.settings.autoHideDelayMs / 1000)
						.onChange((seconds) => {
							this.updateSetting({
								autoHideDelayMs: seconds * 1000,
							});
						});
				});
		}

		this.addToggle(
			'Remember reading position',
			'Restore the page, page offset, and zoom mode for each PDF.',
			'rememberPosition',
		);
		this.addToggle(
			'Keyboard navigation',
			'Use arrow keys, Page Up, Page Down, Home, and End in PDF views.',
			'enableKeyboardNavigation',
		);
		this.addToggle(
			'Mobile tap zones',
			'Tap the left or right edge to change pages.',
			'enableTapZones',
		);
		this.addToggle(
			'Mobile swipe navigation',
			'Swipe horizontally to change pages when the PDF is not horizontally pannable.',
			'enableSwipeNavigation',
		);

		new Setting(containerEl).setName('Document state').setHeading();
		new Setting(containerEl)
			.setName('Saved PDF state')
			.setDesc(
				`${this.store.getDocumentStateCount()} document states are stored locally in the plugin data.`,
			)
			.addButton((button) => {
				button
					.setButtonText('Clear saved state')
					.setWarning()
					.onClick(() => {
						this.store.clearDocumentStates();
						this.display();
					});
			});
	}

	private addToggle(
		name: string,
		description: string,
		key:
			| 'rememberPosition'
			| 'enableKeyboardNavigation'
			| 'enableTapZones'
			| 'enableSwipeNavigation',
	): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addToggle((toggle) => {
				toggle.setValue(this.store.settings[key]).onChange((value) => {
					this.updateSetting({ [key]: value });
				});
			});
	}

	private updateSetting(patch: Partial<ReaderSettings>): void {
		this.store.updateSettings(patch);
		this.onSettingsChange();
	}
}
