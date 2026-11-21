/*
 * Copyright (c) 2023 anatawa12 and other contributors
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org.
 */

//! ALCOM-Ex feature settings, stored in `vrc-get-ex/EX-settings.json`.
//!
//! This file is only ever read and written by ALCOM-Ex. Stock ALCOM does not
//! know about it, and no EX-specific value is ever written to the files
//! stock ALCOM reads (`vrc-get/gui-config.json`, VPM `settings.json`, ...),
//! so a side-by-side stock installation can never be broken by EX data.

use serde::{Deserialize, Serialize};
use std::io;
use std::path::PathBuf;
use tokio::sync::Mutex;
use vrc_get_vpm::io::{DefaultEnvironmentIo, IoTrait};

#[derive(Clone, Debug, Default, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct ExSettings {
    pub theme: ExThemeSettings,
    pub terminal: ExTerminalSettings,
    pub upm: ExUpmSettings,
}

/// Theme customization beyond the stock light / dark / system selection.
#[derive(Clone, Debug, Default, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct ExThemeSettings {
    /// Corner radius in rem for `--radius`. `None` keeps the stock value.
    pub radius_rem: Option<f64>,
    /// Background gradient start color (any CSS color). `None` keeps stock.
    pub gradient_start: Option<String>,
    /// Background gradient end color (any CSS color). `None` keeps stock.
    pub gradient_end: Option<String>,
    /// Accent color (any CSS color) applied to primary / ring / accent
    /// variables. `None` keeps the stock color scheme.
    pub accent_color: Option<String>,
    /// Opt-in: when an accent color is set, automatically pick a readable
    /// (black or white) foreground color for text on the accent color.
    /// `false` (default) keeps the stock behavior exactly.
    pub accent_auto_contrast: bool,
    /// Opacity (0.3..=1.0) of the neutral section surfaces (card, popover,
    /// secondary, muted, accent). The 0.3 floor keeps surfaces from
    /// becoming fully transparent. `None` keeps the stock opaque surfaces.
    pub surface_opacity: Option<f64>,
    /// Corner radius in rem applied to section windows (cards and dialog
    /// contents), independently from `radius_rem`. `None` keeps stock.
    pub surface_radius_rem: Option<f64>,
    /// File name (inside the EX config folder) of the background image
    /// copied there by `ex_pick_background_image`. `None` shows no image.
    pub background_image: Option<String>,
    /// Opacity (0.0..=1.0) of the background image layer, composited over
    /// the gradient background. `None` means fully opaque.
    pub bg_image_opacity: Option<f64>,
    /// How the background image is sized: `cover`, `contain`,
    /// `window-width`, `window-height` or `natural`. Aspect ratio is
    /// always preserved. `None` means `cover`.
    pub bg_image_fit: Option<String>,
    /// Anchor position of the background image: `center`, `top`, `bottom`,
    /// `left`, `right`, `top-left`, `top-right`, `bottom-left` or
    /// `bottom-right`. `None` means `center`.
    pub bg_image_position: Option<String>,
    /// Edge fade (gradient transparency) in percent (0..=50) for each side
    /// of the background image. `None` means no fade on that side.
    pub bg_fade_top: Option<f64>,
    pub bg_fade_bottom: Option<f64>,
    pub bg_fade_left: Option<f64>,
    pub bg_fade_right: Option<f64>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct ExTerminalSettings {
    /// The project folder the terminal page last operated on.
    pub last_project_path: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct ExUpmSettings {
    /// Scoped registries defined in ALCOM-Ex. They can be applied to a
    /// project's `Packages/manifest.json` from the UPM repositories tab.
    pub registries: Vec<ExUpmRegistry>,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct ExUpmRegistry {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub scopes: Vec<String>,
}

pub struct ExSettingsState {
    settings: Mutex<ExSettings>,
    path: PathBuf,
    io: DefaultEnvironmentIo,
}

impl ExSettingsState {
    pub async fn new_load(io: &DefaultEnvironmentIo) -> io::Result<Self> {
        let path = io.resolve(crate::ex::EX_SETTINGS_PATH.as_ref());
        let settings = match tokio::fs::read(&path).await {
            Ok(buffer) if buffer.is_empty() => ExSettings::default(),
            Ok(buffer) => serde_json::from_slice::<ExSettings>(&buffer).unwrap_or_else(|e| {
                log::error!("Failed to load EX-settings.json, using defaults: {e}");
                ExSettings::default()
            }),
            Err(ref e) if e.kind() == io::ErrorKind::NotFound => ExSettings::default(),
            Err(e) => return Err(e),
        };
        Ok(Self {
            settings: Mutex::new(settings),
            path,
            io: io.clone(),
        })
    }

    pub async fn get(&self) -> ExSettings {
        self.settings.lock().await.clone()
    }

    pub async fn set(&self, settings: ExSettings) -> io::Result<()> {
        let json = serde_json::to_string_pretty(&settings)?;
        if let Some(parent) = self.path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        self.io.write_atomic(&self.path, json.as_bytes()).await?;
        *self.settings.lock().await = settings;
        Ok(())
    }
}
