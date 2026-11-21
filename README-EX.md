# ALCOM-Ex

ALCOM-Ex is a fork of [ALCOM (vrc-get GUI)](https://github.com/vrc-get/vrc-get)
that adds extra features. Base version: ALCOM `1.2.0-beta.2`, EX version
`0.1.0`, displayed as **`1.2.0-beta.2-@Ex 0.1.0`**.

## Added features

1. **Per-package exclusion of dependency changes** — In the package change
   confirmation dialog, every dependency-driven change (an upgrade,
   downgrade, install or removal caused by another package's dependencies)
   has an "Exclude this change" checkbox. Excluded packages stay exactly as
   they are. If an exclusion would break a package that is still being
   installed, applying stops and shows the reasons.
2. **Collapsible dependency details** — Each change in the confirmation
   dialog can be expanded to show the packages it depends on, the required
   version ranges, and the versions they resolve to.
3. **Terminal page** — A sidebar entry with a terminal that runs shell
   commands with the selected Unity project folder as the working
   directory, so the vrc-get CLI and other project tooling can be driven
   directly from the GUI. For safety the working directory is restricted
   to Unity project folders (enforced on the Rust side too).
4. **UPM repositories tab** — Under "Packages & Templates", a tab that
   manages Unity Package Manager packages by editing the project's
   `Packages/manifest.json`: Git packages (including `#tag` / `#branch`
   revisions and `?path=` subfolders), versioned dependencies, and scoped
   registries. Registries can also be saved in the EX settings and applied
   to any project. This is independent from VPM repositories.
5. **Sidebar compact toggle** — A button above the version info at the
   bottom of the sidebar toggles the compact UI (the existing `gui_compact`
   setting).
6. **Extended theme settings** — In Settings → Appearance: corner radius
   slider, background gradient start/end colors, and an accent color that
   recolors the primary color scheme.
7. **Orange icon** — The app icon's green parts are recolored orange.

## Coexistence with stock ALCOM

ALCOM-Ex is designed to be installed next to stock ALCOM without ever
breaking it:

- Product name `ALCOM-Ex`, Tauri identifier `com.anatawa12.vrc-get-gui.ex`,
  executable `ALCOM-Ex` — different install locations, single-instance
  scope and app data directories.
- The GUI config lives at `<data>/vrc-get-ex/EX-gui-config.json` instead of
  stock `vrc-get/gui-config.json`.
- All EX feature settings live in `<data>/vrc-get-ex/EX-settings.json`.
  No EX-specific field is ever written to a file stock ALCOM reads.
  (The VPM environment settings — repositories and the project list — are
  shared with stock ALCOM / VCC / the vrc-get CLI by design, exactly like
  stock ALCOM does, and EX only writes stock-schema data there.)
- The stock self-updater is disabled: its manifests describe stock builds
  and applying one would replace ALCOM-Ex. Update EX by installing a new
  EX build.
- ALCOM-Ex never registers the `vcc://` protocol handler or other deep
  link handlers; they stay owned by stock ALCOM / VCC.

Note on the version string: Cargo and npm require plain semver package
versions, so `1.2.0-beta.2` stays in `Cargo.toml` and the `-@Ex 0.1.0`
suffix is appended at display time from a single source of truth
(`vrc-get-gui/src/ex.rs`, mirrored as `exDisplayVersion` in
`vrc-get-gui/package.json`).

## Building

Windows portable zip (primary), plus a best-effort NSIS installer and
Linux / macOS binaries, are built by the GitHub Actions workflow
`.github/workflows/build-ex.yml` (run it manually or push an `ex-v*` tag).

Locally:

```sh
cd vrc-get-gui
npm ci
npx tauri build --no-bundle   # produces target/release/ALCOM-Ex(.exe)
```
