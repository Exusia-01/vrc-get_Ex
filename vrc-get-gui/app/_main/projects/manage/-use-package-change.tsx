/*
 * Copyright (c) 2023 anatawa12 and other contributors
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org.
 */

import type { DefaultError } from "@tanstack/query-core";
import { queryOptions, type UseMutationOptions } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CircleAlert } from "lucide-react";
import type React from "react";
import { Fragment, useState } from "react";
import { DelayedButton } from "@/components/DelayedButton";
import { ExternalLink } from "@/components/ExternalLink";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { assertNever } from "@/lib/assert-never";
import type {
	TauriBasePackageInfo,
	TauriPackage,
	TauriPackageChange,
	TauriPendingProjectChanges,
	TauriVersion,
} from "@/lib/bindings";
import { commands } from "@/lib/bindings";
import { type DialogContext, openSingleDialog } from "@/lib/dialog";
import { isHandleable } from "@/lib/errors";
import { tc, tt } from "@/lib/i18n";
import { queryClient } from "@/lib/query-client";
import { toastInfo, toastSuccess, toastThrownError } from "@/lib/toast";
import { groupBy, keyComparator } from "@/lib/utils";
import { compareVersion, toVersionString } from "@/lib/version";

export type RequestedOperation =
	| {
			type: "install";
			pkg: TauriPackage;
			hasUnityIncompatibleLatest?: boolean;
	  }
	| {
			type: "upgradeAll";
			hasUnityIncompatibleLatest: boolean;
			packages: TauriPackage[];
	  }
	| {
			type: "resolve";
	  }
	| {
			type: "reinstallAll";
	  }
	| {
			type: "remove";
			displayName: string;
			packageId: string;
	  }
	| {
			type: "bulkInstalled";
			hasUnityIncompatibleLatest: boolean;
			packages: TauriPackage[];
	  }
	| {
			type: "bulkReinstalled";
			packageIds: string[];
	  }
	| {
			type: "bulkRemoved";
			packageIds: string[];
	  };

function environmentPackages(projectPath: string) {
	return queryOptions({
		queryKey: ["projectDetails", projectPath],
		queryFn: () => commands.projectDetails(projectPath),
		refetchOnWindowFocus: false,
	});
}

function mutationOptions<
	TOptions extends UseMutationOptions<TData, TError, TVariables, TContext>,
	TData = unknown,
	TError = DefaultError,
	TVariables = void,
	TContext = unknown,
>(
	options: TOptions & UseMutationOptions<TData, TError, TVariables, TContext>,
): TOptions {
	return options;
}

export function applyChangesMutation(projectPath: string) {
	return mutationOptions({
		mutationKey: ["projectApplyChanges", projectPath],
		mutationFn: async (operation: RequestedOperation) =>
			await applyChanges(projectPath, operation),
		onError: (e) => {
			console.error(e);
			toastThrownError(e);
		},
		onSettled: async () => {
			document.dispatchEvent(new Event("post-package-changes"));
			await queryClient.invalidateQueries({
				queryKey: ["projectDetails", projectPath],
			});
			await queryClient.invalidateQueries({
				queryKey: ["environmentPackages"],
			});
		},
	});
}

export async function applyChanges(
	projectPath: string,
	operation: RequestedOperation,
) {
	try {
		const existingPackages = queryClient.getQueryData(
			environmentPackages(projectPath).queryKey,
		)?.installed_packages;

		const changes = await createChanges(projectPath, operation);
		// ALCOM-Ex: the dialog returns the dependency-driven changes the
		// user chose to exclude, or null when cancelled.
		const excludedPackages = await openSingleDialog(ProjectChangesDialog, {
			changes,
			existingPackages,
		});
		if (excludedPackages == null) {
			// close window
			return;
		}
		if (excludedPackages.length > 0) {
			try {
				await commands.exProjectApplyPendingChanges(
					projectPath,
					changes.changes_version,
					excludedPackages,
				);
			} catch (e) {
				// Show the apply error and stop.
				await openSingleDialog(ExclusionFailedDialog, {
					message: errorMessage(e),
				});
				return;
			}
		} else {
			await commands.projectApplyPendingChanges(
				projectPath,
				changes.changes_version,
			);
		}
		showToast(operation);
	} catch (e) {
		if (isHandleable(e) && e.body.type === "MissingDependencies") {
			await openSingleDialog(MissingDependenciesDialog, {
				dependencies: e.body.dependencies,
			});
		} else {
			throw e;
		}
	}
}

function errorMessage(e: unknown): string {
	if (
		typeof e === "object" &&
		e !== null &&
		"message" in e &&
		typeof (e as { message: unknown }).message === "string"
	) {
		return (e as { message: string }).message;
	}
	return String(e);
}

function createChanges(
	projectPath: string,
	operation: RequestedOperation,
): Promise<TauriPendingProjectChanges> {
	switch (operation.type) {
		case "install":
			return commands.projectInstallPackages(projectPath, [
				[operation.pkg.name, toVersionString(operation.pkg.version)],
			]);
		case "upgradeAll":
			return commands.projectInstallPackages(
				projectPath,
				operation.packages.map((pkg) => [
					pkg.name,
					toVersionString(pkg.version),
				]),
			);
		case "resolve":
		case "reinstallAll":
			return commands.projectResolve(projectPath);
		case "remove":
			return commands.projectRemovePackages(projectPath, [operation.packageId]);
		case "bulkInstalled":
			return commands.projectInstallPackages(
				projectPath,
				operation.packages.map((pkg) => [
					pkg.name,
					toVersionString(pkg.version),
				]),
			);
		case "bulkReinstalled":
			return commands.projectReinstallPackages(
				projectPath,
				operation.packageIds,
			);
		case "bulkRemoved":
			return commands.projectRemovePackages(projectPath, operation.packageIds);
		default:
			assertNever(operation);
	}
}
function showToast(requested: RequestedOperation) {
	switch (requested.type) {
		case "install":
			toastSuccess(
				tt("projects:manage:toast:package installed", {
					name: requested.pkg.display_name ?? requested.pkg.name,
					version: toVersionString(requested.pkg.version),
				}),
			);
			if (requested.hasUnityIncompatibleLatest) {
				toastInfo(
					tt(
						"projects:manage:toast:the package has newer latest with incompatible unity",
					),
				);
			}
			break;
		case "remove":
			toastSuccess(
				tt("projects:manage:toast:package removed", {
					name: requested.displayName,
				}),
			);
			break;
		case "resolve":
			toastSuccess(tt("projects:manage:toast:resolved"));
			break;
		case "reinstallAll":
			toastSuccess(tt("projects:manage:toast:all packages reinstalled"));
			break;
		case "upgradeAll":
			toastSuccess(tt("projects:manage:toast:all packages upgraded"));
			if (requested.hasUnityIncompatibleLatest) {
				toastInfo(
					tt(
						"projects:manage:toast:some package has newer latest with incompatible unity",
					),
				);
			}
			break;
		case "bulkInstalled":
			toastSuccess(tt("projects:manage:toast:selected packages installed"));
			if (requested.hasUnityIncompatibleLatest) {
				toastInfo(
					tt(
						"projects:manage:toast:some package has newer latest with incompatible unity",
					),
				);
			}
			break;
		case "bulkRemoved":
			toastSuccess(tt("projects:manage:toast:selected packages removed"));
			break;
		case "bulkReinstalled":
			toastSuccess(tt("projects:manage:toast:selected packages reinstalled"));
			break;
		default:
			assertNever(requested);
	}
}

const TypographyItem = ({ children }: { children: React.ReactNode }) => (
	<div className={"p-3"}>
		<p className={"font-normal"}>{children}</p>
	</div>
);

function ProjectChangesDialog({
	changes,
	existingPackages,
	dialog,
}: {
	changes: TauriPendingProjectChanges;
	existingPackages?: [string, TauriBasePackageInfo][];
	// ALCOM-Ex: resolves with the excluded package ids on apply, null on cancel.
	dialog: DialogContext<string[] | null>;
}) {
	// ALCOM-Ex: per-package exclusion of dependency-driven changes and
	// collapsible dependency details.
	const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
	const [expandedDeps, setExpandedDeps] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const requestedPackages = new Set(changes.ex_requested);
	const dependenciesByPackage = new Map(changes.ex_dependencies);
	const changeByPackage = new Map(changes.package_changes);

	const toggleExcluded = (packageId: string) => {
		setExcluded((prev) => {
			const next = new Set(prev);
			if (next.has(packageId)) {
				next.delete(packageId);
			} else {
				next.add(packageId);
			}
			return next;
		});
	};
	const toggleExpandedDeps = (packageId: string) => {
		setExpandedDeps((prev) => {
			const next = new Set(prev);
			if (next.has(packageId)) {
				next.delete(packageId);
			} else {
				next.add(packageId);
			}
			return next;
		});
	};
	const resolvedVersionOf = (packageId: string): string | null => {
		const installNew = changeByPackage.get(packageId)?.InstallNew;
		if (installNew) {
			return toVersionString(installNew.version);
		}
		const existing = existingPackageMap.get(packageId);
		if (existing) {
			return toVersionString(existing.version);
		}
		return null;
	};
	const versionConflicts = changes.conflicts.filter(
		([_, c]) => c.packages.length > 0,
	);
	const unityConflicts = changes.conflicts.filter(([_, c]) => c.unity_conflict);
	const unlockedConflicts = changes.conflicts.flatMap(
		([_, c]) => c.unlocked_names,
	);

	const existingPackageMap = new Map(existingPackages ?? []);

	const categorizedChanges = changes.package_changes.map(([pkgId, change]) =>
		categorizeChange(pkgId, change, existingPackageMap),
	);
	categorizedChanges.sort(keyComparator("packageId"));
	const groupedChanges = Array.from(groupBy(categorizedChanges, (c) => c.type));
	groupedChanges.sort(keyComparator(0));

	const installingPackageById = new Map(
		changes.package_changes
			.map(([id, change]) =>
				"InstallNew" in change ? ([id, change.InstallNew] as const) : undefined,
			)
			.filter((x) => x != null),
	);

	function getPackageDisplayName(id: string) {
		return (
			installingPackageById.get(id)?.display_name ??
			existingPackageMap.get(id)?.display_name ??
			id
		);
	}

	const breakingChanges = groupedChanges.some(
		([a]) => a === PackageChangeCategory.UpgradeMajor,
	);

	const incompatibility = changes.conflicts.length !== 0;

	const needsCare = breakingChanges || incompatibility;

	return (
		<div className={"contents whitespace-normal"}>
			<DialogHeader>
				<DialogTitle>{tc("projects:manage:button:apply changes")}</DialogTitle>
				<DialogDescription>
					<p>{tc("projects:manage:dialog:confirm changes description")}</p>
					{breakingChanges && (
						<div
							className={
								"flex border border-solid border-warning mt-3 py-2 me-1.5"
							}
						>
							<CircleAlert
								className={"text-warning self-center mx-2 shrink-0"}
							/>
							<p>{tc("projects:manage:dialog:note breaking changes")}</p>
						</div>
					)}
					{incompatibility && (
						<div
							className={
								"flex border border-solid border-warning mt-3 py-2 me-1.5"
							}
						>
							<CircleAlert
								className={"text-warning self-center mx-2 shrink-0"}
							/>
							<p>{tc("projects:manage:dialog:note incompatibility")}</p>
						</div>
					)}
					{excluded.size > 0 && (
						<div
							className={
								"flex border border-solid border-warning mt-3 py-2 me-1.5"
							}
						>
							<CircleAlert
								className={"text-warning self-center mx-2 shrink-0"}
							/>
							<p>
								{tc("projects:manage:dialog:ex:excluded count", {
									count: excluded.size,
								})}
							</p>
						</div>
					)}
				</DialogDescription>
			</DialogHeader>
			<div className="overflow-hidden flex">
				<ScrollArea
					type="always"
					className={"w-full"}
					scrollBarClassName={"bg-background pb-2.5"}
				>
					<div className="pr-2 overflow-x-hidden">
						<div className={"flex flex-col gap-1 p-2"}>
							{groupedChanges.map(([category, changes], index) => {
								return (
									<Fragment key={category}>
										{index !== 0 && <hr />}
										{changes.map((change) => (
											<div
												key={change.packageId}
												className={
													excluded.has(change.packageId)
														? "opacity-50"
														: undefined
												}
											>
												<PackageChange change={change} />
												<ExChangeControls
													change={change}
													dependencies={dependenciesByPackage.get(
														change.packageId,
													)}
													canExclude={
														!requestedPackages.has(change.packageId) &&
														change.type !==
															PackageChangeCategory.UninstallRequested
													}
													isExcluded={excluded.has(change.packageId)}
													onToggleExcluded={() =>
														toggleExcluded(change.packageId)
													}
													isExpanded={expandedDeps.has(change.packageId)}
													onToggleExpanded={() =>
														toggleExpandedDeps(change.packageId)
													}
													resolvedVersionOf={resolvedVersionOf}
													displayNameOf={getPackageDisplayName}
													isDependencyExcluded={(id) => excluded.has(id)}
												/>
											</div>
										))}
									</Fragment>
								);
							})}
						</div>
						{versionConflicts.length > 0 ? (
							<>
								<p className={"text-destructive"}>
									{tc("projects:manage:dialog:package version conflicts", {
										count: versionConflicts.length,
									})}
								</p>
								<div className={"flex flex-col gap-1 p-2"}>
									{versionConflicts.map(([pkgId, conflict]) => {
										return (
											<TypographyItem key={pkgId}>
												{tc("projects:manage:dialog:conflicts with", {
													pkg: getPackageDisplayName(pkgId),
													other: conflict.packages
														.map((p) => getPackageDisplayName(p))
														.join(", "),
												})}
											</TypographyItem>
										);
									})}
								</div>
							</>
						) : null}
						{unityConflicts.length > 0 ? (
							<>
								<p className={"text-destructive"}>
									{tc("projects:manage:dialog:unity version conflicts", {
										count: unityConflicts.length,
									})}
								</p>
								<div className={"flex flex-col gap-1 p-2"}>
									{unityConflicts.map(([pkgId, _]) => (
										<TypographyItem key={pkgId}>
											{tc(
												"projects:manage:dialog:package not supported your unity",
												{
													pkg: getPackageDisplayName(pkgId),
												},
											)}
										</TypographyItem>
									))}
								</div>
							</>
						) : null}
						{changes.remove_legacy_files.length > 0 ||
						changes.remove_legacy_folders.length > 0 ? (
							<>
								<p className={"text-destructive"}>
									{tc(
										"projects:manage:dialog:files and directories are removed as legacy",
									)}
								</p>
								<div className={"flex flex-col gap-1 p-2"}>
									{changes.remove_legacy_files.map((f) => (
										<TypographyItem key={f}>{f}</TypographyItem>
									))}
									{changes.remove_legacy_folders.map((f) => (
										<TypographyItem key={f}>{f}</TypographyItem>
									))}
								</div>
							</>
						) : null}
						{unlockedConflicts.length > 0 ? (
							<>
								<p className={"text-destructive"}>
									{tc(
										"projects:manage:dialog:packages installed in the following directories will be removed",
									)}
								</p>
								<div className={"flex flex-col gap-1 p-2"}>
									{unlockedConflicts.map((f) => (
										<TypographyItem key={f}>{f}</TypographyItem>
									))}
								</div>
							</>
						) : null}
					</div>
				</ScrollArea>
			</div>
			<DialogFooter>
				<Button onClick={() => dialog.close(null)} className="mr-1">
					{tc("general:button:cancel")}
				</Button>
				<DelayedButton
					onClick={() => dialog.close([...excluded])}
					variant={needsCare ? "destructive" : "warning"}
					delay={needsCare ? 1000 : 0}
				>
					{tc("projects:manage:button:apply")}
				</DelayedButton>
			</DialogFooter>
		</div>
	);
}

/** ALCOM-Ex: controls under each package change - a collapsible dependency
 * detail list and, for dependency-driven changes, an exclusion checkbox. */
function ExChangeControls({
	change,
	dependencies,
	canExclude,
	isExcluded,
	onToggleExcluded,
	isExpanded,
	onToggleExpanded,
	resolvedVersionOf,
	displayNameOf,
	isDependencyExcluded,
}: {
	change: PackageChangeDisplayInformation;
	dependencies?: [string, string][];
	canExclude: boolean;
	isExcluded: boolean;
	onToggleExcluded: () => void;
	isExpanded: boolean;
	onToggleExpanded: () => void;
	resolvedVersionOf: (packageId: string) => string | null;
	displayNameOf: (packageId: string) => string;
	isDependencyExcluded: (packageId: string) => boolean;
}) {
	if (!dependencies?.length && !canExclude) return null;
	return (
		<div className={"flex flex-col gap-1 px-3 pb-2"}>
			<div className={"flex items-center gap-3"}>
				{dependencies && dependencies.length > 0 && (
					<button
						type={"button"}
						className={
							"flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
						}
						onClick={onToggleExpanded}
					>
						{isExpanded ? (
							<ChevronDown className={"size-4"} />
						) : (
							<ChevronRight className={"size-4"} />
						)}
						{tc("projects:manage:dialog:ex:dependencies", {
							count: dependencies.length,
						})}
					</button>
				)}
				{canExclude && (
					<label
						className={
							"flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer"
						}
					>
						<Checkbox checked={isExcluded} onCheckedChange={onToggleExcluded} />
						{tc("projects:manage:dialog:ex:exclude this change")}
					</label>
				)}
			</div>
			{isExpanded && dependencies && (
				<ul className={"ml-6 flex flex-col gap-0.5 text-sm"}>
					{dependencies.map(([depId, range]) => {
						const resolved = resolvedVersionOf(depId);
						return (
							<li key={depId} className={"whitespace-normal"}>
								<span>{displayNameOf(depId)}</span>{" "}
								<span className={"font-mono text-xs"}>({depId})</span>
								{": "}
								{tc("projects:manage:dialog:ex:dependency requires", {
									range,
								})}{" "}
								{resolved != null
									? tc("projects:manage:dialog:ex:dependency resolved", {
											version: resolved,
										})
									: tc("projects:manage:dialog:ex:dependency not installed")}
								{isDependencyExcluded(depId) && (
									<span className={"text-warning"}>
										{" "}
										{tc("projects:manage:dialog:ex:dependency excluded")}
									</span>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{change.type === PackageChangeCategory.InstallNew && isExcluded && (
				<p className={"text-sm text-warning whitespace-normal"}>
					{tc("projects:manage:dialog:ex:excluded note")}
				</p>
			)}
		</div>
	);
}

/** ALCOM-Ex: shown when applying with exclusions fails. */
function ExclusionFailedDialog({
	message,
	dialog,
}: {
	message: string;
	dialog: DialogContext<void>;
}) {
	return (
		<div className={"contents whitespace-normal"}>
			<DialogHeader>
				<DialogTitle className={"text-destructive"}>
					<CircleAlert className="size-6 inline" />{" "}
					{tc("projects:manage:dialog:ex:exclusion failed")}
				</DialogTitle>
			</DialogHeader>
			<p className={"whitespace-pre-wrap text-sm"}>{message}</p>
			<DialogFooter>
				<Button onClick={() => dialog.close()}>
					{tc("general:button:close")}
				</Button>
			</DialogFooter>
		</div>
	);
}

function PackageChange({
	change,
}: {
	change: PackageChangeDisplayInformation;
}) {
	switch (change.type) {
		case PackageChangeCategory.UpgradeMajor:
			return (
				<div className={"flex items-center p-3 justify-between bg-warning/10"}>
					<p className={"font-normal"}>
						{tc("projects:manage:dialog:upgrade package", {
							name: change.displayName,
							previousVersion: toVersionString(change.previousVersion),
							version: toVersionString(change.version),
						})}
						<span className={"text-warning"}>
							{"\u200B"}
							<CircleAlert
								className={
									"inline px-1 size-5 -mt-0.5 box-content align-middle"
								}
							/>
							{tc("projects:manage:dialog:breaking changes")}
						</span>
					</p>
					<ChangelogButton url={change.changelogUrl} />
				</div>
			);
		case PackageChangeCategory.Upgrade:
			return (
				<div className={"flex items-center p-3 justify-between"}>
					<p className={"font-normal"}>
						{tc("projects:manage:dialog:upgrade package", {
							name: change.displayName,
							previousVersion: toVersionString(change.previousVersion),
							version: toVersionString(change.version),
						})}
					</p>
					<ChangelogButton url={change.changelogUrl} />
				</div>
			);
		case PackageChangeCategory.Downgrade:
			return (
				<div className={"flex items-center p-3 justify-between"}>
					<p className={"font-normal"}>
						{tc("projects:manage:dialog:downgrade package", {
							name: change.displayName,
							previousVersion: toVersionString(change.previousVersion),
							version: toVersionString(change.version),
						})}
					</p>
					<ChangelogButton url={change.changelogUrl} />
				</div>
			);
		case PackageChangeCategory.InstallNew:
			return (
				<div className={"flex items-center p-3 justify-between"}>
					<p className={"font-normal"}>
						{tc("projects:manage:dialog:install package", {
							name: change.displayName,
							version: toVersionString(change.version),
						})}
					</p>
					<ChangelogButton url={change.changelogUrl} />
				</div>
			);
		case PackageChangeCategory.UninstallRequested:
			return (
				<div className={"flex items-center p-3 justify-between"}>
					<p className={"font-normal"}>
						{tc("projects:manage:dialog:uninstall package as requested", {
							name: change.displayName,
						})}
					</p>
				</div>
			);
		case PackageChangeCategory.UninstallUnused:
			return (
				<div className={"flex items-center p-3 justify-between"}>
					<p className={"font-normal"}>
						{tc("projects:manage:dialog:uninstall package as unused", {
							name: change.displayName,
						})}
					</p>
				</div>
			);
		case PackageChangeCategory.UninstallLegacy:
			return (
				<div className={"flex items-center p-3 justify-between"}>
					<p className={"font-normal"}>
						{tc("projects:manage:dialog:uninstall package as legacy", {
							name: change.displayName,
						})}
					</p>
				</div>
			);
		case PackageChangeCategory.Reinstall:
			return (
				<div className={"flex items-center p-3 justify-between"}>
					<p className={"font-normal select-text"}>
						{tc("projects:manage:dialog:reinstall package", {
							name: change.displayName,
							version: toVersionString(change.version),
						})}
					</p>
					<ChangelogButton url={change.changelogUrl} />
				</div>
			);
	}
}

enum PackageChangeCategory {
	InstallNew = 0,
	UpgradeMajor = 1,
	Upgrade = 2,
	Downgrade = 3,
	UninstallRequested = 4,
	UninstallUnused = 5,
	UninstallLegacy = 6,
	Reinstall = 7,
}

type PackageChangeDisplayInformation = {
	packageId: string;
	displayName: string;
} & (
	| {
			type: PackageChangeCategory.UpgradeMajor;
			version: TauriVersion;
			previousVersion: TauriVersion;
			changelogUrl: string | null;
	  }
	| {
			type: PackageChangeCategory.Upgrade;
			version: TauriVersion;
			previousVersion: TauriVersion;
			changelogUrl: string | null;
	  }
	| {
			type: PackageChangeCategory.Downgrade;
			version: TauriVersion;
			previousVersion: TauriVersion;
			changelogUrl: string | null;
	  }
	| {
			type: PackageChangeCategory.Reinstall;
			version: TauriVersion;
			changelogUrl: string | null;
	  }
	| {
			type: PackageChangeCategory.InstallNew;
			version: TauriVersion;
			changelogUrl: string | null;
	  }
	| {
			type: PackageChangeCategory.UninstallRequested;
	  }
	| {
			type: PackageChangeCategory.UninstallUnused;
	  }
	| {
			type: PackageChangeCategory.UninstallLegacy;
	  }
);

function categorizeChange(
	pkgId: string,
	change: TauriPackageChange,
	installedPackages: Map<string, TauriBasePackageInfo>,
): PackageChangeDisplayInformation {
	if (change.InstallNew !== undefined) {
		const name = change.InstallNew.display_name ?? change.InstallNew.name;

		const installed = installedPackages.get(pkgId);
		if (installed == null) {
			return {
				packageId: pkgId,
				displayName: name,
				type: PackageChangeCategory.InstallNew,
				version: change.InstallNew.version,
				changelogUrl: change.InstallNew.changelog_url,
			};
		} else {
			const compare = compareVersion(
				installed.version,
				change.InstallNew.version,
			);
			switch (compare) {
				case 1:
					return {
						packageId: pkgId,
						displayName: name,
						type: PackageChangeCategory.Downgrade,
						version: change.InstallNew.version,
						previousVersion: installed.version,
						changelogUrl: change.InstallNew.changelog_url,
					};
				case 0:
					return {
						packageId: pkgId,
						displayName: name,
						type: PackageChangeCategory.Reinstall,
						version: change.InstallNew.version,
						changelogUrl: change.InstallNew.changelog_url,
					};
				case -1:
					if (
						isUpgradingMajorly(
							pkgId,
							installed.version,
							change.InstallNew.version,
						)
					) {
						return {
							packageId: pkgId,
							displayName: name,
							type: PackageChangeCategory.UpgradeMajor,
							version: change.InstallNew.version,
							previousVersion: installed.version,
							changelogUrl: change.InstallNew.changelog_url,
						};
					} else {
						return {
							packageId: pkgId,
							displayName: name,
							type: PackageChangeCategory.Upgrade,
							version: change.InstallNew.version,
							previousVersion: installed.version,
							changelogUrl: change.InstallNew.changelog_url,
						};
					}
			}
		}
	} else {
		const name = installedPackages.get(pkgId)?.display_name ?? pkgId;
		switch (change.Remove) {
			case "Requested":
				return {
					packageId: pkgId,
					displayName: name,
					type: PackageChangeCategory.UninstallRequested,
				};
			case "Legacy":
				return {
					packageId: pkgId,
					displayName: name,
					type: PackageChangeCategory.UninstallLegacy,
				};
			case "Unused":
				return {
					packageId: pkgId,
					displayName: name,
					type: PackageChangeCategory.UninstallUnused,
				};
		}
	}
}

function isUpgradingMajorly(
	pkgId: string,
	prevVersion: TauriVersion,
	newVersion: TauriVersion,
): boolean {
	function firstNonZeroVersionNum(version: TauriVersion): number {
		if (version.major !== 0) return version.major;
		if (version.minor !== 0) return version.minor;
		return version.patch;
	}

	// generic case: non-zero first version number will be the major version
	if (
		firstNonZeroVersionNum(prevVersion) !== firstNonZeroVersionNum(newVersion)
	) {
		return true;
	}
	// Special case: VRChat SDK uses Branding.Breaking.Bumps.
	// Therefore the second number bump means major version bump.
	// See https://vcc.docs.vrchat.com/vpm/packages/#brandingbreakingbumps
	// See https://feedback.vrchat.com/sdk-bug-reports/p/feedback-please-dont-make-vrcsdk-to-4x-unless-as-big-breaking-changes-as-2-to-3
	if (
		pkgId === "com.vrchat.avatars" ||
		pkgId === "com.vrchat.worlds" ||
		pkgId === "com.vrchat.base"
	) {
		if (prevVersion.minor !== newVersion.minor) {
			return true;
		}
	}

	// No conditions met so it's not major bump
	return false;
}

function ChangelogButton({ url }: { url?: string | null }) {
	if (url == null) return null;
	try {
		const parsed = new URL(url);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return (
				<Button
					className={"ml-1 px-2"}
					size={"sm"}
					onClick={() => commands.utilOpenUrl(url)}
				>
					<ExternalLink>
						{tc("projects:manage:button:see changelog")}
					</ExternalLink>
				</Button>
			);
		}
	} catch {}

	return null;
}

function MissingDependenciesDialog({
	dependencies,
	dialog,
}: {
	dependencies: [pkg: string, range: string][];
	dialog: DialogContext<void>;
}) {
	return (
		<div>
			<DialogTitle className={"text-destructive"}>
				<CircleAlert className="size-6 inline" />{" "}
				{tc("projects:manage:dialog:missing dependencies")}
			</DialogTitle>
			<div>
				<p className={"whitespace-normal"}>
					{tc("projects:manage:dialog:missing dependencies description")}
				</p>
				<ul className={"list-disc ml-4 mt-2"}>
					{dependencies.map(([dep, range]) => (
						<li key={dep}>
							{dep} version {range}
						</li>
					))}
				</ul>
			</div>
			<DialogFooter>
				<Button onClick={() => dialog.close()}>
					{tc("general:button:close")}
				</Button>
			</DialogFooter>
		</div>
	);
}
