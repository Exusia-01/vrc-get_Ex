/*
 * Copyright (c) 2023 anatawa12 and other contributors
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org.
 */

// ALCOM-Ex: helpers for the EX feature settings (vrc-get-ex/EX-settings.json)
// and for applying the EX theme customization to the document.

import { queryOptions } from "@tanstack/react-query";
import { commands, type ExSettings } from "@/lib/bindings";
import { queryClient } from "@/lib/query-client";

export const exSettingsQuery = queryOptions({
	queryKey: ["exSettings"],
	queryFn: () => commands.exGetSettings(),
	refetchOnWindowFocus: false,
	staleTime: Number.POSITIVE_INFINITY,
});

export const defaultExSettings: ExSettings = {
	theme: {
		radius_rem: null,
		gradient_start: null,
		gradient_end: null,
		accent_color: null,
	},
	terminal: { last_project_path: null },
	upm: { registries: [] },
};

/** Fetches the EX settings, applying the theme customization when loaded. */
export async function loadExSettings(): Promise<ExSettings> {
	const settings = await queryClient.fetchQuery(exSettingsQuery);
	applyExAppearance(settings);
	return settings;
}

/** Saves the whole EX settings object and applies the theme customization. */
export async function saveExSettings(settings: ExSettings): Promise<void> {
	await commands.exSetSettings(settings);
	queryClient.setQueryData(exSettingsQuery.queryKey, settings);
	applyExAppearance(settings);
}

/**
 * Applies the EX theme customization as inline CSS variables on the root
 * element. Inline variables win over the stock `:root` / `.dark` values in
 * globals.css; clearing a value (null) restores the stock appearance.
 */
export function applyExAppearance(settings: ExSettings) {
	const root = document.documentElement;
	const theme = settings.theme;

	if (theme.radius_rem != null) {
		root.style.setProperty("--radius", `${theme.radius_rem}rem`);
	} else {
		root.style.removeProperty("--radius");
	}

	if (theme.gradient_start) {
		root.style.setProperty("--background-start", theme.gradient_start);
	} else {
		root.style.removeProperty("--background-start");
	}

	if (theme.gradient_end) {
		root.style.setProperty("--background-end", theme.gradient_end);
	} else {
		root.style.removeProperty("--background-end");
	}

	if (theme.accent_color) {
		root.style.setProperty("--primary", theme.accent_color);
		root.style.setProperty("--ring", theme.accent_color);
	} else {
		root.style.removeProperty("--primary");
		root.style.removeProperty("--ring");
	}
}
