import { App, Component, type WorkspaceLeaf } from 'obsidian';
import { ObsidianPdfAdapter } from '../pdf/ObsidianPdfAdapter';
import { ReaderController } from '../reader/ReaderController';
import type { ReaderDataStore } from '../reader/ReaderDataStore';
import { getExplicitPdfPage, getPdfFile } from './LinkIntegration';

const PDF_VIEW_TYPE = 'pdf';

export class WorkspaceController extends Component {
	private readonly readers = new Map<WorkspaceLeaf, ReaderController>();
	private active = false;

	constructor(
		private readonly app: App,
		private readonly store: ReaderDataStore,
	) {
		super();
	}

	override onload(): void {
		this.active = true;
		this.registerEvent(
			this.app.workspace.on('layout-change', () => this.syncReaders()),
		);
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				void this.handleActiveLeafChange(leaf);
			}),
		);
		this.registerEvent(
			this.app.workspace.on('file-open', () => this.syncReaders()),
		);
		this.registerEvent(
			this.app.workspace.on('resize', () => this.handleResize()),
		);
		this.register(() => {
			this.active = false;
			this.detachAll();
		});

		this.syncReaders();
	}

	getActiveReader(): ReaderController | null {
		const leaf = this.app.workspace.getMostRecentLeaf();
		if (leaf === null || leaf.view.getViewType() !== PDF_VIEW_TYPE) {
			return null;
		}

		return this.ensureReader(leaf);
	}

	refreshSettings(): void {
		for (const reader of this.readers.values()) {
			reader.refreshSettings();
		}
	}

	private syncReaders(): void {
		const pdfLeaves = new Set(
			this.app.workspace.getLeavesOfType(PDF_VIEW_TYPE),
		);

		for (const leaf of pdfLeaves) {
			this.ensureReader(leaf);
		}

		for (const [leaf, reader] of this.readers) {
			if (!pdfLeaves.has(leaf)) {
				reader.detach();
				this.readers.delete(leaf);
			}
		}
	}

	private ensureReader(leaf: WorkspaceLeaf): ReaderController | null {
		const file = getPdfFile(leaf);
		const existingReader = this.readers.get(leaf);
		if (file === null) {
			existingReader?.detach();
			this.readers.delete(leaf);
			return null;
		}
		if (
			existingReader !== undefined &&
			existingReader.isAttachedToCurrentView() &&
			existingReader.documentPath === file.path
		) {
			return existingReader;
		}
		existingReader?.detach();

		const reader = new ReaderController(
			leaf,
			new ObsidianPdfAdapter(leaf),
			file.path,
			() => getExplicitPdfPage(leaf),
			this.store,
		);
		this.readers.set(leaf, reader);
		reader.attach();
		return reader;
	}

	private handleResize(): void {
		for (const reader of this.readers.values()) {
			reader.handleResize();
		}
	}

	private async handleActiveLeafChange(
		leaf: WorkspaceLeaf | null,
	): Promise<void> {
		try {
			if (
				leaf?.isDeferred === true &&
				leaf.getViewState().type === PDF_VIEW_TYPE
			) {
				await leaf.loadIfDeferred();
			}
		} catch (error) {
			console.debug('PDF Reader: Deferred view could not be loaded', error);
		}

		if (this.active) {
			this.syncReaders();
		}
	}

	private detachAll(): void {
		for (const reader of this.readers.values()) {
			reader.detach();
		}
		this.readers.clear();
	}
}
