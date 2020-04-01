import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(new LineTrimmer());
}

export function deactivate() {
}

type TrimCallback = (range: vscode.Range) => void;

class StatusBar {
    private _item: vscode.StatusBarItem;

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

        this._item.text = `$(${trim ? "filter" : "circle-slash"}) Trim`;
        this._item.tooltip = trim ? "Automatically trim trailing whitespace from edited lines" : "Paused:  automatic trim is paused for this file";
        this._item.color = trim ? "#ffffff" : "#ffffff7f";

        this._item.show();
    }
}

class LineTrimmer {
    private _disposables: vscode.Disposable[] = [];
    private _lines = new WeakMap<any, Set<number>>();
    private _paused = new Set<any>();
    private _debugMode: number = 0;
    private _status: StatusBar | undefined = undefined;

    constructor() {
        this._debugMode = vscode.workspace.getConfiguration('autotrim').debugMode;
        this._disposables.push(
            vscode.window.onDidChangeActiveTextEditor(this.onChangeActiveEditor, this),
            vscode.window.onDidChangeTextEditorSelection(this.onChangeSelection, this),
            vscode.workspace.onDidChangeTextDocument(this.onChangeDocument, this),
            vscode.workspace.onWillSaveTextDocument(this.onWillSaveDocument, this),
            vscode.workspace.onDidChangeConfiguration(this.onChangeConfiguration, this),
            vscode.commands.registerCommand("autotrim.pauseFile", this.pauseFile, this)
        );
        if (vscode.workspace.getConfiguration('autotrim').statusBar === true) {
            this._status = new StatusBar();
            this._status.update(vscode.window.activeTextEditor, this._paused);
        }
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
    }

    private async onChangeActiveEditor(e: vscode.TextEditor) {
        if (this._status) {
            this._status.update(e, this._paused);
        }
    }

    private async onChangeSelection(e: vscode.TextEditorSelectionChangeEvent) {
        // If the document is paused or has no ranges to be processed => bail.
        const doc = e.textEditor.document;
        if (this._paused.has(doc.uri.fsPath) || !this._lines.get(doc)) {
            return;
        }

        // Process pending lines and make corresponding deletions.
        await e.textEditor.edit(ed => {
            this.processLines(doc, e.selections, (trimRange) => {
                ed.delete(trimRange);
            })
        });
    }

    private async onChangeDocument(e: vscode.TextDocumentChangeEvent) {
        // If the document is paused => bail.
        if (this._paused.has(e.document)) {
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

        if (this._debugMode > 0) {
            console.warn("watching lines:");
            watchedLines.forEach(n => console.log(`  watching ${n}`));
        }
    }

    private async onWillSaveDocument(e: vscode.TextDocumentWillSaveEvent) {
        // If the document has no ranges to be processed, there's nothing to do.
        if (!this._lines.get(e.document)) {
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
        if (cfg.affectsConfiguration('autotrim.debugMode')) {
            this._debugMode = vscode.workspace.getConfiguration('autotrim').debugMode;
        }
        if (cfg.affectsConfiguration('autotrim.statusBar')) {
            if (vscode.workspace.getConfiguration('autotrim').statusBar === true) {
                if (!this._status) {
                    this._status = new StatusBar()
                    this._status.update(vscode.window.activeTextEditor, this._paused);
                }
            } else {
                if (this._status) {
                    this._status.dispose();
                    this._status = undefined;
                }
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

        if (this._debugMode > 0) { console.warn("processLines:"); }

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
                    if (this._debugMode > 0) { console.log(`  trim!  line ${lineNum}, last ${match[2].length} characters of "${line.text}"`); }
                    if (this._debugMode < 2) { callback(new vscode.Range(lineNum, line.text.length - match[2].length, lineNum, line.text.length)); }
                } else {
                    if (this._debugMode > 0) { console.log(`  no trailing white on line ${lineNum}`); }
                }
                watchedLines.delete(lineNum);
            }
        });
    }

    dispose() {
        this._disposables.forEach(d => d.dispose());
        if (this._status) {
            this._status.dispose();
        }
    }
}
