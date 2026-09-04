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
  links, native controls, pinch zoom, and horizontal panning take priority.
- Debounced per-document page, page-offset, zoom-mode, and crop-profile state.
- Standard Obsidian links to a PDF or its current `#page=N` subpath.
- Native Fit Page and Fit Width modes.
- Lazy Fit Content / Smart Crop based on downsampled pixels from canvases that
  the native viewer has already rendered. Profiles are bounded and maintained
  separately for odd and even pages.

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
6. Repeat the mobile checks in portrait and landscape and verify pinch zoom and
   horizontal panning still take priority over swipe navigation.
