/*
 * Copyright (c) 2023 anatawa12 and other contributors
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org.
 */

"use client";

// ALCOM-Ex: extended theme settings - corner radius, background gradient
// colors and an accent color. Values are stored in EX-settings.json and
// applied as CSS variables (see lib/ex-settings.ts).

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	commands,
	type ExSettings,
	type ExThemeSettings,
} from "@/lib/bindings";
import { exSettingsQuery, saveExSettings } from "@/lib/ex-settings";
import { tc, tt } from "@/lib/i18n";
import { queryClient } from "@/lib/query-client";
import { toastThrownError } from "@/lib/toast";

export function ExAppearanceSettings() {
	const exSettings = useQuery(exSettingsQuery);
	const settings = exSettings.data;
	if (!settings) return null;

	const updateTheme = (theme: ExThemeSettings) => {
		const next: ExSettings = { ...settings, theme };
		saveExSettings(next).catch((e) => {
			console.error(e);
			toastThrownError(e);
		});
	};
	const theme = settings.theme;

	const pickBackgroundImage = async () => {
		try {
			const name = await commands.exPickBackgroundImage();
			if (name) {
				updateTheme({ ...theme, background_image: name });
				await queryClient.invalidateQueries({
					queryKey: ["exBackgroundImage"],
				});
			}
		} catch (e) {
			console.error(e);
			toastThrownError(e);
		}
	};

	const clearBackgroundImage = async () => {
		try {
			await commands.exClearBackgroundImage();
			updateTheme({ ...theme, background_image: null });
			await queryClient.invalidateQueries({
				queryKey: ["exBackgroundImage"],
			});
		} catch (e) {
			console.error(e);
			toastThrownError(e);
		}
	};

	return (
		<div className={"flex flex-col gap-3 pt-2"}>
			<h3 className={"font-bold"}>{tc("ex:settings:theme customization")}</h3>
			<p className={"text-sm whitespace-normal"}>
				{tc("ex:settings:theme customization description")}
			</p>

			<label className={"flex items-center gap-2"}>
				<span className={"w-40 shrink-0 text-sm"}>
					{tc("ex:settings:radius")}
				</span>
				<input
					type={"range"}
					min={0}
					max={1.5}
					step={0.05}
					value={theme.radius_rem ?? 0.625}
					onChange={(e) =>
						updateTheme({ ...theme, radius_rem: Number(e.target.value) })
					}
					className={"grow"}
				/>
				<span className={"text-sm w-16 text-right"}>
					{theme.radius_rem != null ? `${theme.radius_rem.toFixed(2)}rem` : "-"}
				</span>
				<Button
					size={"sm"}
					variant={"ghost"}
					onClick={() => updateTheme({ ...theme, radius_rem: null })}
				>
					{tc("ex:settings:reset")}
				</Button>
			</label>

			<ColorRow
				label={tt("ex:settings:gradient start")}
				value={theme.gradient_start}
				onChange={(v) => updateTheme({ ...theme, gradient_start: v })}
			/>
			<ColorRow
				label={tt("ex:settings:gradient end")}
				value={theme.gradient_end}
				onChange={(v) => updateTheme({ ...theme, gradient_end: v })}
			/>
			<ColorRow
				label={tt("ex:settings:accent color")}
				value={theme.accent_color}
				onChange={(v) => updateTheme({ ...theme, accent_color: v })}
			/>

			<label className={"flex items-center gap-2"}>
				<span className={"w-40 shrink-0 text-sm"}>
					{tc("ex:settings:accent auto contrast")}
				</span>
				<Checkbox
					checked={theme.accent_auto_contrast}
					onCheckedChange={(e) =>
						updateTheme({ ...theme, accent_auto_contrast: e === true })
					}
				/>
				<span className={"text-sm whitespace-normal"}>
					{tc("ex:settings:accent auto contrast description")}
				</span>
			</label>

			<SliderRow
				label={tt("ex:settings:surface opacity")}
				value={theme.surface_opacity}
				min={0.3}
				max={1}
				step={0.05}
				defaultValue={1}
				format={(v) => `${Math.round(v * 100)}%`}
				onChange={(v) => updateTheme({ ...theme, surface_opacity: v })}
			/>
			<SliderRow
				label={tt("ex:settings:surface radius")}
				value={theme.surface_radius_rem}
				min={0}
				max={1.5}
				step={0.05}
				defaultValue={0.75}
				format={(v) => `${v.toFixed(2)}rem`}
				onChange={(v) => updateTheme({ ...theme, surface_radius_rem: v })}
			/>

			<h4 className={"font-bold pt-2"}>{tc("ex:settings:background image")}</h4>
			<p className={"text-sm whitespace-normal"}>
				{tc("ex:settings:background image description")}
			</p>
			<div className={"flex items-center gap-2"}>
				<span className={"w-40 shrink-0 text-sm"}>
					{tc("ex:settings:background image file")}
				</span>
				<span className={"text-sm font-mono"}>
					{theme.background_image ?? tc("ex:settings:not set")}
				</span>
				<Button size={"sm"} variant={"secondary"} onClick={pickBackgroundImage}>
					{tc("ex:settings:pick image")}
				</Button>
				<Button
					size={"sm"}
					variant={"ghost"}
					disabled={theme.background_image == null}
					onClick={clearBackgroundImage}
				>
					{tc("ex:settings:reset")}
				</Button>
			</div>
			<SliderRow
				label={tt("ex:settings:background image opacity")}
				value={theme.bg_image_opacity}
				min={0}
				max={1}
				step={0.05}
				defaultValue={1}
				format={(v) => `${Math.round(v * 100)}%`}
				onChange={(v) => updateTheme({ ...theme, bg_image_opacity: v })}
			/>
			<SelectRow
				label={tt("ex:settings:background image fit")}
				value={theme.bg_image_fit ?? "cover"}
				options={[
					["cover", tt("ex:settings:fit:cover")],
					["contain", tt("ex:settings:fit:contain")],
					["window-width", tt("ex:settings:fit:window width")],
					["window-height", tt("ex:settings:fit:window height")],
					["natural", tt("ex:settings:fit:natural")],
				]}
				onChange={(v) => updateTheme({ ...theme, bg_image_fit: v })}
			/>
			<SelectRow
				label={tt("ex:settings:background image position")}
				value={theme.bg_image_position ?? "center"}
				options={[
					["center", tt("ex:settings:position:center")],
					["top", tt("ex:settings:position:top")],
					["bottom", tt("ex:settings:position:bottom")],
					["left", tt("ex:settings:position:left")],
					["right", tt("ex:settings:position:right")],
					["top-left", tt("ex:settings:position:top left")],
					["top-right", tt("ex:settings:position:top right")],
					["bottom-left", tt("ex:settings:position:bottom left")],
					["bottom-right", tt("ex:settings:position:bottom right")],
				]}
				onChange={(v) => updateTheme({ ...theme, bg_image_position: v })}
			/>
			<SliderRow
				label={tt("ex:settings:fade top")}
				value={theme.bg_fade_top}
				min={0}
				max={50}
				step={1}
				defaultValue={0}
				format={(v) => `${v}%`}
				onChange={(v) => updateTheme({ ...theme, bg_fade_top: v })}
			/>
			<SliderRow
				label={tt("ex:settings:fade bottom")}
				value={theme.bg_fade_bottom}
				min={0}
				max={50}
				step={1}
				defaultValue={0}
				format={(v) => `${v}%`}
				onChange={(v) => updateTheme({ ...theme, bg_fade_bottom: v })}
			/>
			<SliderRow
				label={tt("ex:settings:fade left")}
				value={theme.bg_fade_left}
				min={0}
				max={50}
				step={1}
				defaultValue={0}
				format={(v) => `${v}%`}
				onChange={(v) => updateTheme({ ...theme, bg_fade_left: v })}
			/>
			<SliderRow
				label={tt("ex:settings:fade right")}
				value={theme.bg_fade_right}
				min={0}
				max={50}
				step={1}
				defaultValue={0}
				format={(v) => `${v}%`}
				onChange={(v) => updateTheme({ ...theme, bg_fade_right: v })}
			/>
		</div>
	);
}

function ColorRow({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string | null;
	onChange: (value: string | null) => void;
}) {
	return (
		<label className={"flex items-center gap-2"}>
			<span className={"w-40 shrink-0 text-sm"}>{label}</span>
			<input
				type={"color"}
				value={toHexInputValue(value)}
				onChange={(e) => onChange(e.target.value)}
				className={"h-8 w-14 shrink-0 cursor-pointer bg-transparent"}
			/>
			<input
				type={"text"}
				value={value ?? ""}
				placeholder={"#rrggbb"}
				onChange={(e) => onChange(e.target.value || null)}
				className={
					"bg-background border border-input rounded-md px-2 py-1 text-sm font-mono w-32"
				}
				spellCheck={false}
			/>
			<Button size={"sm"} variant={"ghost"} onClick={() => onChange(null)}>
				{tc("ex:settings:reset")}
			</Button>
		</label>
	);
}

function SliderRow({
	label,
	value,
	min,
	max,
	step,
	defaultValue,
	format,
	onChange,
}: {
	label: string;
	value: number | null;
	min: number;
	max: number;
	step: number;
	defaultValue: number;
	format: (value: number) => string;
	onChange: (value: number | null) => void;
}) {
	return (
		<label className={"flex items-center gap-2"}>
			<span className={"w-40 shrink-0 text-sm"}>{label}</span>
			<input
				type={"range"}
				min={min}
				max={max}
				step={step}
				value={value ?? defaultValue}
				onChange={(e) => onChange(Number(e.target.value))}
				className={"grow"}
			/>
			<span className={"text-sm w-16 text-right"}>
				{value != null ? format(value) : "-"}
			</span>
			<Button size={"sm"} variant={"ghost"} onClick={() => onChange(null)}>
				{tc("ex:settings:reset")}
			</Button>
		</label>
	);
}

function SelectRow({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: [string, string][];
	onChange: (value: string) => void;
}) {
	return (
		<label className={"flex items-center gap-2"}>
			<span className={"w-40 shrink-0 text-sm"}>{label}</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={
					"bg-background border border-input rounded-md px-2 py-1 text-sm"
				}
			>
				{options.map(([v, labelText]) => (
					<option key={v} value={v}>
						{labelText}
					</option>
				))}
			</select>
		</label>
	);
}

/** `<input type="color">` only accepts `#rrggbb`; fall back to a neutral gray. */
function toHexInputValue(value: string | null): string {
	if (value && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
	return "#808080";
}
