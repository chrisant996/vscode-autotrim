import { window } from 'vscode';

export enum LogLevel {
    none,
    error,
    warn,
    info,
    log
}

export interface ILogger
{
    setLogLevel(level: LogLevel): void;
    getLogLevel(): LogLevel;
    setPrefix(prefix: string): void;
    error(message: string): void;
    warn(message: string): void;
    log(message: string): void;
    info(message: string): void;
}

export class Logger implements ILogger
{
    private static instance: Logger = new Logger();
    private level: LogLevel;
    private prefix: string;
    private typeNames: string[] = [];

    private constructor(prefix?: string, level?: LogLevel) {
        if (!Logger.instance) {
            Logger.instance = this;
            this.setPrefix(prefix);
            this.level = level || LogLevel.error;
            this.typeNames[LogLevel.none]  = ' none';
            this.typeNames[LogLevel.log]   = '  log';
            this.typeNames[LogLevel.info]  = ' info';
            this.typeNames[LogLevel.warn]  = ' warn';
            this.typeNames[LogLevel.error] = 'error';
        }
    }

    public static getInstance(): ILogger {
        return Logger.instance;
    }

    public setPrefix(prefix: string): void {
        this.prefix = prefix ? prefix + ': ' : '';
    }

    public setLogLevel(level: LogLevel): void {
        this.level = level;
    }

    public getLogLevel(): LogLevel {
        return this.level;
    }

    public log(message: string): void {
        if (this.level >= LogLevel.log) {
            console.log(`${this.prefix}${this.typeNames[LogLevel.log]} - ${message}`);
        }
    }

    public info(message: string): void {
        if (this.level >= LogLevel.info) {
            console.info(`${this.prefix}${this.typeNames[LogLevel.info]} - ${message}`);
        }
    }

    public warn(message: string): void {
        if (this.level >= LogLevel.warn) {
            console.warn(`${this.prefix}${this.typeNames[LogLevel.warn]} - ${message}`);
        }
    }

    public error(message: string): void {
        if (this.level >= LogLevel.error) {
            console.error(`${this.prefix} - ${this.typeNames[LogLevel.error]} - ${message}`);
            window.showErrorMessage(message);
        }
    }
}
