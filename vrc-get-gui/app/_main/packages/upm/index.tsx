/*
 * Copyright (c) 2023 anatawa12 and other contributors
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org.
 */

"use client";

// ALCOM-Ex: UPM repositories tab.
//
// An external implementation of the Unity Package Manager side of package
// management: it edits the selected project's `Packages/manifest.json`
// directly, which is exactly the file Unity UPM reads.
// - Git packages: registered as dependencies with a Git URL, including
//   `#tag` / `#branch` revisions and `?path=` subfolder specifications.
// - Scoped registries: listed / added / removed in `scopedRegistries`,
//   and versioned dependencies can be added for registry packages.
// - Registries defined in the EX settings can be applied to any project.
// This is fully separate from VPM repositories; nothing here touches the
// VPM settings or the vpm-manifest.

import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ExProjectSelector } from "@/components/ex-project-selector";
import { HNavBar, VStack } from "@/components/layout";
import { ScrollPageContainer } from "@/components/ScrollPageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { commands, type ExUpmManifest, type ExUpmRegistry } from "@/lib/bindings";
import { exSettingsQuery, saveExSettings } from "@/lib/ex-settings";
import { tc } from "@/lib/i18n";
import { toastSuccess, toastThrownError } from "@/lib/toast";
import { HeadingPageName } from "../-tab-selector";

export const Route = createFileRoute("/_main/packages/upm/")({
	component: Page,
});

function upmManifestQuery(projectPath: string) {
	return queryOptions({
		queryKey: ["exUpmManifest", projectPath],
		queryFn: () => commands.exUpmGetManifest(projectPath),
		enabled: projectPath.length > 0,
		refetchOnWindowFocus: false,
	});
}

function dependencyKind(value: string): "git" | "file" | "version" {
	if (value.startsWith("file:")) return "file";
	if (/^[0-9^~>=<]/.test(value)) return "version";
	return "git";
}

const inputClass =
	"bg-background border border-input rounded-md px-2 py-1.5 text-sm grow min-w-0";
const monoInputClass = `${inputClass} font-mono`;

function Page() {
	const [projectPath, setProjectPath] = useState("");
	const queryClient = useQueryClient();
	const manifest = useQuery(upmManifestQuery(projectPath));
	const exSettings = useQuery(exSettingsQuery);

	const setManifest = (next: ExUpmManifest) =>
		queryClient.setQueryData(["exUpmManifest", projectPath], next);

	const mutation = useMutation({
		mutationFn: async (fn: () => Promise<ExUpmManifest>) => await fn(),
		onSuccess: (next) => {
			setManifest(next);
			toastSuccess(tc("ex:upm:toast:manifest updated"));
		},
		onError: (e) => {
			console.error(e);
			toastThrownError(e);
		},
	});
	const busy = mutation.isPending;

	// add-dependency form state
	const [depName, setDepName] = useState("");
	const [depValue, setDepValue] = useState("");
	// add-registry form state (for this project)
	const [regName, setRegName] = useState("");
	const [regUrl, setRegUrl] = useState("");
	const [regScopes, setRegScopes] = useState("");
	// add-registry form state (EX global)
	const [exRegName, setExRegName] = useState("");
	const [exRegUrl, setExRegUrl] = useState("");
	const [exRegScopes, setExRegScopes] = useState("");

	const parseScopes = (text: string) =>
		text
			.split(/[\s,]+/)
			.map((s) => s.trim())
			.filter((s) => s.length > 0);

	const saveExRegistries = async (registries: ExUpmRegistry[]) => {
		if (!exSettings.data) return;
		try {
			await saveExSettings({
				...exSettings.data,
				upm: { registries },
			});
			toastSuccess(tc("ex:upm:toast:manifest updated"));
		} catch (e) {
			toastThrownError(e);
		}
	};

	return (
		<VStack className={"h-full"}>
			<HNavBar leading={<HeadingPageName pageType={"/packages/upm"} />} />
			<ScrollPageContainer>
				<div className={"flex flex-col gap-4 p-1"}>
					<p className={"text-sm whitespace-normal"}>
						{tc("ex:upm:description")}
					</p>
					<ExProjectSelector value={projectPath} onChange={setProjectPath} />

					{projectPath && manifest.data && (
						<>
							<Card className={"p-4 flex flex-col gap-2"}>
								<h2 className={"font-bold"}>
									{tc("ex:upm:dependencies")}
								</h2>
								{manifest.data.dependencies.length === 0 && (
									<p className={"text-sm"}>{tc("ex:upm:no dependencies")}</p>
								)}
								{manifest.data.dependencies.map(([name, value]) => (
									<div
										key={name}
										className={
											"flex items-center gap-2 border-b border-border/50 pb-1"
										}
									>
										<span className={"font-mono text-sm"}>{name}</span>
										<span
											className={
												"text-xs px-1.5 py-0.5 rounded bg-secondary shrink-0"
											}
										>
											{tc(`ex:upm:kind:${dependencyKind(value)}`)}
										</span>
										<span
											className={
												"font-mono text-xs text-muted-foreground truncate grow"
											}
										>
											{value}
										</span>
										<Button
											size={"sm"}
											variant={"destructive"}
											disabled={busy}
											onClick={() =>
												mutation.mutate(() =>
													commands.exUpmRemoveDependency(projectPath, name),
												)
											}
										>
											{tc("general:button:delete")}
										</Button>
									</div>
								))}
								<div className={"flex gap-2 pt-2 flex-wrap"}>
									<input
										className={monoInputClass}
										placeholder={tc("ex:upm:package name placeholder")}
										value={depName}
										onChange={(e) => setDepName(e.target.value)}
										spellCheck={false}
									/>
									<input
										className={monoInputClass}
										placeholder={tc("ex:upm:git url placeholder")}
										value={depValue}
										onChange={(e) => setDepValue(e.target.value)}
										spellCheck={false}
									/>
									<Button
										disabled={busy || !depName || !depValue}
										onClick={() =>
											mutation.mutate(() =>
												commands.exUpmSetDependency(
													projectPath,
													depName.trim(),
													depValue.trim(),
												),
											)
										}
									>
										{tc("ex:upm:button:add dependency")}
									</Button>
								</div>
								<p className={"text-xs text-muted-foreground whitespace-normal"}>
									{tc("ex:upm:git hint")}
								</p>
							</Card>

							<Card className={"p-4 flex flex-col gap-2"}>
								<h2 className={"font-bold"}>
									{tc("ex:upm:scoped registries")}
								</h2>
								{manifest.data.scoped_registries.length === 0 && (
									<p className={"text-sm"}>{tc("ex:upm:no registries")}</p>
								)}
								{manifest.data.scoped_registries.map((registry) => (
									<div
										key={registry.name}
										className={
											"flex items-center gap-2 border-b border-border/50 pb-1"
										}
									>
										<span className={"font-mono text-sm"}>{registry.name}</span>
										<span
											className={
												"font-mono text-xs text-muted-foreground truncate"
											}
										>
											{registry.url}
										</span>
										<span className={"text-xs grow truncate"}>
											{registry.scopes.join(", ")}
										</span>
										<Button
											size={"sm"}
											variant={"destructive"}
											disabled={busy}
											onClick={() =>
												mutation.mutate(() =>
													commands.exUpmRemoveScopedRegistry(
														projectPath,
														registry.name,
													),
												)
											}
										>
											{tc("general:button:delete")}
										</Button>
									</div>
								))}
								<div className={"flex gap-2 pt-2 flex-wrap"}>
									<input
										className={inputClass}
										placeholder={tc("ex:upm:registry name placeholder")}
										value={regName}
										onChange={(e) => setRegName(e.target.value)}
										spellCheck={false}
									/>
									<input
										className={monoInputClass}
										placeholder={tc("ex:upm:registry url placeholder")}
										value={regUrl}
										onChange={(e) => setRegUrl(e.target.value)}
										spellCheck={false}
									/>
									<input
										className={monoInputClass}
										placeholder={tc("ex:upm:registry scopes placeholder")}
										value={regScopes}
										onChange={(e) => setRegScopes(e.target.value)}
										spellCheck={false}
									/>
									<Button
										disabled={busy || !regName || !regUrl}
										onClick={() =>
											mutation.mutate(() =>
												commands.exUpmAddScopedRegistry(projectPath, {
													name: regName.trim(),
													url: regUrl.trim(),
													scopes: parseScopes(regScopes),
												}),
											)
										}
									>
										{tc("ex:upm:button:add registry")}
									</Button>
								</div>
							</Card>
						</>
					)}

					<Card className={"p-4 flex flex-col gap-2"}>
						<h2 className={"font-bold"}>{tc("ex:upm:ex registries")}</h2>
						<p className={"text-xs text-muted-foreground whitespace-normal"}>
							{tc("ex:upm:ex registries description")}
						</p>
						{(exSettings.data?.upm.registries ?? []).map((registry) => (
							<div
								key={registry.name}
								className={
									"flex items-center gap-2 border-b border-border/50 pb-1"
								}
							>
								<span className={"font-mono text-sm"}>{registry.name}</span>
								<span
									className={"font-mono text-xs text-muted-foreground truncate"}
								>
									{registry.url}
								</span>
								<span className={"text-xs grow truncate"}>
									{registry.scopes.join(", ")}
								</span>
								<Button
									size={"sm"}
									disabled={busy || !projectPath}
									onClick={() =>
										mutation.mutate(() =>
											commands.exUpmAddScopedRegistry(projectPath, registry),
										)
									}
								>
									{tc("ex:upm:button:apply registry")}
								</Button>
								<Button
									size={"sm"}
									variant={"destructive"}
									onClick={() =>
										void saveExRegistries(
											(exSettings.data?.upm.registries ?? []).filter(
												(r) => r.name !== registry.name,
											),
										)
									}
								>
									{tc("general:button:delete")}
								</Button>
							</div>
						))}
						<div className={"flex gap-2 pt-2 flex-wrap"}>
							<input
								className={inputClass}
								placeholder={tc("ex:upm:registry name placeholder")}
								value={exRegName}
								onChange={(e) => setExRegName(e.target.value)}
								spellCheck={false}
							/>
							<input
								className={monoInputClass}
								placeholder={tc("ex:upm:registry url placeholder")}
								value={exRegUrl}
								onChange={(e) => setExRegUrl(e.target.value)}
								spellCheck={false}
							/>
							<input
								className={monoInputClass}
								placeholder={tc("ex:upm:registry scopes placeholder")}
								value={exRegScopes}
								onChange={(e) => setExRegScopes(e.target.value)}
								spellCheck={false}
							/>
							<Button
								disabled={!exRegName || !exRegUrl}
								onClick={() => {
									void saveExRegistries([
										...(exSettings.data?.upm.registries ?? []).filter(
											(r) => r.name !== exRegName.trim(),
										),
										{
											name: exRegName.trim(),
											url: exRegUrl.trim(),
											scopes: parseScopes(exRegScopes),
										},
									]);
									setExRegName("");
									setExRegUrl("");
									setExRegScopes("");
								}}
							>
								{tc("ex:upm:button:add registry")}
							</Button>
						</div>
					</Card>
				</div>
			</ScrollPageContainer>
		</VStack>
	);
}
