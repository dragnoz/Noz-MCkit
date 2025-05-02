// src/translations/translationStore.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Stores translation key-value pairs from all .lang files found in the workspace.
 */
export class TranslationStore {
    // Map<translationKey, Map<languageCode, translationText>>
    private translations: Map<string, Map<string, string>> = new Map();
    private langFilesFound: string[] = [];
    private isInitialized: boolean = false;

    constructor(private context: vscode.ExtensionContext, private outputChannel: vscode.OutputChannel) {}

    /**
     * Initializes the store by finding and parsing all .lang files.
     */
    public async initialize(): Promise<void> {
        this.outputChannel.appendLine('[TranslationStore] Initializing...');
        this.translations.clear();
        this.langFilesFound = [];

        const langFiles = await vscode.workspace.findFiles('**/*.lang', '**/node_modules/**');
        this.langFilesFound = langFiles.map(uri => uri.fsPath);
        this.outputChannel.appendLine(`[TranslationStore] Found ${langFiles.length} .lang files.`);

        for (const fileUri of langFiles) {
            try {
                const languageCode = this.getLanguageCodeFromPath(fileUri.fsPath);
                this.outputChannel.appendLine(`[TranslationStore] Parsing ${languageCode} from ${fileUri.fsPath}...`);
                const content = await vscode.workspace.fs.readFile(fileUri);
                const lines = Buffer.from(content).toString('utf-8').split(/\r?\n/);

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine && !trimmedLine.startsWith('#')) {
                        const parts = trimmedLine.split('=', 2);
                        if (parts.length === 2) {
                            const key = parts[0].trim();
                            const value = parts[1].trim();
                            if (key && value) {
                                if (!this.translations.has(key)) {
                                    this.translations.set(key, new Map());
                                }
                                this.translations.get(key)?.set(languageCode, value);
                            }
                        }
                    }
                }
            } catch (error) {
                this.outputChannel.appendLine(`[TranslationStore] Error parsing ${fileUri.fsPath}: ${error}`);
                vscode.window.showErrorMessage(`Error parsing language file: ${fileUri.fsPath}`);
            }
        }
        this.isInitialized = true;
        this.outputChannel.appendLine(`[TranslationStore] Initialization complete. Loaded ${this.translations.size} unique keys.`);

        // Optional: Set up watcher for .lang files
        this.setupWatcher();
    }

    /**
     * Gets all translations for a given key.
     * @param key The translation key (e.g., 'item.sword.name')
     * @returns A Map where keys are language codes (e.g., 'en_US') and values are the translated text, or undefined if the key is not found.
     */
    public getTranslations(key: string): Map<string, string> | undefined {
        if (!this.isInitialized) {
            this.outputChannel.appendLine('[TranslationStore] Warning: Store accessed before initialization.');
            // Optionally trigger initialization here if needed, but ideally it should be done at activation
        }
        return this.translations.get(key);
    }

    /**
     * Extracts the language code from a file path (e.g., 'en_US' from 'path/to/en_US.lang').
     */
    private getLanguageCodeFromPath(filePath: string): string {
        const fileName = path.basename(filePath, '.lang');
        // Basic check, might need refinement based on actual naming conventions
        return fileName; 
    }

    /**
     * Sets up a file system watcher to re-parse .lang files on change.
     */
    private setupWatcher(): void {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.lang');

        watcher.onDidChange(uri => {
            this.outputChannel.appendLine(`[TranslationStore] Detected change in ${uri.fsPath}. Re-parsing...`);
            // Simple re-parse for now. Could be optimized to only update the changed file.
            this.initialize(); 
        });
        watcher.onDidCreate(uri => {
            this.outputChannel.appendLine(`[TranslationStore] Detected new file ${uri.fsPath}. Re-initializing...`);
            this.initialize();
        });
        watcher.onDidDelete(uri => {
            this.outputChannel.appendLine(`[TranslationStore] Detected deletion of ${uri.fsPath}. Re-initializing...`);
            this.initialize();
        });

        this.context.subscriptions.push(watcher);
        this.outputChannel.appendLine('[TranslationStore] File watcher set up for .lang files.');
    }
}

