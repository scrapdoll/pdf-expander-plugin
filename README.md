# PDF Reader

PDF Reader adds a focused reading experience to Obsidian's native PDF viewer.
It does not replace the renderer, modify PDF files, or use a separate database.

## Features

- Independent reader state for every open PDF leaf, including splits and
  pop-out windows.
- Auto-hiding page indicator and touch-friendly page scrubber.
- Focus mode that hides native PDF chrome without changing workspace tabs or
  navigation history.
- Keyboard navigation with arrow keys, Page Up, Page Down, Home, and End.
- Mobile tap zones and conflict-aware horizontal swipes. Text selection,
  links, native controls, and pinch zoom take priority; Fit Content locks
  horizontal panning so the page stays fixed while reading.
- Debounced per-document page, page-offset, zoom-mode, and crop-profile state.
- Standard Obsidian links to a PDF or its current `#page=N` subpath.
- Native Fit Page and Fit Width modes.
- Lazy Fit Content / Smart Crop based on downsampled pixels from canvases that
  the native viewer has already rendered. Current-page bounds take priority;
  bounded odd/even profiles provide an initial estimate while rendering finishes.
  Slow pages are retried, and horizontal alignment preserves vertical reading position.

If page pixels or private PDF.js zoom controls are unavailable, Fit Content
gracefully falls back to Fit Width and normal PDF reading remains available.

## Architecture

- `WorkspaceController` discovers native `pdf` leaves through the public
  Workspace API and owns `Map<WorkspaceLeaf, ReaderController>`.
- `ReaderController` coordinates features for exactly one PDF leaf.
- Reader features depend on `PdfViewerAdapter`. All native PDF selectors,
  PDF.js fields, and the guarded private path used by Obsidian 1.13 are isolated
  in `ObsidianPdfAdapter`.
- Navigation, auto-hide, position restore, zoom, and Smart Crop are separate
  feature modules.
- `ReaderDataStore` normalizes untrusted plugin data and persists it with
  `loadData()` / `saveData()` using a debounce.

## Commands

- **Next page**
- **Previous page**
- **Toggle reader controls**
- **Toggle focus mode**
- **Use native zoom**
- **Fit page**
- **Fit width**
- **Fit content**
- **Copy link to current page**
- **Copy link to PDF**

## Development

```bash
npm install
npm test
npm run build
npm run lint
```

The production build writes `main.js` at the plugin root. Reload Obsidian after
building and enable **PDF Reader** under **Settings → Community plugins**.

### Desktop mobile smoke test

The smoke test drives the real desktop Obsidian PDF viewer through the local
Chromium debugging protocol. It enables Obsidian's mobile mode, applies a
390x844 touch viewport, selects **Fit content**, performs a short horizontal
touch movement, and verifies that the page and horizontal reading position do
not change. It also measures painted content and rejects large leftover margins
or horizontal clipping. Desktop emulation does not replace acceptance on iOS.

Close Obsidian, start it from PowerShell with a local debugging port, and open
a PDF in the active tab:

```powershell
Start-Process -FilePath "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe" `
	-ArgumentList "--remote-debugging-address=127.0.0.1", `
		"--remote-debugging-port=9222"
```

Then run with the expected vault and active PDF path:

```powershell
npm.cmd run test:mobile -- `
	--vault "ai-use-development-research" `
	--file "Content Log/Books/Грокаем алгоритмы/Grokaem_algoritmy_2.pdf"
```

Screenshots plus JSON and HTML reports are written under
`test-results/mobile-smoke/`. The script restores normal desktop metrics and
disables mobile emulation before disconnecting. Keep the debugging port local
and close the test instance when it is no longer needed. The script stops
without sending touch input if the connected vault or active file differs from
the requested target.

Optional viewport and drift settings can be inspected with:

```bash
npm run test:mobile -- --help
```

## Release

Keep the version in `package.json`, `manifest.json`, and `versions.json` in sync,
then push a tag with that exact semantic version and no `v` prefix. For example:

```bash
git tag -a 1.0.1 -m "1.0.1"
git push origin 1.0.1
```

GitHub Actions runs tests, lint, and the production build, verifies the release
metadata, attests the build outputs, and publishes a release with `main.js`,
`manifest.json`, and `styles.css` as individual assets.

## Manual acceptance

After reloading Obsidian:

1. Open two PDFs in separate tabs or split panes and confirm both overlays
   update independently.
2. Exercise the scrubber, commands, keyboard navigation, tap zones, and swipe
   navigation while also checking text selection and PDF links.
3. Test Fit Page, Fit Width, and Fit Content on PDFs with normal, mirrored
   odd/even, and unusually large margins.
4. Open `[[Book.pdf#page=137]]` and confirm the explicit page wins over a saved
   position.
5. Close one PDF leaf and disable the plugin; confirm injected controls and
   focus-mode classes are removed.
6. Repeat the mobile checks in portrait and landscape. Verify pinch zoom and
   vertical scrolling in Fit Content, and verify horizontal swipes navigate
   pages without horizontal drift.
