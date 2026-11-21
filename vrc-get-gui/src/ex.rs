/*
 * Copyright (c) 2023 anatawa12 and other contributors
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org.
 */

//! ALCOM-Ex specific constants and helpers.
//!
//! ALCOM-Ex is a fork of ALCOM (vrc-get GUI) with additional features.
//! To coexist with stock ALCOM:
//! - The application identifier / product name are changed (see Tauri.toml).
//! - EX-specific settings are stored in a dedicated `vrc-get-ex` folder and
//!   never in the files stock ALCOM reads (`vrc-get/gui-config.json` etc.).
//! - The version is displayed as `<base version>-@Ex <ex version>`, e.g.
//!   `1.2.0-beta.2-@Ex 0.1.0`. Cargo and npm require the package version to be
//!   plain semver, so the `-@Ex x.y.z` suffix is applied at display time from
//!   this single source of truth instead of being baked into `Cargo.toml`.

use std::sync::LazyLock;

/// The ALCOM-Ex version. Appended to the base ALCOM version with `-@Ex `.
pub const EX_VERSION: &str = "0.1.0";

/// Folder (relative to the vrc-get data root) holding every EX-specific file.
pub const EX_CONFIG_DIR: &str = "vrc-get-ex";

/// The GUI config file of ALCOM-Ex, counterpart of stock `vrc-get/gui-config.json`.
/// Kept in the EX folder so stock ALCOM never reads or writes it.
pub const EX_GUI_CONFIG_PATH: &str = "vrc-get-ex/EX-gui-config.json";

/// The EX feature settings file (theme customization, terminal, UPM, ...).
pub const EX_SETTINGS_PATH: &str = "vrc-get-ex/EX-settings.json";

/// Full display version, e.g. `1.2.0-beta.2-@Ex 0.1.0`.
pub static DISPLAY_VERSION: LazyLock<String> =
    LazyLock::new(|| format!("{}-@Ex {}", env!("CARGO_PKG_VERSION"), EX_VERSION));

pub fn display_version() -> String {
    DISPLAY_VERSION.clone()
}
