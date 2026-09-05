import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
	assessHorizontalLock,
	CdpClient,
	parseOptions,
	snapshotsAreStable,
	targetContextMatches,
} from './mobile-smoke.mjs';

describe('mobile smoke-test support', () => {
	it('accepts a null WebSocket send error from ws', async () => {
		const socket = new FakeSocket();
		const client = new CdpClient(socket);

		await expect(client.call('Runtime.enable')).resolves.toEqual({ ok: true });
	});

	it('accepts an unchanged horizontally locked viewport', () => {
		const before = snapshot({ scrollLeft: 142 });
		const after = snapshot({ scrollLeft: 143.5 });

		expect(assessHorizontalLock(before, after, 2)).toMatchObject({
			passed: true,
			drift: 1.5,
		});
	});

	it('rejects a stationary Fit Width view mislabeled as Fit Content', () => {
		const state = snapshot({ contentBounds: { left: 35, right: 332 } });
		expect(assessHorizontalLock(state, state, 2).checks.contentFitsViewport).toBe(false);
	});

	it('rejects content clipped by horizontal locking', () => {
		const state = snapshot({ contentBounds: { left: -20, right: 380 } });
		expect(assessHorizontalLock(state, state, 2).passed).toBe(false);
	});

	it('rejects drift or an unexpected page turn', () => {
		const before = snapshot({ page: 10, scrollLeft: 142 });
		const after = snapshot({ page: 11, scrollLeft: 149 });
		const result = assessHorizontalLock(before, after, 2);

		expect(result.passed).toBe(false);
		expect(result.checks.pageUnchanged).toBe(false);
		expect(result.checks.horizontalDriftWithinTolerance).toBe(false);
	});

	it('requires repeated layout samples to retain their geometry', () => {
		const baseline = snapshot({ scrollLeft: 142, pageWidth: 620 });

		expect(
			snapshotsAreStable(
				baseline,
				snapshot({ scrollLeft: 142.4, pageWidth: 620.4 }),
			),
		).toBe(true);
		expect(
			snapshotsAreStable(
				baseline,
				snapshot({ scrollLeft: 145, pageWidth: 620 }),
			),
		).toBe(false);
	});

	it('parses viewport and tolerance options', () => {
		expect(
			parseOptions([
				'--vault',
				'ai-use-development-research',
				'--file',
				'Content Log\\Books\\book.pdf',
				'--port',
				'9333',
				'--width',
				'412',
				'--height',
				'915',
				'--drift-tolerance',
				'1.5',
			]),
		).toMatchObject({
			vault: 'ai-use-development-research',
			file: 'Content Log/Books/book.pdf',
			port: 9333,
			width: 412,
			height: 915,
			driftTolerance: 1.5,
		});
	});

	it('matches both the vault and the normalized active file path', () => {
		expect(
			targetContextMatches(
				{
					vault: 'ai-use-development-research',
					file: 'Content Log/Books/book.pdf',
				},
				'ai-use-development-research',
				'Content Log\\Books\\book.pdf',
			),
		).toBe(true);
		expect(
			targetContextMatches(
				{ vault: 'another-vault', file: 'Content Log/Books/book.pdf' },
				'ai-use-development-research',
				'Content Log/Books/book.pdf',
			),
		).toBe(false);
	});
});

class FakeSocket extends EventEmitter {
	send(message, callback) {
		const request = JSON.parse(message);
		callback(null);
		queueMicrotask(() => {
			this.emit(
				'message',
				JSON.stringify({ id: request.id, result: { ok: true } }),
			);
		});
	}

	close() {}
}

function snapshot(overrides = {}) {
	return {
		page: 10,
		fitContent: true,
		mobileClass: true,
		scrollLeft: 142,
		scrollTop: 640,
		pageWidth: 620,
		clientWidth: 390,
		contentBounds: { left: 18, right: 372 },
		...overrides,
	};
}
