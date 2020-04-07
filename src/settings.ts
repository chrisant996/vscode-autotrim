import * as vscode from 'vscode';
import { LogLevel, ILogger, Logger } from './logger';

export interface AutoTrimSettings {
    readonly highlightEvenWhileEditing: boolean,
    readonly highlightTrailing: boolean,
    readonly includeEmptyLines: boolean,
    readonly statusBar: boolean,
    readonly textEditorDecorationType: vscode.TextEditorDecorationType

    ignoreDocument(document: vscode.TextDocument): boolean;
}

export class Settings implements AutoTrimSettings {

    private static instance: Settings = new Settings();
    private logger!: ILogger;
    private languagesToIgnore: Set<string> = new Set<string>();
    private schemesToIgnore: Set<string> = new Set<string>();

    //#region AutoTrimSettings interface

    highlightEvenWhileEditing: boolean;
    highlightTrailing: boolean;
    includeEmptyLines: boolean = true;
    statusBar: boolean;
    textEditorDecorationType: vscode.TextEditorDecorationType | null = null;

    ignoreDocument(document: vscode.TextDocument): boolean {
        return this.languagesToIgnore.has(document.languageId.toLowerCase()) || this.schemesToIgnore.has(document.uri.scheme.toLowerCase());
    }

    //#endregion

    private constructor() {
        if (!Settings.instance) {
            Settings.instance = this;
            this.logger = Logger.getInstance();
            this.refresh();
        }
    }

    public static getInstance(): Settings {
        return Settings.instance;
    }

    public refresh(): void {
        let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('autotrim');
        this.highlightEvenWhileEditing = config.get<boolean>('highlightTrailingEvenWhileEditing');
        this.languagesToIgnore = this.getSetFromString(config.get<string>('ignoreSyntax'));
        this.schemesToIgnore = this.getSetFromString(config.get<string>('ignoreScheme'));
        this.statusBar = config.get<boolean>('statusBar');
        this.logger.setLogLevel(LogLevel[config.get<keyof typeof LogLevel>('logLevel')]);
        this.logger.setPrefix('AutoTrim');
        this.logger.log('Configuration loaded');

        const wasHighlightTrailing = this.highlightTrailing;
        this.highlightTrailing = config.get<boolean>('highlightTrailing');

        if (wasHighlightTrailing && !this.highlightTrailing) {
            this.textEditorDecorationType.dispose();
            this.textEditorDecorationType = null;
        } else {
            this.textEditorDecorationType = this.getTextEditorDecorationType();
        }
    }

    public resetToDefaults(): void {
        let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('autotrim');
        config.update('logLevel', undefined, true);
        config.update('highlightTrailingEvenWhileEditing', undefined, true);
        config.update('highlightTrailing', undefined, true);
        config.update('ignoreSyntax', undefined, true);
        config.update('ignoreScheme', undefined, true);
        config.update('statusBar', undefined, true);
        config.update('backgroundColor', undefined, true);
        config.update('borderColor', undefined, true);
        config.update('borderRadius', undefined, true);
        config.update('borderWidth', undefined, true);
        config.update('textColor', undefined, true);
        this.refresh();
    }

    private getSetFromString(s: string): Set<string> {
        let set = new Set<string>();
        s.split(' ').forEach((element: string) => {
            set.add(element);
        });
        return set;
    }

    private getTextEditorDecorationType(): vscode.TextEditorDecorationType {
        const config = vscode.workspace.getConfiguration('autotrim');
        return vscode.window.createTextEditorDecorationType({
            borderRadius: config.get<string>('borderRadius'),
            borderWidth: config.get<string>('borderWidth'),
            borderStyle: "solid",
            backgroundColor: config.get<string>('backgroundColor'),
            borderColor: config.get<string>('borderColor'),
            // color: config.get<string>('colorForText')
            //
            //$ REVIEW: Can't apply 'color' because VSCode's whitespace
            //highlighting overrides it.
            //
            // Here's the package.json block in case a workaround is found:
            // "autotrim.colorForText": {
            //     "type": "string",
            //     "default": "rgba(255,0,0,.5)",
            //     "description": "text color for highlighted trailing whitespace"
            // }
        });
    }

    dispose() {
        if (this.textEditorDecorationType) {
            this.textEditorDecorationType.dispose();
            this.textEditorDecorationType = null;
        }
    }
}
