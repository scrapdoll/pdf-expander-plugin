import { readFile } from 'node:fs/promises';

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (tag === undefined || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
	throw new Error(`Release tag must be a semantic version without a v prefix; received: ${tag ?? 'nothing'}`);
}

const [manifest, packageJson, versions] = await Promise.all(
	['manifest.json', 'package.json', 'versions.json'].map(async (path) =>
		JSON.parse(await readFile(path, 'utf8')),
	),
);

if (manifest.version !== tag) {
	throw new Error(
		`Tag ${tag} does not match manifest.json version ${String(manifest.version)}`,
	);
}

if (packageJson.version !== tag) {
	throw new Error(
		`Tag ${tag} does not match package.json version ${String(packageJson.version)}`,
	);
}

if (versions[tag] !== manifest.minAppVersion) {
	throw new Error(
		`versions.json must map ${tag} to minAppVersion ${String(manifest.minAppVersion)}`,
	);
}
