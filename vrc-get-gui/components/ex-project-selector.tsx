/*
 * Copyright (c) 2023 anatawa12 and other contributors
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org.
 */

"use client";

// ALCOM-Ex: a project picker shared by the EX pages (terminal / UPM).
// Lists the projects registered in ALCOM and also accepts a raw path.

import { useQuery } from "@tanstack/react-query";
import { commands } from "@/lib/bindings";
import { tc } from "@/lib/i18n";

export function ExProjectSelector({
	value,
	onChange,
}: {
	value: string;
	onChange: (path: string) => void;
}) {
	const projects = useQuery({
		queryKey: ["environmentProjects"],
		queryFn: () => commands.environmentProjects(),
		refetchOnWindowFocus: false,
	});

	const knownPaths = new Set(
		(projects.data?.projects ?? []).map((p) => p.path),
	);

	return (
		<div className={"flex flex-col gap-1"}>
			<select
				className={
					"bg-background border border-input rounded-md px-2 py-2 text-sm"
				}
				value={knownPaths.has(value) ? value : ""}
				onChange={(e) => {
					if (e.target.value) onChange(e.target.value);
				}}
			>
				<option value={""}>{tc("ex:project:select")}</option>
				{(projects.data?.projects ?? []).map((p) => (
					<option key={p.path} value={p.path}>
						{p.display_name ?? p.name} ({p.path})
					</option>
				))}
			</select>
			<input
				className={
					"bg-background border border-input rounded-md px-2 py-1.5 text-sm font-mono"
				}
				placeholder={tc("ex:project:path placeholder")}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				spellCheck={false}
			/>
		</div>
	);
}
