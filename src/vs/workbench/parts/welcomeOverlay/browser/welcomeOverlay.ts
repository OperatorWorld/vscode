/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./welcomeOverlay';
import { $ } from 'vs/base/browser/builder';
import * as errors from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/platform';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ShowAllCommandsAction } from 'vs/workbench/parts/quickopen/browser/commandsHandler';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Parts, IPartService } from 'vs/workbench/services/part/common/partService';

interface Key {
	id: string;
	arrow: string;
	label: string;
	command?: string;
	arrowLast?: boolean;
	withEditor?: boolean;
}

const keys: Key[] = [
	{
		id: 'explorer',
		arrow: '&larr;',
		label: 'File Explorer'
	},
	{
		id: 'search',
		arrow: '&larr;',
		label: 'Text Search'
	},
	{
		id: 'git',
		arrow: '&larr;',
		label: 'Git View'
	},
	{
		id: 'debug',
		arrow: '&larr;',
		label: 'Debug View'
	},
	{
		id: 'extensions',
		arrow: '&larr;',
		label: 'Extensions View'
	},
	{
		id: 'watermark',
		arrow: '&larrpl;',
		label: 'Command Hints',
		withEditor: false
	},
	{
		id: 'problems',
		arrow: '&larrpl;',
		label: 'Problems View'
	},
	{
		id: 'openfile',
		arrow: '&cudarrl;',
		label: 'File Properties',
		arrowLast: true,
		withEditor: true
	},
	{
		id: 'commandPalette',
		arrow: '&nwarr;',
		label: 'All Commands',
		command: ShowAllCommandsAction.ID
	},
];

export class WelcomeOverlayContribution implements IWorkbenchContribution {

	private toDispose: IDisposable[] = [];

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IPartService private partService: IPartService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		lifecycleService.onShutdown(this.dispose, this);
		if (!contextService.getWorkspace()) {
			telemetryService.isFirstSession().then(isFirstSession => {
				if (isFirstSession) {
					return this.partService.joinCreation().then(() => {
						this.create();
					});
				}
			}, errors.onUnexpectedError);
		}
	}

	public getId() {
		return 'vs.welcomeOverlay';
	}

	private create(): void {
		const container = this.partService.getContainer(Parts.EDITOR_PART);

		const overlay = $(container.parentElement)
			.div({ 'class': 'welcomeOverlay' });

		overlay.on('click', () => {
			overlay.display('none');
		}, this.toDispose);

		const editorOpen = !!this.editorService.getVisibleEditors().length;
		keys.filter(key => !('withEditor' in key) || key.withEditor === editorOpen)
			.forEach(({ id, arrow, label, command, arrowLast }) => {
				const div = $(overlay).div({ 'class': ['key', id] });
				if (!arrowLast) {
					$(div).span({ 'class': 'arrow' }).innerHtml(arrow);
				}
				$(div).span({ 'class': 'label' }).text(label);
				if (command) {
					const shortcut = this.keybindingService.lookupKeybindings(command)
						.slice(0, 1)
						.map(k => this.keybindingService.getLabelFor(k))[0];
					if (shortcut) {
						$(div).span({ 'class': 'shortcut' }).text(shortcut);
					}
				}
				if (arrowLast) {
					$(div).span({ 'class': 'arrow' }).innerHtml(arrow);
				}
			});
		$(overlay).div({ 'class': 'commandPalettePlaceholder' });
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WelcomeOverlayContribution);
