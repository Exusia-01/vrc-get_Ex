/*
 * Copyright (c) 2023 anatawa12 and other contributors
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org.
 */

"use client";

// ALCOM-Ex: background image layer. Renders the image stored by
// `ex_pick_background_image` as a fixed layer above the gradient
// background (the body background) and below the app content, with its
// own opacity, sizing mode, anchor position and per-edge fades. Animated
// images (GIF / APNG / animated WebP, ...) animate natively in the web
// view and loop according to the image's own loop count.

import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { commands } from "@/lib/bindings";
import { exSettingsQuery } from "@/lib/ex-settings";

const POSITIONS = [
	"center",
	"top",
	"bottom",
	"left",
	"right",
	"top-left",
	"top-right",
	"bottom-left",
	"bottom-right",
] as const;
type Position = (typeof POSITIONS)[number];

function normalizePosition(value: string | null): Position {
	return (POSITIONS as readonly string[]).includes(value ?? "")
		? (value as Position)
		: "center";
}

/** flex alignment (align-items, justify-content) for a position. */
function flexAlignment(position: Position): [string, string] {
	switch (position) {
		case "top":
			return ["flex-start", "center"];
		case "bottom":
			return ["flex-end", "center"];
		case "left":
			return ["center", "flex-start"];
		case "right":
			return ["center", "flex-end"];
		case "top-left":
			return ["flex-start", "flex-start"];
		case "top-right":
			return ["flex-start", "flex-end"];
		case "bottom-left":
			return ["flex-end", "flex-start"];
		case "bottom-right":
			return ["flex-end", "flex-end"];
		default:
			return ["center", "center"];
	}
}

function objectPosition(position: Position): string {
	switch (position) {
		case "top":
			return "50% 0%";
		case "bottom":
			return "50% 100%";
		case "left":
			return "0% 50%";
		case "right":
			return "100% 50%";
		case "top-left":
			return "0% 0%";
		case "top-right":
			return "100% 0%";
		case "bottom-left":
			return "0% 100%";
		case "bottom-right":
			return "100% 100%";
		default:
			return "50% 50%";
	}
}

function clampFade(value: number | null): number {
	if (value == null) return 0;
	return Math.min(50, Math.max(0, value));
}

export function ExBackgroundLayer() {
	const settings = useQuery(exSettingsQuery);
	const theme = settings.data?.theme;
	const fileName = theme?.background_image ?? null;

	const image = useQuery({
		queryKey: ["exBackgroundImage", fileName],
		queryFn: () => commands.exGetBackgroundImage(),
		enabled: fileName != null,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
	});

	if (!theme || fileName == null || !image.data) return null;

	const fit = theme.bg_image_fit ?? "cover";
	const position = normalizePosition(theme.bg_image_position);
	const opacity = Math.min(1, Math.max(0, theme.bg_image_opacity ?? 1));

	// Per-edge fade gradients, intersected so each edge fades
	// independently of the others.
	const fades: string[] = [];
	const fadeTop = clampFade(theme.bg_fade_top);
	const fadeBottom = clampFade(theme.bg_fade_bottom);
	const fadeLeft = clampFade(theme.bg_fade_left);
	const fadeRight = clampFade(theme.bg_fade_right);
	if (fadeTop > 0)
		fades.push(`linear-gradient(to bottom, transparent 0%, black ${fadeTop}%)`);
	if (fadeBottom > 0)
		fades.push(`linear-gradient(to top, transparent 0%, black ${fadeBottom}%)`);
	if (fadeLeft > 0)
		fades.push(`linear-gradient(to right, transparent 0%, black ${fadeLeft}%)`);
	if (fadeRight > 0)
		fades.push(`linear-gradient(to left, transparent 0%, black ${fadeRight}%)`);

	const imgStyle: CSSProperties = { opacity };
	if (fades.length > 0) {
		imgStyle.maskImage = fades.join(", ");
		imgStyle.WebkitMaskImage = fades.join(", ");
		imgStyle.maskComposite = "intersect";
	}

	let img: React.ReactNode;
	if (fit === "cover" || fit === "contain") {
		imgStyle.objectPosition = objectPosition(position);
		img = (
			<img
				src={image.data}
				alt={""}
				draggable={false}
				className={"absolute inset-0 h-full w-full"}
				style={{
					...imgStyle,
					objectFit: fit === "cover" ? "cover" : "contain",
				}}
			/>
		);
		return (
			<div
				aria-hidden
				className={"pointer-events-none fixed inset-0 overflow-hidden"}
				style={{ zIndex: -1 }}
			>
				{img}
			</div>
		);
	}

	// Sized-by-basis modes: the image keeps its aspect ratio and is
	// anchored inside a flex wrapper according to the position.
	const basisStyle: CSSProperties = { ...imgStyle, flex: "none" };
	if (fit === "window-width") {
		basisStyle.width = "100%";
		basisStyle.height = "auto";
	} else if (fit === "window-height") {
		basisStyle.width = "auto";
		basisStyle.height = "100%";
	}
	// "natural": no explicit size, the image renders at its own size.
	const [alignItems, justifyContent] = flexAlignment(position);
	return (
		<div
			aria-hidden
			className={"pointer-events-none fixed inset-0 flex overflow-hidden"}
			style={{ zIndex: -1, alignItems, justifyContent }}
		>
			<img src={image.data} alt={""} draggable={false} style={basisStyle} />
		</div>
	);
}
