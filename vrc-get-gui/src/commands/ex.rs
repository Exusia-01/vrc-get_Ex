/*
 * Copyright (c) 2023 anatawa12 and other contributors
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org.
 */

//! ALCOM-Ex specific commands.
//!
//! Everything in this module only exists in ALCOM-Ex. EX feature data is
//! stored exclusively in the `vrc-get-ex` folder (see `crate::ex`), never in
//! files that stock ALCOM reads.

use crate::commands::prelude::*;
use crate::state::{ExSettings, ExUpmRegistry};
use base64::Engine;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::str::FromStr;
use std::time::Duration;
use tauri::{State, Window};
use tauri_plugin_dialog::DialogExt;
use tokio::process::Command;
use vrc_get_vpm::environment::PackageInstaller;
use vrc_get_vpm::io::DefaultEnvironmentIo;
use vrc_get_vpm::version::{StrictEqVersion, Version};

// ---------- EX settings ----------

#[tauri::command]
#[specta::specta]
pub async fn ex_get_settings(state: State<'_, ExSettingsState>) -> Result<ExSettings, RustError> {
    Ok(state.get().await)
}

#[tauri::command]
#[specta::specta]
pub async fn ex_set_settings(
    state: State<'_, ExSettingsState>,
    settings: ExSettings,
) -> Result<(), RustError> {
    state.set(settings).await?;
    Ok(())
}

// ---------- Apply pending changes with per-package exclusion ----------

/// ALCOM-Ex variant of `project_apply_pending_changes` that first drops the
/// pending changes of `excluded_packages` (dependency-driven changes the
/// user chose to keep as-is). The exclusion is forceful by design: even if
/// a remaining package declares a dependency on an excluded one, that
/// dependency instruction is ignored and the rest is applied anyway.
#[tauri::command]
#[specta::specta]
pub async fn ex_project_apply_pending_changes(
    changes: State<'_, ChangesState>,
    io: State<'_, DefaultEnvironmentIo>,
    http: State<'_, reqwest::Client>,
    project_path: String,
    changes_version: u32,
    excluded_packages: Vec<String>,
) -> Result<(), RustError> {
    let Some(mut changes) = changes.get_versioned(changes_version) else {
        return Err(RustError::unrecoverable_str("changes version mismatch"));
    };

    let mut unity_project = load_project(project_path).await?;
    let mut changes = changes.take_changes();

    if !excluded_packages.is_empty() {
        let excluded: HashSet<&str> = excluded_packages.iter().map(|x| x.as_str()).collect();
        if let Err(problems) = changes.exclude_packages(&excluded) {
            return Err(RustError::unrecoverable_str(format!(
                "The selected changes cannot be excluded:\n{}",
                problems
                    .iter()
                    .map(|p| format!("- {p}"))
                    .collect::<Vec<_>>()
                    .join("\n")
            )));
        }
    }

    let installer = PackageInstaller::new(io.inner(), Some(http.inner()));

    unity_project
        .apply_pending_changes(&installer, changes)
        .await?;

    update_project_last_modified(&io, unity_project.project_dir()).await;
    Ok(())
}

// ---------- Package version dependencies (Alt+click in the version list) ----------

/// ALCOM-Ex: returns the VPM dependencies (`(name, version range)` pairs)
/// declared by one specific package version, looked up in the currently
/// loaded environment package collection. The stock package list data only
/// carries dependency names, so the ranges are fetched here on demand.
#[tauri::command]
#[specta::specta]
pub async fn ex_get_package_dependencies(
    packages: State<'_, PackagesState>,
    name: String,
    version: String,
) -> Result<Vec<(String, String)>, RustError> {
    let Some(packages) = packages.get() else {
        return Err(RustError::unrecoverable_str(
            "Internal Error: environment version mismatch",
        ));
    };
    let Ok(version) = Version::from_str(&version) else {
        return Err(RustError::unrecoverable_str("bad version"));
    };
    let Some(pkg) = packages
        .packages()
        .iter()
        .find(|p| p.name() == name && StrictEqVersion(p.version()) == StrictEqVersion(&version))
    else {
        return Err(RustError::unrecoverable_str("package not found"));
    };
    Ok(pkg
        .vpm_dependencies()
        .iter()
        .map(|(dep_name, range)| (dep_name.to_string(), range.to_string()))
        .collect())
}

// ---------- Background image ----------

fn ex_config_dir(io: &DefaultEnvironmentIo) -> PathBuf {
    io.resolve(crate::ex::EX_CONFIG_DIR.as_ref())
}

/// ALCOM-Ex: opens a file picker for a background image, copies the chosen
/// file into the EX config folder as `background-image.<ext>` and returns
/// that file name. Returns `None` when the picker was cancelled. Any image
/// format is accepted at this level; whether it can be displayed (and
/// animated) depends on the web view's image decoders.
#[tauri::command]
#[specta::specta]
pub async fn ex_pick_background_image(
    window: Window,
    io: State<'_, DefaultEnvironmentIo>,
) -> Result<Option<String>, RustError> {
    let Some(path) = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter(
            "Image",
            &[
                "png", "jpg", "jpeg", "gif", "webp", "apng", "bmp", "svg", "avif", "ico", "tif",
                "tiff", "jxl",
            ],
        )
        .blocking_pick_file()
        .map(|x| x.into_path_buf())
        .transpose()?
    else {
        return Ok(None);
    };

    let extension = path
        .extension()
        .and_then(|x| x.to_str())
        .filter(|x| x.chars().all(|c| c.is_ascii_alphanumeric()) && x.len() <= 8)
        .map(|x| x.to_ascii_lowercase())
        .unwrap_or_else(|| "png".to_string());
    let file_name = format!("background-image.{extension}");

    let dir = ex_config_dir(io.inner());
    tokio::fs::create_dir_all(&dir).await?;
    // remove a previously stored image with a different extension
    let mut entries = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("background-image.") && name != file_name {
            tokio::fs::remove_file(entry.path()).await.ok();
        }
    }
    tokio::fs::copy(&path, dir.join(&file_name)).await?;
    Ok(Some(file_name))
}

fn background_image_mime(file_name: &str) -> &'static str {
    match file_name.rsplit('.').next().unwrap_or_default() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "apng" => "image/apng",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "tif" | "tiff" => "image/tiff",
        "jxl" => "image/jxl",
        _ => "application/octet-stream",
    }
}

/// ALCOM-Ex: returns the stored background image as a `data:` URL, or
/// `None` when no background image is configured / the file is gone.
#[tauri::command]
#[specta::specta]
pub async fn ex_get_background_image(
    state: State<'_, ExSettingsState>,
    io: State<'_, DefaultEnvironmentIo>,
) -> Result<Option<String>, RustError> {
    let settings = state.get().await;
    let Some(file_name) = settings.theme.background_image else {
        return Ok(None);
    };
    // the stored value must be a plain file name, never a path
    if Path::new(&file_name).file_name().and_then(|x| x.to_str()) != Some(file_name.as_str()) {
        return Ok(None);
    }
    let path = ex_config_dir(io.inner()).join(&file_name);
    match tokio::fs::read(&path).await {
        Ok(bytes) => Ok(Some(format!(
            "data:{};base64,{}",
            background_image_mime(&file_name),
            base64::engine::general_purpose::STANDARD.encode(bytes),
        ))),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(RustError::unrecoverable(e)),
    }
}

/// ALCOM-Ex: deletes the stored background image file, if any. The caller
/// also clears `theme.background_image` in the EX settings.
#[tauri::command]
#[specta::specta]
pub async fn ex_clear_background_image(
    state: State<'_, ExSettingsState>,
    io: State<'_, DefaultEnvironmentIo>,
) -> Result<(), RustError> {
    let settings = state.get().await;
    if let Some(file_name) = settings.theme.background_image {
        if Path::new(&file_name).file_name().and_then(|x| x.to_str()) == Some(file_name.as_str()) {
            let path = ex_config_dir(io.inner()).join(&file_name);
            tokio::fs::remove_file(path).await.ok();
        }
    }
    Ok(())
}

// ---------- Terminal ----------

#[derive(Serialize, specta::Type)]
pub struct ExTerminalOutput {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    timed_out: bool,
}

/// Runs a shell command for the terminal page.
///
/// Safety: the working directory is restricted to a Unity project folder
/// (a directory containing `Packages/` or `Assets/`). The terminal page
/// only ever passes the folder of a project registered in ALCOM-Ex, and the
/// restriction is enforced again here on the Rust side.
#[tauri::command]
#[specta::specta]
pub async fn ex_terminal_run(cwd: String, command: String) -> Result<ExTerminalOutput, RustError> {
    let dir = PathBuf::from(&cwd);
    let dir = tokio::fs::canonicalize(&dir)
        .await
        .map_err(|_| RustError::unrecoverable_str("terminal: working directory does not exist"))?;
    if !dir.is_dir() || !(dir.join("Packages").is_dir() || dir.join("Assets").is_dir()) {
        return Err(RustError::unrecoverable_str(
            "terminal: working directory must be a Unity project folder",
        ));
    }

    let mut cmd = if cfg!(target_os = "windows") {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", &command]);
        cmd
    } else {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", &command]);
        cmd
    };
    cmd.current_dir(&dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = match tokio::time::timeout(Duration::from_secs(120), cmd.output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => return Err(RustError::unrecoverable(e)),
        Err(_) => {
            return Ok(ExTerminalOutput {
                stdout: String::new(),
                stderr: "command timed out after 120 seconds".to_string(),
                exit_code: None,
                timed_out: true,
            });
        }
    };

    Ok(ExTerminalOutput {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        exit_code: output.status.code(),
        timed_out: false,
    })
}

// ---------- UPM (Unity Package Manager) manifest management ----------

#[derive(Serialize, specta::Type)]
pub struct ExUpmManifest {
    /// `(package name, version / git url / file path)` pairs, sorted by name.
    dependencies: Vec<(String, String)>,
    scoped_registries: Vec<ExUpmRegistry>,
}

fn upm_manifest_path(project_path: &str) -> PathBuf {
    Path::new(project_path)
        .join("Packages")
        .join("manifest.json")
}

async fn read_upm_manifest(project_path: &str) -> Result<serde_json::Value, RustError> {
    let path = upm_manifest_path(project_path);
    match tokio::fs::read(&path).await {
        Ok(buffer) => serde_json::from_slice(&buffer)
            .map_err(|e| RustError::unrecoverable_str(format!("invalid manifest.json: {e}"))),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(serde_json::json!({ "dependencies": {} }))
        }
        Err(e) => Err(RustError::unrecoverable(e)),
    }
}

async fn write_upm_manifest(
    project_path: &str,
    manifest: &serde_json::Value,
) -> Result<(), RustError> {
    let path = upm_manifest_path(project_path);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let json = serde_json::to_string_pretty(manifest)
        .map_err(|e| RustError::unrecoverable_str(format!("failed to serialize manifest: {e}")))?;
    tokio::fs::write(&path, json).await?;
    Ok(())
}

fn manifest_to_ex(manifest: &serde_json::Value) -> ExUpmManifest {
    let mut dependencies: Vec<(String, String)> = manifest
        .get("dependencies")
        .and_then(|x| x.as_object())
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| (k.clone(), v.as_str().unwrap_or_default().to_string()))
                .collect()
        })
        .unwrap_or_default();
    dependencies.sort();

    let scoped_registries = manifest
        .get("scopedRegistries")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|entry| {
                    Some(ExUpmRegistry {
                        name: entry.get("name")?.as_str()?.to_string(),
                        url: entry.get("url")?.as_str()?.to_string(),
                        scopes: entry
                            .get("scopes")
                            .and_then(|x| x.as_array())
                            .map(|scopes| {
                                scopes
                                    .iter()
                                    .filter_map(|s| s.as_str().map(|s| s.to_string()))
                                    .collect()
                            })
                            .unwrap_or_default(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    ExUpmManifest {
        dependencies,
        scoped_registries,
    }
}

#[tauri::command]
#[specta::specta]
pub async fn ex_upm_get_manifest(project_path: String) -> Result<ExUpmManifest, RustError> {
    let manifest = read_upm_manifest(&project_path).await?;
    Ok(manifest_to_ex(&manifest))
}

/// Adds (or replaces) a UPM dependency. For Git packages, `version_or_url`
/// is the Git URL as Unity UPM accepts it, e.g.
/// `https://github.com/example/pkg.git#v1.2.0` or
/// `https://github.com/example/pkg.git?path=/Packages/pkg#v1.2.0`.
#[tauri::command]
#[specta::specta]
pub async fn ex_upm_set_dependency(
    project_path: String,
    name: String,
    version_or_url: String,
) -> Result<ExUpmManifest, RustError> {
    let mut manifest = read_upm_manifest(&project_path).await?;
    let root = manifest
        .as_object_mut()
        .ok_or_else(|| RustError::unrecoverable_str("manifest.json is not a JSON object"))?;
    let dependencies = root
        .entry("dependencies")
        .or_insert_with(|| serde_json::json!({}));
    let dependencies = dependencies.as_object_mut().ok_or_else(|| {
        RustError::unrecoverable_str("manifest.json dependencies is not an object")
    })?;
    dependencies.insert(name, serde_json::Value::String(version_or_url));
    write_upm_manifest(&project_path, &manifest).await?;
    Ok(manifest_to_ex(&manifest))
}

#[tauri::command]
#[specta::specta]
pub async fn ex_upm_remove_dependency(
    project_path: String,
    name: String,
) -> Result<ExUpmManifest, RustError> {
    let mut manifest = read_upm_manifest(&project_path).await?;
    if let Some(dependencies) = manifest
        .get_mut("dependencies")
        .and_then(|x| x.as_object_mut())
    {
        dependencies.remove(&name);
    }
    write_upm_manifest(&project_path, &manifest).await?;
    Ok(manifest_to_ex(&manifest))
}

#[tauri::command]
#[specta::specta]
pub async fn ex_upm_add_scoped_registry(
    project_path: String,
    registry: ExUpmRegistry,
) -> Result<ExUpmManifest, RustError> {
    let mut manifest = read_upm_manifest(&project_path).await?;
    let root = manifest
        .as_object_mut()
        .ok_or_else(|| RustError::unrecoverable_str("manifest.json is not a JSON object"))?;
    let registries = root
        .entry("scopedRegistries")
        .or_insert_with(|| serde_json::json!([]));
    let registries = registries.as_array_mut().ok_or_else(|| {
        RustError::unrecoverable_str("manifest.json scopedRegistries is not an array")
    })?;
    // replace an existing registry with the same name, otherwise append
    registries.retain(|entry| entry.get("name").and_then(|x| x.as_str()) != Some(&registry.name));
    registries.push(serde_json::json!({
        "name": registry.name,
        "url": registry.url,
        "scopes": registry.scopes,
    }));
    write_upm_manifest(&project_path, &manifest).await?;
    Ok(manifest_to_ex(&manifest))
}

#[tauri::command]
#[specta::specta]
pub async fn ex_upm_remove_scoped_registry(
    project_path: String,
    name: String,
) -> Result<ExUpmManifest, RustError> {
    let mut manifest = read_upm_manifest(&project_path).await?;
    if let Some(registries) = manifest
        .get_mut("scopedRegistries")
        .and_then(|x| x.as_array_mut())
    {
        registries
            .retain(|entry| entry.get("name").and_then(|x| x.as_str()) != Some(name.as_str()));
    }
    write_upm_manifest(&project_path, &manifest).await?;
    Ok(manifest_to_ex(&manifest))
}
