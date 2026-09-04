import { Component, type Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	normalizeReaderSettings,
	type ReaderSettings,
} from './ReaderSettings';
import {
	normalizeDocumentReadingState,
	type DocumentReadingState,
} from './ReaderState';

interface PersistedReaderData {
	settings: ReaderSettings;
	documents: Record<string, DocumentReadingState>;
}

const SAVE_DEBOUNCE_MS = 600;

export class ReaderDataStore extends Component {
	private data: PersistedReaderData = {
		settings: { ...DEFAULT_SETTINGS },
		documents: {},
	};
	private saveTimer: number | null = null;
	private saveChain: Promise<void> = Promise.resolve();
	private unloading = false;

	constructor(private readonly plugin: Plugin) {
		super();
	}

	async loadPersistedData(): Promise<void> {
		const stored: unknown = await this.plugin.loadData();
		const source = isRecord(stored) ? stored : {};
		const documents: Record<string, DocumentReadingState> = {};
		if (isRecord(source.documents)) {
			for (const [path, value] of Object.entries(source.documents)) {
				const state = normalizeDocumentReadingState(value);
				if (state !== null) {
					documents[path] = state;
				}
			}
		}

		this.data = {
			settings: normalizeReaderSettings(source.settings),
			documents,
		};
	}

	get settings(): Readonly<ReaderSettings> {
		return this.data.settings;
	}

	updateSettings(patch: Partial<ReaderSettings>): void {
		this.data.settings = normalizeReaderSettings({
			...this.data.settings,
			...patch,
		});
		this.scheduleSave();
	}

	getDocumentState(path: string): DocumentReadingState | null {
		const state = this.data.documents[path];
		return state === undefined ? null : structuredClone(state);
	}

	updateDocumentState(path: string, state: DocumentReadingState): void {
		this.data.documents[path] = structuredClone(state);
		this.scheduleSave();
	}

	clearDocumentStates(): void {
		this.data.documents = {};
		this.scheduleSave();
	}

	getDocumentStateCount(): number {
		return Object.keys(this.data.documents).length;
	}

	async flush(): Promise<void> {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}

		const snapshot = structuredClone(this.data);
		this.saveChain = this.saveChain
			.catch(() => undefined)
			.then(() => this.plugin.saveData(snapshot));
		await this.saveChain;
	}

	override onunload(): void {
		this.unloading = true;
		this.flushWithoutThrow();
	}

	private scheduleSave(): void {
		if (this.unloading) {
			this.flushWithoutThrow();
			return;
		}
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			this.flushWithoutThrow();
		}, SAVE_DEBOUNCE_MS);
	}

	private flushWithoutThrow(): void {
		void this.flush().catch((error: unknown) => {
			console.error('PDF Reader: Failed to save reader data', error);
		});
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
