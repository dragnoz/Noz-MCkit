// Helper functions for dialogue and language file interactions
import * as vscode from 'vscode';
import * as path from 'path';

// --- Configuration Accessors ---

function getLanguageFolderName(): string {
    return vscode.workspace.getConfiguration('mrt.dialogue').get<string>('languageFolderName', 'texts');
}

function getDefaultLanguageCode(): string {
    return vscode.workspace.getConfiguration('mrt.dialogue').get<string>('defaultLanguage', 'en_US');
}

// --- File Identification and Location --- 

/**
 * Checks if a given document URI likely represents a dialogue file.
 * TODO: Make this logic more robust, potentially configurable.
 * Current heuristic: Ends with .json and is inside a 'dialogue' folder or similar.
 */
export function isDialogueFile(uri: vscode.Uri): boolean {
    const fsPath = uri.fsPath;
    // Simple check: is it a JSON file within a folder named 'dialogue' or 'dialogues'?
    const dirname = path.basename(path.dirname(fsPath));
    return fsPath.endsWith('.json') && (dirname === 'dialogue' || dirname === 'dialogues');
    // Alternative: Check for specific JSON structure within the file?
}

/**
 * Tries to find the language folder (e.g., 'texts') relative to a dialogue file or workspace root.
 */
export async function findLanguageFolderUri(dialogueFileUri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const langFolderName = getLanguageFolderName();
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(dialogueFileUri);
    if (!workspaceFolder) {
        return undefined; // Cannot determine relative paths without a workspace
    }

    // Strategy 1: Look for the folder directly in the workspace root
    const rootLangFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, langFolderName);
    try {
        const stats = await vscode.workspace.fs.stat(rootLangFolderUri);
        if (stats.type === vscode.FileType.Directory) {
            return rootLangFolderUri;
        }
    } catch (e) { /* Folder not found at root */ }

    // Strategy 2: Look relative to the dialogue file's directory (e.g., ../texts)
    // This might be less common for Minecraft addons but could be supported
    const relativeLangFolderUri = vscode.Uri.joinPath(dialogueFileUri, '..', langFolderName);
     try {
        const stats = await vscode.workspace.fs.stat(relativeLangFolderUri);
        if (stats.type === vscode.FileType.Directory) {
            return relativeLangFolderUri;
        }
    } catch (e) { /* Folder not found relative */ }

    console.warn(`Language folder '${langFolderName}' not found relative to workspace root or dialogue file.`);
    return undefined; // Folder not found
}

/**
 * Finds all .lang files within a given language folder URI.
 */
export async function findAvailableLanguages(langFolderUri: vscode.Uri): Promise<{ code: string, uri: vscode.Uri }[]> {
    if (!langFolderUri) {
        return [];
    }
    try {
        const entries = await vscode.workspace.fs.readDirectory(langFolderUri);
        const langFiles = entries
            .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.lang'))
            .map(([name, type]) => ({
                code: name.replace('.lang', ''),
                uri: vscode.Uri.joinPath(langFolderUri, name)
            }));
        return langFiles;
    } catch (error) {
        console.error(`Error reading language directory ${langFolderUri.fsPath}:`, error);
        return [];
    }
}

/**
 * Finds the URI for a specific language code within the language folder.
 */
export async function findLanguageFileUri(langFolderUri: vscode.Uri, langCode: string): Promise<vscode.Uri | undefined> {
     if (!langFolderUri || !langCode) {
        return undefined;
    }
    const targetUri = vscode.Uri.joinPath(langFolderUri, `${langCode}.lang`);
    try {
        await vscode.workspace.fs.stat(targetUri);
        return targetUri;
    } catch (e) {
        return undefined; // File not found
    }
}

/**
 * Gets the URI of the default language file (e.g., en_US.lang).
 */
export async function getDefaultLanguageFileUri(langFolderUri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const defaultCode = getDefaultLanguageCode();
    return findLanguageFileUri(langFolderUri, defaultCode);
}

// --- Editor Management ---

/**
 * Opens a language file next to the currently active editor.
 */
export async function openLanguageFileBeside(langFileUri: vscode.Uri | undefined): Promise<void> {
    if (!langFileUri) {
        vscode.window.showWarningMessage("Could not find the specified language file.");
        return;
    }
    try {
        await vscode.commands.executeCommand('vscode.open', langFileUri, {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: true // Keep focus on the dialogue file
        });
    } catch (error) {
        console.error(`Error opening language file ${langFileUri.fsPath}:`, error);
        vscode.window.showErrorMessage(`Failed to open language file: ${langFileUri.fsPath}`);
    }
}

/**
 * Finds an already open editor showing a .lang file, preferably in the adjacent column.
 */
export function findAdjacentLangEditor(): vscode.TextEditor | undefined {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return undefined;

    const targetColumn = activeEditor.viewColumn === vscode.ViewColumn.One 
                         ? vscode.ViewColumn.Two 
                         : vscode.ViewColumn.One;

    for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.languageId === 'lang' && editor.viewColumn === targetColumn) {
            return editor;
        }
    }
    // Fallback: Find any .lang editor if none is adjacent
     for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.languageId === 'lang') {
            return editor;
        }
    }
    return undefined;
}

