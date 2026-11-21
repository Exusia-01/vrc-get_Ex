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
		accent_auto_contrast: false,
		surface_opacity: null,
		surface_radius_rem: null,
		background_image: null,
		bg_image_opacity: null,
		bg_image_fit: null,
		bg_image_position: null,
		bg_fade_top: null,
		bg_fade_bottom: null,
		bg_fade_left: null,
		bg_fade_right: null,
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

	// Opt-in accessibility aid: with an accent color set, pick the more
	// readable of white / near-black as the text color on the accent color.
	// Off by default, which keeps the stock appearance exactly.
	if (theme.accent_color && theme.accent_auto_contrast) {
		const foreground = bestForegroundFor(theme.accent_color);
		if (foreground) {
			root.style.setProperty("--primary-foreground", foreground);
		} else {
			root.style.removeProperty("--primary-foreground");
		}
	} else {
		root.style.removeProperty("--primary-foreground");
	}

	// Neutral section surfaces (card / popover / secondary / muted /
	// accent / background) become translucent through --ex-surface-opacity,
	// which globals.css mixes into those colors. The floor is 30% so the
	// surfaces can never become fully transparent.
	if (theme.surface_opacity != null) {
		const opacity = Math.min(1, Math.max(0.3, theme.surface_opacity));
		root.style.setProperty("--ex-surface-opacity", `${opacity}`);
	} else {
		root.style.removeProperty("--ex-surface-opacity");
	}

	// Independent corner radius for section windows (cards, dialogs).
	if (theme.surface_radius_rem != null) {
		root.style.setProperty(
			"--ex-surface-radius",
			`${theme.surface_radius_rem}rem`,
		);
		root.classList.add("ex-surface-radius");
	} else {
		root.style.removeProperty("--ex-surface-radius");
		root.classList.remove("ex-surface-radius");
	}
}

/** Parses `#rgb` / `#rrggbb` / `hsl(...)` into sRGB components (0..255). */
function parseColorToRgb(color: string): [number, number, number] | null {
	const value = color.trim();
	const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (hex) {
		const h = hex[1];
		if (h.length === 3) {
			return [
				parseInt(h[0] + h[0], 16),
				parseInt(h[1] + h[1], 16),
				parseInt(h[2] + h[2], 16),
			];
		}
		return [
			parseInt(h.slice(0, 2), 16),
			parseInt(h.slice(2, 4), 16),
			parseInt(h.slice(4, 6), 16),
		];
	}
	const hsl = value.match(
		/^hsl\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i,
	);
	if (hsl) {
		const h = (Number(hsl[1]) % 360) / 360;
		const s = Number(hsl[2]) / 100;
		const l = Number(hsl[3]) / 100;
		const f = (n: number) => {
			const k = (n + h * 12) % 12;
			const a = s * Math.min(l, 1 - l);
			return Math.round(
				255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
			);
		};
		return [f(0), f(8), f(4)];
	}
	return null;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
	const channel = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const FOREGROUND_CANDIDATES: {
	css: string;
	rgb: [number, number, number];
}[] = [
	{ css: "hsl(0 0% 100%)", rgb: [255, 255, 255] },
	{ css: "hsl(240 10% 13%)", rgb: [31, 31, 38] },
];

/**
 * Returns the candidate foreground color with the higher WCAG contrast
 * ratio against the given background color, or null when the color cannot
 * be parsed.
 */
export function bestForegroundFor(color: string): string | null {
	const rgb = parseColorToRgb(color);
	if (!rgb) return null;
	const lum = relativeLuminance(rgb);
	let best: string | null = null;
	let bestRatio = -1;
	for (const candidate of FOREGROUND_CANDIDATES) {
		const candidateLum = relativeLuminance(candidate.rgb);
		const ratio =
			(Math.max(lum, candidateLum) + 0.05) /
			(Math.min(lum, candidateLum) + 0.05);
		if (ratio > bestRatio) {
			bestRatio = ratio;
			best = candidate.css;
		}
	}
	return best;
}
