/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position as EditorPosition } from 'vs/platform/editor/common/editor';
import { RenderHtmlInput } from '../common/renderHtmlInput';
import { RenderHtmlPart } from 'vs/workbench/parts/htmlRender/browser/renderHtmlPart';
import { Registry } from 'vs/platform/platform';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';

// --- Register Editor
(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(RenderHtmlPart.ID,
	localize('renderHtml.editor.label', "Render Html"),
	'vs/workbench/parts/htmlRender/browser/renderHtmlPart',
	'RenderHtmlPart'),
	[new SyncDescriptor(RenderHtmlInput)]);

CommandsRegistry.registerCommand('_workbench.renderHtml', function (accessor: ServicesAccessor, resource: URI | string, position?: EditorPosition, label?: string) {

	const uri = resource instanceof URI ? resource : URI.parse(resource);
	label = label || uri.fsPath;

	let input: RenderHtmlInput;

	// Find already opened HTML input if any
	const stacks = accessor.get(IEditorGroupService).getStacksModel();
	const targetGroup = stacks.groupAt(position) || stacks.activeGroup;
	if (targetGroup) {
		const existingInput = targetGroup.getEditor(uri);
		if (existingInput instanceof RenderHtmlInput) {
			input = existingInput;
		}
	}

	// Otherwise, create new input and open it
	if (!input) {
		input = accessor.get(IInstantiationService).createInstance(RenderHtmlInput, label, '', uri);
	} else {
		input.setName(label); // make sure to use passed in label
	}

	return accessor.get(IWorkbenchEditorService)
		.openEditor(input, { pinned: true }, position)
		.then(editor => true);
});
