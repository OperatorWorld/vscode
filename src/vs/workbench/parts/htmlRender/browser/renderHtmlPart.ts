/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./renderHtmlPart';
import { localize } from 'vs/nls';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { onUnexpectedError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { DefaultConfig } from 'vs/editor/common/config/defaultConfig';
import { IEditorOptions, IModel } from 'vs/editor/common/editorCommon';
import { $, Dimension, Builder } from 'vs/base/browser/builder';
import { empty as EmptyDisposable, IDisposable, dispose, IReference } from 'vs/base/common/lifecycle';
import { EditorOptions, EditorInput } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { Position } from 'vs/platform/editor/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { isLightTheme, isDarkTheme } from 'vs/platform/theme/common/themes';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { RenderHtmlInput } from 'vs/workbench/parts/htmlRender/common/renderHtmlInput';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITextModelResolverService, ITextEditorModel } from 'vs/editor/common/services/resolverService';

/**
 * An implementation of editor for showing HTML content.
 */
export class RenderHtmlPart extends BaseEditor {

	static ID: string = 'workbench.editor.renderHtmlPart';

	private _disposables: IDisposable[] = [];
	private _contentDisposables: IDisposable[] = [];
	private _styles: HTMLStyleElement;
	private _content: HTMLDivElement;
	private _scrollbar: DomScrollableElement;

	private _modelRef: IReference<ITextEditorModel>;
	private get _model(): IModel { return this._modelRef.object.textEditorModel; }
	private _modelChangeSubscription = EmptyDisposable;
	private _themeChangeSubscription = EmptyDisposable;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@ITextModelResolverService private _textModelResolverService: ITextModelResolverService,
		@IThemeService private _themeService: IThemeService,
		@IOpenerService private _openerService: IOpenerService,
		@IInstantiationService private _instantiationService: IInstantiationService
	) {
		super(RenderHtmlPart.ID, telemetryService);
	}

	dispose(): void {
		// remove from dom
		this._contentDisposables = dispose(this._contentDisposables);
		this._disposables = dispose(this._disposables);

		// unhook listeners
		this._themeChangeSubscription.dispose();
		this._modelChangeSubscription.dispose();

		// dipose model ref
		if (this._modelRef) {
			this._modelRef.dispose();
			this._modelRef = undefined;
		}
		super.dispose();
	}

	public createEditor(parent: Builder): void {
		const container = parent.getHTMLElement();
		container.classList.add('renderHtmlPart');

		this._styles = document.createElement('style');
		container.appendChild(this._styles);

		this._content = document.createElement('div');
		this._content.style.paddingLeft = '20px';

		this._scrollbar = new DomScrollableElement(this._content, {
			canUseTranslate3d: false,
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Auto
		});
		this._disposables.push(this._scrollbar);
		container.appendChild(this._scrollbar.getDomNode());

		this._content.addEventListener('click', event => {
			let node = event.target;
			if (node instanceof HTMLAnchorElement && node.href) {
				let baseElement = window.document.getElementsByTagName('base')[0];
				if (baseElement && node.href.indexOf(baseElement.href) >= 0 && node.hash) {
					let scrollTarget = window.document.getElementById(node.hash.substr(1, node.hash.length - 1));
					if (scrollTarget) {
						scrollTarget.scrollIntoView();
					}
				} else {
					this._openerService.open(URI.parse(node.href));
				}
				event.preventDefault();
			}
		});
	}

	public changePosition(position: Position): void {
		// what this actually means is that we got reparented. that
		// has caused the webview to stop working and we need to reset it
		this._doSetVisible(false);
		this._doSetVisible(true);

		super.changePosition(position);
	}

	public setEditorVisible(visible: boolean, position?: Position): void {
		this._doSetVisible(visible);
		super.setEditorVisible(visible, position);
	}

	private _doSetVisible(visible: boolean): void {
		if (!visible) {
			this._themeChangeSubscription.dispose();
			this._modelChangeSubscription.dispose();
			this._contentDisposables = dispose(this._contentDisposables);
		} else {
			// this._themeChangeSubscription = this._themeService.onDidColorThemeChange(themeId => this.webview.style(themeId));
			// this.webview.style(this._themeService.getColorTheme());

			if (this._hasValidModel()) {
				this._modelChangeSubscription = this._model.onDidChangeContent(() => this.updateContent());
				this.updateContent();
			}
		}
	}

	private _hasValidModel(): boolean {
		return this._modelRef && this._model && !this._model.isDisposed();
	}

	public layout(dimension: Dimension): void {
		const {width, height} = dimension;
		// we take the padding we set on create into account
		this._content.style.width = `${width}px`;
		this._content.style.height = `${height}px`;
		// this._content.size(dimension.width, dimension.height);
		this._scrollbar.scanDomNode();
	}

	public focus(): void {
		this._content.focus();
	}

	public clearInput(): void {
		if (this._modelRef) {
			this._modelRef.dispose();
			this._modelRef = undefined;
		}
		super.clearInput();
	}

	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {

		if (this.input && this.input.matches(input) && this._hasValidModel()) {
			return TPromise.as(undefined);
		}

		if (this._modelRef) {
			this._modelRef.dispose();
		}
		this._modelChangeSubscription.dispose();

		if (!(input instanceof RenderHtmlInput)) {
			return TPromise.wrapError<void>('Invalid input');
		}

		return super.setInput(input, options).then(() => {
			const resourceUri = (<RenderHtmlInput>input).getResource();
			return this._textModelResolverService.createModelReference(resourceUri).then(ref => {
				const model = ref.object;

				if (model instanceof BaseTextEditorModel) {
					this._modelRef = ref;
				}

				if (!this._model) {
					return TPromise.wrapError<void>(localize('html.voidInput', "Invalid editor input."));
				}

				this._modelChangeSubscription = this._model.onDidChangeContent(() => this.updateContent());
				// this.webview.baseUrl = resourceUri.toString(true);
				this.updateContent();
			});
		});
	}

	private updateContent() {
		this._content.innerHTML = this._model.getLinesContent().join('\n');
		const editorDivs = this._content.querySelectorAll('.embeddedEditor');
		for (let i = 0; i < editorDivs.length; i++) {
			const editorDiv = $(<HTMLDivElement>editorDivs.item(i));
			const src = editorDiv.attr('data-src');
			if (!src) {
				continue;
			}

			editorDiv.div({ 'class': 'preview inline' }, (div: Builder) => {

				var options: IEditorOptions = {
					scrollBeyondLastLine: false,
					scrollbar: DefaultConfig.editor.scrollbar,
					overviewRulerLanes: 3,
					fixedOverflowWidgets: true,
					lineNumbersMinChars: 1,
					theme: this._themeService.getColorTheme(),
				};

				const editor = this._instantiationService.createInstance(EmbeddedCodeEditorWidget, div.getHTMLElement(), options, null);
				this._contentDisposables.push(editor);
				// this._previewContainer = div.hide();
				// this._previewNotAvailableMessage = Model.createFromString(nls.localize('missingPreviewMessage', "no preview available"));

				const uri = URI.file(new URL(src, this._model.uri.toString()).pathname);
				this._textModelResolverService.createModelReference(uri).then(ref => {

					const model = ref.object;
					if (model) {
						this._contentDisposables.push(ref);
						editor.setModel(model.textEditorModel);
						const lineHeight = editor.getConfiguration().lineHeight;
						const height = model.textEditorModel.getLineCount() * lineHeight;
						div.style({ height: height + 'px', width: '100%' });
						this.style(this._themeService.getColorTheme());
						editor.layout();
					} else {
						// this._preview.setModel(this._previewNotAvailableMessage);
						ref.dispose();
					}

				}, onUnexpectedError);
			});
		}
	}

	style(themeId: string): void {
		type ApiThemeClassName = 'vscode-light' | 'vscode-dark' | 'vscode-high-contrast';
		let activeTheme: ApiThemeClassName;

		if (isLightTheme(themeId)) {
			activeTheme = 'vscode-light';

		} else if (isDarkTheme(themeId)) {
			activeTheme = 'vscode-dark';

		} else {
			activeTheme = 'vscode-high-contrast';
		}

		this._content.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast');
		// this._content.classList.add(activeTheme);
	}
}
