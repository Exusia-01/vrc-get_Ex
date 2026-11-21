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
import type { ExSettings, ExThemeSettings } from "@/lib/bindings";
import { exSettingsQuery, saveExSettings } from "@/lib/ex-settings";
import { tc, tt } from "@/lib/i18n";
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

/** `<input type="color">` only accepts `#rrggbb`; fall back to a neutral gray. */
function toHexInputValue(value: string | null): string {
	if (value && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
	return "#808080";
}
