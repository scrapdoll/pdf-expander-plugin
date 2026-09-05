import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import WebSocket from 'ws';

const DEFAULT_PORT = 9222;
const DEFAULT_WIDTH = 390;
const DEFAULT_HEIGHT = 844;
const DEFAULT_DRIFT_TOLERANCE = 2;
const COMMAND_ID = 'pdf-plugin-expander:fit-content';
const CONNECTION_TIMEOUT_MS = 2_000;
const CDP_CALL_TIMEOUT_MS = 5_000;
const VIEW_TIMEOUT_MS = 10_000;

export class CdpClient {
	constructor(socket) {
		this.socket = socket;
		this.nextId = 1;
		this.pending = new Map();
		this.socket.on('message', (data) => this.handleMessage(data));
		this.socket.on('close', () => {
			this.rejectPending(new Error('Obsidian closed the debugging connection'));
		});
		this.socket.on('error', (error) => this.rejectPending(error));
	}

	static async connect(webSocketDebuggerUrl) {
		const socket = new WebSocket(webSocketDebuggerUrl);
		await new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				socket.terminate();
				reject(new Error('Timed out while connecting to Obsidian'));
			}, CONNECTION_TIMEOUT_MS);
			socket.once('open', () => {
				clearTimeout(timer);
				resolve();
			});
			socket.once('error', (error) => {
				clearTimeout(timer);
				reject(error);
			});
		});
		return new CdpClient(socket);
	}

	call(method, params = {}) {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`${method} timed out`));
			}, CDP_CALL_TIMEOUT_MS);
			this.pending.set(id, { resolve, reject, timer });
			this.socket.send(JSON.stringify({ id, method, params }), (error) => {
				if (error != null) {
					this.pending.delete(id);
					clearTimeout(timer);
					reject(error);
				}
			});
		});
	}

	async evaluate(expression) {
		const response = await this.call('Runtime.evaluate', {
			expression,
			awaitPromise: true,
			returnByValue: true,
		});
		if (response.exceptionDetails !== undefined) {
			throw new Error(
				response.exceptionDetails.exception?.description ??
					response.exceptionDetails.text ??
					'Obsidian evaluation failed',
			);
		}
		return response.result?.value;
	}

	close() {
		this.socket.close();
	}

	handleMessage(data) {
		let message;
		try {
			message = JSON.parse(data.toString());
		} catch {
			return;
		}
		if (typeof message.id !== 'number') {
			return;
		}
		const pending = this.pending.get(message.id);
		if (pending === undefined) {
			return;
		}
		this.pending.delete(message.id);
		clearTimeout(pending.timer);
		if (message.error !== undefined) {
			pending.reject(
				new Error(`${message.error.message} (${message.error.code})`),
			);
		} else {
			pending.resolve(message.result ?? {});
		}
	}

	rejectPending(error) {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}
}

export function parseOptions(args) {
	const options = {
		port: DEFAULT_PORT,
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
		driftTolerance: DEFAULT_DRIFT_TOLERANCE,
		resultsRoot: path.resolve('test-results', 'mobile-smoke'),
		vault: null,
		file: null,
		help: false,
	};

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--help' || argument === '-h') {
			options.help = true;
			continue;
		}
		const value = args[index + 1];
		if (value === undefined) {
			throw new Error(`Missing value for ${argument}`);
		}
		switch (argument) {
			case '--port':
				options.port = positiveInteger(value, argument, 65_535);
				break;
			case '--width':
				options.width = positiveInteger(value, argument, 4_096);
				break;
			case '--height':
				options.height = positiveInteger(value, argument, 4_096);
				break;
			case '--drift-tolerance':
				options.driftTolerance = nonNegativeNumber(value, argument);
				break;
			case '--results':
				options.resultsRoot = path.resolve(value);
				break;
			case '--vault':
				options.vault = nonEmptyString(value, argument);
				break;
			case '--file':
				options.file = normalizeVaultPath(nonEmptyString(value, argument));
				break;
			default:
				throw new Error(`Unknown option: ${argument}`);
		}
		index += 1;
	}
	if (!options.help && (options.vault === null || options.file === null)) {
		throw new Error('--vault and --file are required for a safe mobile test');
	}

	return options;
}

export function targetContextMatches(context, expectedVault, expectedFile) {
	return (
		context.vault === expectedVault &&
		normalizeVaultPath(context.file ?? '') === normalizeVaultPath(expectedFile)
	);
}

export function assessHorizontalLock(before, after, driftTolerance) {
	const drift = Math.abs(after.scrollLeft - before.scrollLeft);
	const checks = {
		fitContentEnabled: before.fitContent && after.fitContent,
		mobileClassPresent: before.mobileClass && after.mobileClass,
		pageUnchanged: before.page === after.page,
		horizontalDriftWithinTolerance: drift <= driftTolerance,
		contentFitsViewport: [before, after].every((snapshot) =>
			snapshot.contentBounds !== null &&
			snapshot.contentBounds !== undefined &&
			snapshot.contentBounds.right - snapshot.contentBounds.left >= snapshot.clientWidth * 0.85 &&
			snapshot.contentBounds.left >= -2 &&
			snapshot.contentBounds.right <= snapshot.clientWidth + 2,
		),
	};
	return {
		passed: Object.values(checks).every(Boolean),
		drift,
		checks,
	};
}

export function snapshotsAreStable(previous, current) {
	return (
		previous.page === current.page &&
		Math.abs(previous.scrollLeft - current.scrollLeft) <= 0.5 &&
		Math.abs(previous.scrollTop - current.scrollTop) <= 0.5 &&
		Math.abs(previous.pageWidth - current.pageWidth) <= 0.5 &&
		previous.clientWidth === current.clientWidth &&
		previous.fitContent === current.fitContent
	);
}

export function assessVerticalScroll(before, after, driftTolerance) {
	const assessment = assessHorizontalLock(before, after, driftTolerance);
	const verticalDistance = Math.abs(after.scrollTop - before.scrollTop);
	const checks = {
		...assessment.checks,
		verticalScrollWorked: verticalDistance >= 24,
		scaleUnchanged: Math.abs(after.pageWidth - before.pageWidth) <= 2,
	};
	return {
		passed: Object.values(checks).every(Boolean),
		drift: assessment.drift,
		verticalDistance,
		checks,
	};
}

export async function runMobileSmoke(options) {
	const outputDirectory = path.join(
		options.resultsRoot,
		new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-'),
	);
	await mkdir(outputDirectory, { recursive: true });

	let client;
	let cleanupNeeded = false;
	try {
		const target = await connectToRequestedObsidianTarget(options);
		client = target.client;
		console.log(`Connected to ${target.context.vault}: ${target.context.file}`);
		await client.call('Page.enable');
		await client.call('Page.bringToFront');
		await client.call('Emulation.setFocusEmulationEnabled', { enabled: true });
		await client.call('Emulation.setDeviceMetricsOverride', {
			width: options.width,
			height: options.height,
			deviceScaleFactor: 1,
			mobile: true,
			screenWidth: options.width,
			screenHeight: options.height,
		});
		cleanupNeeded = true;
		await client.call('Emulation.setTouchEmulationEnabled', {
			enabled: true,
			maxTouchPoints: 2,
		});

		const mobileResult = await client.evaluate(`(() => {
			if (typeof globalThis.app?.emulateMobile !== 'function') {
				return { ok: false, reason: 'Obsidian mobile emulation is unavailable' };
			}
			globalThis.app.emulateMobile(true);
			return { ok: true };
		})()`);
		if (mobileResult?.ok !== true) {
			throw new Error(mobileResult?.reason ?? 'Could not enable mobile mode');
		}
		console.log(`Mobile viewport enabled: ${options.width}x${options.height}`);

		await openRequestedPdf(client, options.file);
		await waitForSnapshot(client, (snapshot) => snapshot.ready);
		console.log('Requested PDF opened in the mobile workspace');
		const commandExecuted = await client.evaluate(
			`Boolean(globalThis.app?.commands?.executeCommandById('${COMMAND_ID}'))`,
		);
		if (!commandExecuted) {
			throw new Error(
				'Fit Content command is unavailable. Open a PDF and enable the plugin.',
			);
		}
		await navigateToPage(client, target.context.expectedPage);

		await waitForSnapshot(
			client,
			(snapshot) =>
				snapshot.fitContent &&
				snapshot.page === target.context.expectedPage &&
				snapshot.rendered,
		);
		const before = await waitForStableSnapshot(client);
		await captureScreenshot(client, path.join(outputDirectory, 'before.png'));
		console.log(`Fit Content stable at scrollLeft=${before.scrollLeft.toFixed(2)}`);

		console.log('Dispatching a 36 px horizontal touch movement');
		await dispatchHorizontalTouch(client, before.containerRect);
		await delay(300);
		const after = await waitForStableSnapshot(client);
		await captureScreenshot(client, path.join(outputDirectory, 'after.png'));
		console.log(`Post-touch scrollLeft=${after.scrollLeft.toFixed(2)}`);

		const assessment = assessHorizontalLock(
			before,
			after,
			options.driftTolerance,
		);
		console.log('Checking vertical touch scrolling and horizontal anchoring');
		await dispatchVerticalTouch(client, after);
		const afterVertical = await waitForStableSnapshot(client);
		await captureScreenshot(client, path.join(outputDirectory, 'after-vertical.png'));
		const verticalScroll = assessVerticalScroll(after, afterVertical, options.driftTolerance);
		const report = {
			scenario: 'Fit Content horizontal lock',
			target: target.context,
			viewport: { width: options.width, height: options.height },
			driftTolerance: options.driftTolerance,
			...assessment,
			passed: assessment.passed && verticalScroll.passed,
			verticalScroll: { ...verticalScroll, before: after, after: afterVertical },
			before,
			after,
		};
		await writeReport(outputDirectory, report);
		return { ...report, outputDirectory };
	} catch (error) {
		const report = {
			scenario: 'Fit Content horizontal lock',
			passed: false,
			error: error instanceof Error ? error.message : String(error),
		};
		await writeReport(outputDirectory, report);
		return { ...report, outputDirectory };
	} finally {
		if (client !== undefined) {
			if (cleanupNeeded) {
				await cleanupEmulation(client).catch(() => undefined);
			}
			client.close();
		}
	}
}

async function connectToRequestedObsidianTarget(options) {
	let response;
	try {
		response = await fetch(`http://127.0.0.1:${options.port}/json/list`, {
			signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
		});
	} catch (error) {
		throw new Error(
			`Cannot connect to Obsidian on port ${options.port}. Close Obsidian, then start it with --remote-debugging-port=${options.port}.`,
			{ cause: error },
		);
	}
	if (!response.ok) {
		throw new Error(`Obsidian debugging endpoint returned ${response.status}`);
	}
	const targets = await response.json();
	const candidates = targets.filter(
		(candidate) =>
			candidate.type === 'page' &&
			typeof candidate.webSocketDebuggerUrl === 'string' &&
			(candidate.url?.startsWith('app://obsidian.md') ||
				candidate.title?.includes('Obsidian')),
	);
	if (candidates.length === 0) {
		throw new Error('No Obsidian window was found on the debugging port');
	}

	const availableContexts = [];
	for (const candidate of candidates) {
		const client = await CdpClient.connect(candidate.webSocketDebuggerUrl);
		try {
			await client.call('Runtime.enable');
			const context = await readObsidianContext(client);
			availableContexts.push(context);
			if (targetContextMatches(context, options.vault, options.file)) {
				return { client, context };
			}
		} catch (error) {
			availableContexts.push({
				title: candidate.title ?? null,
				error: error instanceof Error ? error.message : String(error),
			});
		}
		client.close();
	}

	throw new Error(
		`Expected vault "${options.vault}" with active file "${options.file}". Available targets: ${JSON.stringify(availableContexts)}`,
	);
}

async function readObsidianContext(client) {
	return client.evaluate(`(async () => {
		const file = globalThis.app?.workspace?.getActiveFile?.()?.path ?? null;
		const plugin = globalThis.app?.plugins?.plugins?.['pdf-plugin-expander'];
		const data = await plugin?.loadData?.();
		const savedPage = data?.settings?.rememberPosition === false
			? null
			: data?.documents?.[file]?.page;
		return {
			vault: globalThis.app?.vault?.getName?.() ?? null,
			file,
			expectedPage: Number.isFinite(savedPage) ? savedPage : 1,
		};
	})()`);
}

async function openRequestedPdf(client, filePath) {
	const encodedPath = JSON.stringify(filePath);
	const deadline = Date.now() + VIEW_TIMEOUT_MS;
	let result;
	do {
		result = await client.evaluate(`(async () => {
			const file = globalThis.app?.vault?.getAbstractFileByPath?.(${encodedPath});
			if (file?.extension?.toLowerCase?.() !== 'pdf') {
				return { ok: false, retryable: true, reason: 'The requested PDF was not found in the vault' };
			}
			const leaf = globalThis.app?.workspace?.getLeaf?.(false);
			if (leaf === undefined) {
				return { ok: false, retryable: true, reason: 'Obsidian did not provide a mobile workspace leaf' };
			}
			void Promise.resolve(leaf.openFile(file)).catch((error) => {
				console.error('PDF Reader mobile smoke: openFile failed', error);
			});
			return { ok: true, file: file.path };
		})()`);
		if (result?.ok === true && result.file === filePath) {
			return;
		}
		if (result?.retryable !== true) {
			break;
		}
		await delay(100);
	} while (Date.now() < deadline);
	if (result?.ok !== true || result.file !== filePath) {
		throw new Error(
			result?.reason ?? 'Could not open the requested PDF in mobile mode',
		);
	}
}

async function navigateToPage(client, page) {
	const result = await client.evaluate(`(() => {
		const leaf = globalThis.app?.workspace?.getMostRecentLeaf?.();
		const candidates = [
			leaf?.view?.viewer?.child?.pdfViewer?.pdfViewer,
			leaf?.view?.viewer?.child?.pdfViewer,
			leaf?.view?.viewer?.pdfViewer,
			leaf?.view?.pdfViewer,
		];
		const viewer = candidates.find(
			(candidate) =>
				candidate !== undefined &&
				candidate !== null &&
				('currentPageNumber' in candidate ||
					typeof candidate.scrollPageIntoView === 'function'),
		);
		if (viewer !== undefined && viewer !== null && 'currentPageNumber' in viewer) {
			viewer.currentPageNumber = ${page};
			viewer.scrollPageIntoView?.({ pageNumber: ${page} });
			viewer.update?.();
			return { ok: true };
		}
		if (typeof viewer?.scrollPageIntoView === 'function') {
			viewer.scrollPageIntoView({ pageNumber: ${page} });
			return { ok: true };
		}
		const eventBusOwner = candidates.find(
			(candidate) => typeof candidate?.eventBus?.dispatch === 'function',
		);
		if (typeof eventBusOwner?.eventBus?.dispatch === 'function') {
			eventBusOwner.eventBus.dispatch('pagenumberchanged', {
				source: 'pdf-reader-mobile-smoke',
				value: String(${page}),
			});
			return { ok: true };
		}
		return { ok: false, reason: 'The native PDF viewer is unavailable' };
	})()`);
	if (result?.ok !== true) {
		throw new Error(result?.reason ?? `Could not navigate to page ${page}`);
	}
}

async function waitForSnapshot(client, predicate, timeoutMs = VIEW_TIMEOUT_MS) {
	const deadline = Date.now() + timeoutMs;
	let snapshot;
	do {
		snapshot = await readSnapshot(client);
		if (predicate(snapshot)) {
			return snapshot;
		}
		await delay(100);
	} while (Date.now() < deadline);
	throw new Error(
		snapshot?.reason ??
			`Timed out waiting for the active PDF view: ${JSON.stringify(snapshot)}`,
	);
}

async function waitForStableSnapshot(client) {
	const deadline = Date.now() + VIEW_TIMEOUT_MS;
	let previous = await waitForSnapshot(client, (snapshot) => snapshot.ready);
	let stableFrames = 0;
	while (Date.now() < deadline) {
		await delay(120);
		const current = await readSnapshot(client);
		if (current.ready && snapshotsAreStable(previous, current)) {
			stableFrames += 1;
			if (stableFrames >= 16) {
				return current;
			}
		} else {
			stableFrames = 0;
		}
		previous = current;
	}
	throw new Error('The PDF view did not reach a stable layout');
}

async function readSnapshot(client) {
	return client.evaluate(`(() => {
		const roots = Array.from(document.querySelectorAll('.pdf-reader-enhanced'));
		const root = roots.find((element) => element.closest('.workspace-leaf.mod-active')) ?? roots[0];
		if (!(root instanceof HTMLElement)) {
			return { ready: false, reason: 'Open a PDF in the active Obsidian tab' };
		}
		const container = root.querySelector('.pdf-viewer-container');
		if (!(container instanceof HTMLElement)) {
			return { ready: false, reason: 'The native PDF viewer is still loading' };
		}
		const pageElements = Array.from(root.querySelectorAll('.page[data-page-number]'));
		const containerRect = container.getBoundingClientRect();
		let pageElement;
		let visibleArea = 0;
		for (const candidate of pageElements) {
			const candidateRect = candidate.getBoundingClientRect();
			const overlapWidth = Math.max(
				0,
				Math.min(candidateRect.right, containerRect.right) -
					Math.max(candidateRect.left, containerRect.left),
			);
			const overlapHeight = Math.max(
				0,
				Math.min(candidateRect.bottom, containerRect.bottom) -
					Math.max(candidateRect.top, containerRect.top),
			);
			const area = overlapWidth * overlapHeight;
			if (area > visibleArea) {
				pageElement = candidate;
				visibleArea = area;
			}
		}
		const page = Number.parseInt(pageElement?.dataset.pageNumber ?? '', 10);
		const pageRect = pageElement?.getBoundingClientRect();
		const canvas = pageElement?.querySelector('canvas');
		const contentBounds = (${measureContentBounds.toString()})(canvas, container);
		return {
			contentBounds,
			ready: Number.isFinite(page) && pageRect !== undefined && containerRect.width > 0 && containerRect.height > 0,
			rendered:
				canvas instanceof HTMLCanvasElement &&
				canvas.width > 0 &&
				canvas.height > 0,
			page,
			fitContent: root.classList.contains('pdf-reader-fit-content'),
			mobileClass: document.body.classList.contains('is-mobile') || document.body.classList.contains('is-phone'),
			scrollLeft: container.scrollLeft,
			scrollTop: container.scrollTop,
			scrollWidth: container.scrollWidth,
			clientWidth: container.clientWidth,
			pageWidth: pageRect?.width ?? 0,
			pageTop: pageRect?.top ?? 0,
			containerRect: {
				left: containerRect.left,
				top: containerRect.top,
				width: containerRect.width,
				height: containerRect.height,
			},
		};
	})()`);
}

// Runs inside the viewer. Measure painted pixels, not the mode label.
function measureContentBounds(source, container) {
	if (!(source instanceof HTMLCanvasElement) || !source.width || !source.height) return null;
	try {
		const canvas = document.createElement('canvas');
		const scale = Math.min(1, 384 / Math.max(source.width, source.height));
		canvas.width = Math.max(1, Math.round(source.width * scale));
		canvas.height = Math.max(1, Math.round(source.height * scale));
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (context === null) return null;
		context.fillStyle = 'white';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.drawImage(source, 0, 0, canvas.width, canvas.height);
		const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
		const corners = [
			(2 * canvas.width + 2) * 4,
			(3 * canvas.width - 3) * 4,
			((canvas.height - 3) * canvas.width + 2) * 4,
			((canvas.height - 2) * canvas.width - 3) * 4,
		];
		const background = [0, 1, 2].map((channel) =>
			corners.reduce((sum, index) => sum + data[index + channel], 0) / 4,
		);
		let first = canvas.width;
		let last = -1;
		for (let x = 0; x < canvas.width; x++) {
			let ink = 0;
			for (let y = 0; y < canvas.height; y++) {
				const index = (y * canvas.width + x) * 4;
				if (background.some((color, channel) => Math.abs(data[index + channel] - color) >= 24)) ink++;
			}
			if (ink >= 2) {
				first = Math.min(first, x);
				last = x;
			}
		}
		if (last < first) return null;
		const rect = source.getBoundingClientRect();
		const origin = container.getBoundingClientRect().left + container.clientLeft;
		return {
			left: rect.left - origin + first / canvas.width * rect.width,
			right: rect.left - origin + (last + 1) / canvas.width * rect.width,
		};
	} catch {
		return null;
	}
}

async function dispatchHorizontalTouch(client, rect) {
	const startX = rect.left + rect.width * 0.6;
	const y = rect.top + rect.height * 0.5;
	await client.call('Input.synthesizeScrollGesture', {
		x: startX,
		y,
		xDistance: -36,
		yDistance: 0,
		speed: 300,
		gestureSourceType: 'touch',
		preventFling: true,
	});
}

async function dispatchVerticalTouch(client, snapshot) {
	const rect = snapshot.containerRect;
	await client.call('Input.synthesizeScrollGesture', {
		x: rect.left + rect.width * 0.5,
		y: rect.top + rect.height * 0.5,
		xDistance: 0,
		yDistance: snapshot.pageTop < rect.top - 100 ? 80 : -80,
		speed: 200,
		gestureSourceType: 'touch',
		preventFling: false,
	});
}

async function captureScreenshot(client, filePath) {
	const result = await client.call('Page.captureScreenshot', {
		format: 'png',
		fromSurface: true,
	});
	await writeFile(filePath, Buffer.from(result.data, 'base64'));
}

async function cleanupEmulation(client) {
	await client.evaluate(
		`globalThis.app?.emulateMobile?.(false); true`,
	);
	await client.call('Emulation.setFocusEmulationEnabled', { enabled: false });
	await client.call('Emulation.setTouchEmulationEnabled', { enabled: false });
	await client.call('Emulation.clearDeviceMetricsOverride');
}

async function writeReport(outputDirectory, report) {
	await writeFile(
		path.join(outputDirectory, 'report.json'),
		`${JSON.stringify(report, null, 2)}\n`,
		'utf8',
	);
	const status = report.passed ? 'PASS' : 'FAIL';
	const details = report.error ??
		`Horizontal drift: ${report.drift.toFixed(2)} px (limit ${report.driftTolerance} px)`;
	const html = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>PDF Reader mobile smoke test</title>
	<style>
		body { max-width: 760px; margin: 40px auto; padding: 0 20px; font: 16px/1.5 system-ui, sans-serif; color: #202124; }
		.status { display: inline-block; padding: 6px 12px; border-radius: 999px; color: white; background: ${report.passed ? '#16833b' : '#b3261e'}; font-weight: 700; }
		pre { overflow: auto; padding: 16px; background: #f5f5f5; border-radius: 8px; }
	</style>
</head>
<body>
	<h1>Fit Content horizontal lock</h1>
	<p class="status">${status}</p>
	<p>${escapeHtml(details)}</p>
	<pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre>
</body>
</html>\n`;
	await writeFile(path.join(outputDirectory, 'report.html'), html, 'utf8');
}

function positiveInteger(value, option, maximum) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
		throw new Error(`${option} must be an integer between 1 and ${maximum}`);
	}
	return parsed;
}

function nonNegativeNumber(value, option) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`${option} must be a non-negative number`);
	}
	return parsed;
}

function nonEmptyString(value, option) {
	const parsed = value.trim();
	if (parsed === '') {
		throw new Error(`${option} must not be empty`);
	}
	return parsed;
}

function normalizeVaultPath(value) {
	return value.replaceAll('\\', '/').replace(/^\/+/, '');
}

function escapeHtml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function printHelp() {
	console.log(`Usage: npm run test:mobile -- [options]

The active Obsidian window must contain an open PDF and must be started with:
  Obsidian.exe --remote-debugging-port=9222

Options:
	--vault <name>              Expected vault name (required)
	--file <vault path>         Expected active PDF path (required)
	--port <number>             Debugging port (default: ${DEFAULT_PORT})
  --width <pixels>            Emulated viewport width (default: ${DEFAULT_WIDTH})
  --height <pixels>           Emulated viewport height (default: ${DEFAULT_HEIGHT})
  --drift-tolerance <pixels>  Allowed horizontal drift (default: ${DEFAULT_DRIFT_TOLERANCE})
  --results <directory>       Evidence output directory
  --help                      Show this help`);
}

async function main() {
	let options;
	try {
		options = parseOptions(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 2;
		return;
	}
	if (options.help) {
		printHelp();
		return;
	}

	const report = await runMobileSmoke(options);
	const status = report.passed ? 'PASS' : 'FAIL';
	console.log(`${status}: ${report.scenario}`);
	if (report.error !== undefined) {
		console.error(report.error);
	} else {
		console.log(
			`Horizontal drift: ${report.drift.toFixed(2)} px (limit ${report.driftTolerance} px)`,
		);
	}
	console.log(`Evidence: ${report.outputDirectory}`);
	process.exitCode = report.passed ? 0 : 1;
}

const isMain =
	process.argv[1] !== undefined &&
	pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
	await main();
}
