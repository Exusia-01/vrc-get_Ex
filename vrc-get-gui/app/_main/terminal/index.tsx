/*
 * Copyright (c) 2023 anatawa12 and other contributors
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org.
 */

"use client";

// ALCOM-Ex: terminal page.
//
// Commands are executed by the Rust backend (ex_terminal_run) with the
// working directory locked to the selected Unity project folder, so the
// vrc-get CLI and other project tooling can be driven directly from the
// GUI. A few commands are handled inside the page itself:
//   help            - show help
//   clear           - clear the output
//   vrc-get version - print the ALCOM-Ex version
//   vrc-get help    - same as help
// Everything else is passed to the OS shell inside the project folder
// (for example `vrc-get install <package>` when the vrc-get CLI is
// installed, or any other project command).

import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ExProjectSelector } from "@/components/ex-project-selector";
import { HNavBar, HNavBarText, VStack } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { commands } from "@/lib/bindings";
import { exSettingsQuery, saveExSettings } from "@/lib/ex-settings";
import { tc, tt } from "@/lib/i18n";
import { toastThrownError } from "@/lib/toast";

export const Route = createFileRoute("/_main/terminal/")({
	component: Page,
});

type Line = { text: string; kind: "input" | "output" | "error" | "system" };

function Page() {
	const exSettings = useQuery(exSettingsQuery);
	const [projectPath, setProjectPath] = useState("");
	const [lines, setLines] = useState<Line[]>([
		{ text: tc("ex:terminal:welcome"), kind: "system" },
	]);
	const [input, setInput] = useState("");
	const [history, setHistory] = useState<string[]>([]);
	const historyIndex = useRef(-1);
	const outputRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!projectPath && exSettings.data?.terminal.last_project_path) {
			setProjectPath(exSettings.data.terminal.last_project_path);
		}
	}, [exSettings.data, projectPath]);

	useEffect(() => {
		outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
	}, [lines]);

	const changeProject = (path: string) => {
		setProjectPath(path);
		if (exSettings.data) {
			void saveExSettings({
				...exSettings.data,
				terminal: { ...exSettings.data.terminal, last_project_path: path },
			}).catch((e) => console.error(e));
		}
	};

	const append = (newLines: Line[]) =>
		setLines((prev) => [...prev.slice(-1000), ...newLines]);

	const run = useMutation({
		mutationFn: async (command: string) =>
			await commands.exTerminalRun(projectPath, command),
		onSuccess: (output, command) => {
			const newLines: Line[] = [];
			if (output.stdout)
				newLines.push({ text: output.stdout.replace(/\n$/, ""), kind: "output" });
			if (output.stderr)
				newLines.push({ text: output.stderr.replace(/\n$/, ""), kind: "error" });
			if (output.timed_out) {
				newLines.push({ text: tc("ex:terminal:timed out"), kind: "error" });
			} else if (output.exit_code !== 0 && output.exit_code != null) {
				newLines.push({
					text: tt("ex:terminal:exit code", { code: output.exit_code }),
					kind: "error",
				});
			}
			append(newLines);
			void command;
		},
		onError: (e) => {
			console.error(e);
			toastThrownError(e);
		},
	});

	const submit = async () => {
		const command = input.trim();
		setInput("");
		historyIndex.current = -1;
		if (!command) return;
		setHistory((prev) => [command, ...prev].slice(0, 100));
		append([{ text: `${promptLabel()} ${command}`, kind: "input" }]);

		const lower = command.toLowerCase();
		if (lower === "clear") {
			setLines([]);
			return;
		}
		if (lower === "help" || lower === "vrc-get help" || lower === "vrc-get") {
			append([{ text: tc("ex:terminal:help"), kind: "system" }]);
			return;
		}
		if (lower === "vrc-get version" || lower === "vrc-get --version" || lower === "vrc-get -v") {
			try {
				const version = await commands.utilGetVersion();
				append([{ text: `ALCOM-Ex v${version}`, kind: "output" }]);
			} catch (e) {
				toastThrownError(e);
			}
			return;
		}
		if (!projectPath) {
			append([{ text: tc("ex:terminal:no project"), kind: "error" }]);
			return;
		}
		run.mutate(command);
	};

	const promptLabel = () => {
		const name = projectPath.split(/[\\/]/).filter(Boolean).pop();
		return name ? `${name}>` : ">";
	};

	return (
		<VStack className={"h-full"}>
			<HNavBar
				leading={<HNavBarText>{tc("ex:terminal")}</HNavBarText>}
				trailing={
					<Button
						variant={"ghost"}
						onClick={() => setLines([])}
					>
						{tc("ex:terminal:button:clear")}
					</Button>
				}
			/>
			<p className={"text-sm whitespace-normal"}>
				{tc("ex:terminal:description")}
			</p>
			<ExProjectSelector value={projectPath} onChange={changeProject} />
			<Card className={"flex flex-col grow min-h-0 p-0 overflow-hidden"}>
				<div
					ref={outputRef}
					className={
						"grow overflow-y-auto bg-neutral-950 text-neutral-100 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all"
					}
				>
					{lines.map((line, i) => (
						<div
							key={i}
							className={
								line.kind === "error"
									? "text-red-400"
									: line.kind === "input"
										? "text-emerald-300"
										: line.kind === "system"
											? "text-sky-300"
											: undefined
							}
						>
							{line.text}
						</div>
					))}
					{run.isPending && (
						<div className={"text-neutral-400"}>{tc("ex:terminal:running")}</div>
					)}
				</div>
				<div
					className={
						"flex items-center gap-2 border-t border-input bg-background px-3 py-2"
					}
				>
					<span className={"font-mono text-xs shrink-0"}>{promptLabel()}</span>
					<input
						className={
							"grow bg-transparent outline-none font-mono text-sm disabled:opacity-50"
						}
						value={input}
						disabled={run.isPending}
						placeholder={tc("ex:terminal:input placeholder")}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								void submit();
							} else if (e.key === "ArrowUp") {
								e.preventDefault();
								const next = Math.min(
									historyIndex.current + 1,
									history.length - 1,
								);
								if (history[next]) {
									historyIndex.current = next;
									setInput(history[next]);
								}
							} else if (e.key === "ArrowDown") {
								e.preventDefault();
								const next = historyIndex.current - 1;
								historyIndex.current = Math.max(next, -1);
								setInput(next >= 0 ? history[next] : "");
							}
						}}
						spellCheck={false}
						autoFocus
					/>
				</div>
			</Card>
		</VStack>
	);
}
