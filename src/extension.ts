import * as vscode from 'vscode';
import { ILogger, Logger, LogLevel } from './logger';
import { Settings } from './settings';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(new LineTrimmer());
}

export function deactivate() {
}

type TrimCallback = (range: vscode.Range) => void;

class StatusBar {
    private _item: vscode.StatusBarItem;
    private _settings = Settings.getInstance();

    constructor() {
        this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        this._item.command = "autotrim.pauseFile";
    }

    public dispose() {
        this._item.dispose();
    }

    public update(editor: vscode.TextEditor, paused: Set<any>) {
        if (!editor) {
            this._item.hide();
            return;
        }
        
        const trim = !paused.has(editor.document);
        const ignore = this._settings.ignoreDocument(editor.document);

        if (ignore) {
            this._item.text = "$(circle-slash) Trim";
            this._item.tooltip = "Ignored:  Automatic trimming of whitespace is ignored for this file syntax or scheme";
            this._item.color = "#ffffff7f";
        } else if (trim) {
            this._item.text = "$(filter) Trim";
            this._item.tooltip = "Automatically trim trailing whitespace from edited lines";

        } else {
            this._item.text = "$(debug-pause) Trim";
            this._item.tooltip = "Paused:  Automatic trimming of whitespace is paused for this file";

        }
        this._item.color = trim && !ignore ? "#ffffff" : "#ffffff7f";

        this._item.show();
    }
}

class SelChange {
    fsPath: string;
    activeSels: number[] = [];

    constructor(fsPath:string, selections: ReadonlyArray<vscode.Selection>) {
        this.fsPath = fsPath;
        for (let sel of selections) {
            this.activeSels.push(sel.active.line);
        }
    }
}

class LineTrimmer {
    private _logger = Logger.getInstance();
    private _settings = Settings.getInstance();
    private _disposables: vscode.Disposable[] = [];
    private _lines = new WeakMap<any, Set<number>>();
    private _lastSelChange: SelChange | undefined = undefined;
    private _paused = new Set<any>();
    private _status: StatusBar | undefined = undefined;

    constructor() {
        this._disposables.push(
            vscode.window.onDidChangeActiveTextEditor(this.onChangeActiveEditor, this),
            vscode.window.onDidChangeTextEditorSelection(this.onChangeSelection, this),
            vscode.workspace.onDidChangeTextDocument(this.onChangeDocument, this),
            vscode.workspace.onWillSaveTextDocument(this.onWillSaveDocument, this),
            vscode.workspace.onDidChangeConfiguration(this.onChangeConfiguration, this),
            vscode.commands.registerCommand("autotrim.pauseFile", this.pauseFile, this)
        );
        if (this._settings.statusBar === true) {
            this._status = new StatusBar();
        }
        this.onChangeActiveEditor(vscode.window.activeTextEditor);
    }

    private async pauseFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const doc = editor.document;
        if (!doc) {
            return;
        }
        
        if (this._paused.has(doc)) {
            this._paused.delete(doc);
        } else {
            this._paused.add(doc);
            this._lines.delete(doc);
        }
        if (this._status) {
            this._status.update(editor, this._paused);
        }
        this.highlightTrailingSpaces(editor);
    }

    private async onChangeActiveEditor(e: vscode.TextEditor) {
        if (this._status) {
            this._status.update(e, this._paused);
        }
        this.highlightTrailingSpaces(e);
    }

    private didSelectionChange(e: vscode.TextEditorSelectionChangeEvent) {
        let changed = this._lastSelChange === undefined;

        if (!changed) {
            if (this._lastSelChange.fsPath !== e.textEditor.document.uri.fsPath ||
                this._lastSelChange.activeSels.length !== e.selections.length) {
                changed = true;
            }
        }

        if (!changed) {
            for (let index = 0; index < e.selections.length; index++) {
                if (e.selections[index].active.line !== this._lastSelChange.activeSels[index]) {
                    changed = true;
                    break;
                }
            }
        }

        if (changed) {
            this._lastSelChange = new SelChange(e.textEditor.document.uri.fsPath, e.selections);
        }

        return changed;
    }

    private async onChangeSelection(e: vscode.TextEditorSelectionChangeEvent) {
        // If the document is paused or has no ranges to be processed => bail.
        const doc = e.textEditor.document;
        if (this._paused.has(doc.uri.fsPath) || this._settings.ignoreDocument(doc) || !this._lines.get(doc)) {
            return;
        }

        // Process pending lines and make corresponding deletions.
        await e.textEditor.edit(ed => {
            this.processLines(doc, e.selections, (trimRange) => {
                ed.delete(trimRange);
            })
        }, { undoStopAfter: false, undoStopBefore: false });

        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document === e.textEditor.document) {
            if (this._lastSelChange === undefined || this.didSelectionChange(e)) {
                this.highlightTrailingSpaces(vscode.window.activeTextEditor);
            }
        }
    }

    private async onChangeDocument(e: vscode.TextDocumentChangeEvent) {
        // If the document is paused => bail.
        if (this._paused.has(e.document) || this._settings.ignoreDocument(e.document)) {
            return;
        }

        // Get collection of watched lines, or create a new collection.
        let watchedLines = this._lines.get(e.document);
        if (!watchedLines) {
            watchedLines = new Set<number>();
            this._lines.set(e.document, watchedLines);
        }

        // Iterate over the content changes.
        for (let chg of e.contentChanges) {
            const startLineDocument = chg.range.start.line;
            const endLineDocument = chg.range.end.line;
            const oldLength = endLineDocument - startLineDocument;
            const newLength = chg.text.split('\n').length;

            // Remove deleted lines.
            for (let deleteLine = startLineDocument; deleteLine <= endLineDocument; deleteLine++) {
                watchedLines.delete(deleteLine);
            }

            // Move lines per deletions.
            let applyDelta: number[] = [];
            watchedLines.forEach(line =>
            {
                if (line > endLineDocument) {
                    applyDelta.push(line);
                }
            });
            applyDelta.sort((a, b) => a - b);
            applyDelta.forEach(line =>
            {
                watchedLines.delete(line);
                watchedLines.add(line - oldLength);
            });

            // Move lines per insertions.
            applyDelta = [];
            watchedLines.forEach(line =>
            {
                if (line >= startLineDocument) {
                    applyDelta.push(line);
                }
            });
            applyDelta.sort((a, b) => b - a);
            applyDelta.forEach(line =>
            {
                watchedLines.delete(line);
                watchedLines.add(line + newLength - 1);
            });

            // Add new lines.
            for (let insertLine = startLineDocument; insertLine <= (startLineDocument + newLength - 1); insertLine++) {
                watchedLines.add(insertLine);
            }
        }

        this._logger.info(`watching ${watchedLines.size} line(s)`);
        watchedLines.forEach(n => this._logger.log(`  watching ${n}`));

        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document === e.document) {
            this.highlightTrailingSpaces(vscode.window.activeTextEditor);
        }
    }

    private async onWillSaveDocument(e: vscode.TextDocumentWillSaveEvent) {
        // If the document has no ranges to be processed or is ignored => do nothing.
        if (!this._lines.get(e.document) || this._settings.ignoreDocument(e.document)) {
            return;
        }

        // Promise to make an array of TextEdit actions.
        const promise = new Promise(resolve => {
            const edits: vscode.TextEdit[] = [];
            this.processLines(e.document, [], (trimRange) => {
                edits.push(vscode.TextEdit.delete(trimRange));
            });
            resolve(edits);
        });

        // Ask the event to wait for the promise.
        e.waitUntil(promise);
    }

    private async onChangeConfiguration(cfg: vscode.ConfigurationChangeEvent) {
        if (cfg.affectsConfiguration('autotrim')) {
            this._settings.refresh();

            if (cfg.affectsConfiguration('autotrim.statusBar')) {
                if (this._settings.statusBar === true) {
                    if (!this._status) {
                        this._status = new StatusBar()
                    }
                } else {
                    if (this._status) {
                        this._status.dispose();
                        this._status = undefined;
                    }
                }
            }

            // Refresh highlights in all editors.
            for (let editor of vscode.window.visibleTextEditors) {
                setTimeout(this.highlightTrailingSpaces, 50, editor);
            }

            // Refresh status bar (the 'ignore' status might have changed).
            if (this._status) {
                this._status.update(vscode.window.activeTextEditor, this._paused);
            }
        }
    }

    private processLines(doc: vscode.TextDocument, selections: readonly vscode.Selection[], callback: TrimCallback) {
        // If the document is paused => bail.
        if (this._paused.has(doc)) {
            return;
        }

        const watchedLines = this._lines.get(doc);
        const activeLines = new Set<number>(selections.map(sel => sel.active.line));

        this._logger.info(`processLines for ${doc.uri.fsPath}`);

        // Process the watched lines that don't have an active cursor on them.
        watchedLines.forEach(lineNum => {
            if (lineNum >= doc.lineCount) {
                watchedLines.delete(lineNum);
            } else if (!activeLines.has(lineNum) && doc.lineCount > lineNum) {
                const line = doc.lineAt(lineNum);
                if (!line) {
                    return;
                }
                if (doc.languageId === 'markdown' && line.text.match(/[^ ]  $/)) {
                    return;
                }
                const match = line.text.match(/(^|\S)(\s+)$/);
                if (match && match[2].length > 0) {
                    this._logger.log(`  trim!  line ${lineNum}, last ${match[2].length} characters of "${line.text}"`);
                    callback(new vscode.Range(lineNum, line.text.length - match[2].length, lineNum, line.text.length));
                } else {
                    this._logger.log(`  no trailing white on line ${lineNum}`);
                }
                watchedLines.delete(lineNum);
            }
        });
    }

    private highlightTrailingSpaces(editor: vscode.TextEditor): void {
        let ranges: vscode.Range[] | null = null;

        if (editor && this._settings.highlightTrailing) {
            if (this._paused.has(editor.document)) {
                ranges = [];
            } else {
                ranges = this.getRangesToHighlight(editor.document, editor.selections);
            }
            editor.setDecorations(this._settings.textEditorDecorationType, ranges);
        }

        if (this._logger.getLogLevel() >= LogLevel.info) {
            const debugTrailing = ranges.map(r => new vscode.Range(r.start.line, 0, r.end.line, 2));
            let debugWatched: vscode.Range[] = [];
            let set: Set<number> = this._lines.get(editor.document);
            if (set) {
                set.forEach(line => debugWatched.push(new vscode.Range(line, 0, line, 1)));
            }
            editor.setDecorations(this._settings.debugTrailingDecorationType, debugTrailing);
            editor.setDecorations(this._settings.debugWatchedDecorationType, debugWatched);
        }
    }

    private getRangesToHighlight(document: vscode.TextDocument, selections: vscode.Selection[]): vscode.Range[] {
        let ignoreLines: Set<number> | undefined = undefined;
        if (!this._settings.highlightEvenWhileEditing) {
            const docLines: Set<number> = this._lines.get(document);
            if (docLines) {
                ignoreLines = new Set<number>();
                for (let sel of selections) {
                    if (docLines.has(sel.active.line)) {
                        ignoreLines.add(sel.active.line);
                    }
                }
            }
        }
        return this.findTrailingSpaces(document, ignoreLines);
    }

    private findTrailingSpaces(document: vscode.TextDocument, ignoreLines: Set<number> | undefined): vscode.Range[] {
        if (this._settings.ignoreDocument(document)) {
            this._logger.log(`File ignored -- langauge ${document.languageId}, scheme ${document.uri.scheme}, fileName ${document.fileName}`);
            return [];
        } else {
            let offendingRanges: vscode.Range[] = [];
            const regexp: string = "([ \t]+)$";
            const noEmptyLinesRegexp: string = "\\S" + regexp;
            const offendingRangesRegexp: RegExp = new RegExp(this._settings.includeEmptyLines ? regexp : noEmptyLinesRegexp, "gm");
            const documentText: string = document.getText();
            const markdown = document.languageId === "markdown";

            let match: RegExpExecArray | null;
            // Loop through all the trailing spaces in the document.
            while ((match = offendingRangesRegexp.exec(documentText)) !== null) {
                let matchStart: number = (match.index + match[0].length - match[1].length),
                    matchEnd: number = match.index + match[0].length;
                let matchRange: vscode.Range = new vscode.Range(document.positionAt(matchStart), document.positionAt(matchEnd));
                // Ignore ranges which are empty (only containing a single line
                // ending).  Markdown treats "  " specially, so preserve those.
                if (!matchRange.isEmpty) {
                    if (!markdown || document.getText(matchRange) !== "  ") {
                        if (!ignoreLines || !ignoreLines.has(matchRange.start.line)) {
                            offendingRanges.push(matchRange);
                        }
                    }
                }
            }
            return offendingRanges;
        }
    }

    dispose() {
        this._disposables.forEach(d => d.dispose());
        if (this._status) {
            this._status.dispose();
        }
    }
}
