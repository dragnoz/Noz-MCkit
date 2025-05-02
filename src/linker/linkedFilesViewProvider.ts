// TreeView provider for displaying linked files
import * as vscode from 'vscode';
import * as path from 'path'; // Add missing path import
import { getLinkedFiles, getFunctionCallers } from './identifierIndexer'; // Import getFunctionCallers
import { parseFileForIdentifiers } from './identifierParser';

export class LinkedFilesViewProvider implements vscode.TreeDataProvider<LinkedItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<LinkedItem | undefined | null | void> = new vscode.EventEmitter<LinkedItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<LinkedItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentDocumentUri: vscode.Uri | undefined;
    private isIndexReady: boolean = false; // Track if the initial index build is complete

    constructor(private context: vscode.ExtensionContext) { }

    // Method to signal that the index is ready
    setIndexReady(ready: boolean): void {
        this.isIndexReady = ready;
        this.refresh(); // Refresh the view when index readiness changes
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    updateCurrentDocument(document: vscode.TextDocument | undefined): void {
        const newUri = document?.uri;
        // Refresh only if the document URI actually changes
        if (newUri?.toString() !== this.currentDocumentUri?.toString()) {
            this.currentDocumentUri = newUri;
            this.refresh();
        }
    }

    getTreeItem(element: LinkedItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: LinkedItem): Promise<LinkedItem[]> {
        if (!this.isIndexReady) {
            // Optionally show a "Building index..." message
            return Promise.resolve([new LinkedItem("Building index...", undefined, vscode.TreeItemCollapsibleState.None, 'status')]);
        }

        if (!this.currentDocumentUri) {
            return Promise.resolve([new LinkedItem("Open a relevant file to see links", undefined, vscode.TreeItemCollapsibleState.None, 'status')]);
        }

        const currentDocUriString = this.currentDocumentUri.toString();

        if (element) {
            // If element is an identifier, return its linked files (where the ID is defined/used)
            if (element.contextValue === "identifier") {
                const linkedUris = getLinkedFiles(element.identifierValue);
                const items = linkedUris
                    .filter(uri => uri.toString() !== currentDocUriString) // Exclude current file
                    .map(uri => {
                        const label = relativePathLabel(uri);
                        return new LinkedItem(label, uri, vscode.TreeItemCollapsibleState.None, "file");
                    });
                items.sort((a, b) => a.label.localeCompare(b.label));
                return Promise.resolve(items);
            }
            // If element is the "Called By" root, return the caller function files
            else if (element.contextValue === "caller_root") {
                const callerUris = getFunctionCallers(element.identifierValue);
                const items = callerUris
                    .filter(uri => uri.toString() !== currentDocUriString) // Exclude current file if it calls itself (unlikely but possible)
                    .map(uri => {
                        const label = `FF: ${relativePathLabel(uri)}`; // Add FF: prefix
                        return new LinkedItem(label, uri, vscode.TreeItemCollapsibleState.None, "file");
                    });
                items.sort((a, b) => a.label.localeCompare(b.label));
                return Promise.resolve(items);
            }
            // If element is a file or status, it has no children
            return Promise.resolve([]);
        } else {
            // If no element, return the identifiers found in the current document that link elsewhere
            try { // Add missing try block
                const document = await vscode.workspace.openTextDocument(this.currentDocumentUri);
                const parseResult = parseFileForIdentifiers(document);
                const identifiers = parseResult.identifiers; // Get identifiers from parse result
                
                const items: LinkedItem[] = [];

                // 1. Add identifiers found IN this file
                const identifierItems = Array.from(identifiers).map(id => {
                    const linkedUris = getLinkedFiles(id);
                    const otherLinks = linkedUris.filter(uri => uri.toString() !== currentDocUriString);
                    if (otherLinks.length > 0) {
                        const label = `${id} (${otherLinks.length})`;
                        return new LinkedItem(label, undefined, vscode.TreeItemCollapsibleState.Collapsed, "identifier", id);
                    } else {
                        return null;
                    }
                }).filter(item => item !== null) as LinkedItem[];
                items.push(...identifierItems);

                // 2. If current file is a function, add callers
                if (document.languageId === "mcfunction") {
                    const currentFunctionId = getFunctionIdFromUri(this.currentDocumentUri);
                    if (currentFunctionId) {
                        const callerUris = getFunctionCallers(currentFunctionId);
                        const otherCallers = callerUris.filter(uri => uri.toString() !== currentDocUriString);
                        if (otherCallers.length > 0) {
                            // Add a root node for callers
                            const callerRoot = new LinkedItem(`Called By (${otherCallers.length})`, undefined, vscode.TreeItemCollapsibleState.Collapsed, "caller_root", currentFunctionId);
                            items.push(callerRoot);
                        }
                    }
                }

                if (items.length === 0) {
                     return Promise.resolve([new LinkedItem("No links found for this file", undefined, vscode.TreeItemCollapsibleState.None, "status")]);
                }
                
                // Sort top-level items alphabetically (identifiers first, then "Called By")
                items.sort((a, b) => {
                    if (a.contextValue === "caller_root" && b.contextValue !== "caller_root") return 1;
                    if (a.contextValue !== "caller_root" && b.contextValue === "caller_root") return -1;
                    return a.label.localeCompare(b.label);
                });
                return Promise.resolve(items);

            } catch (error) {
                console.error(`Error getting children for TreeView:`, error);
                return Promise.resolve([new LinkedItem("Error loading links for this file", undefined, vscode.TreeItemCollapsibleState.None, "status")]);
            }
        }
    }
}

class LinkedItem extends vscode.TreeItem {
    constructor( // Add missing constructor keyword
        public readonly label: string,
        resourceUriOrUndefined: vscode.Uri | undefined, // Renamed to avoid conflict
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        // Use more specific context values
        public readonly contextValue: "identifier" | "file" | "status" | "caller_root", // Add caller_root
        public readonly identifierValue: string = "" // Store identifier if contextValue is "identifier" or "caller_root"
    ) {
        // Pass resourceUri only if it's a file item for proper icon behavior
        super(label, collapsibleState);
        this.resourceUri = contextValue === "file" ? resourceUriOrUndefined : undefined;
        this.tooltip = `${this.label}`;

        // Set command and icon based on context
        if (contextValue === "file" && resourceUriOrUndefined) {
            this.command = {
                command: "vscode.open",
                title: "Open File",
                arguments: [resourceUriOrUndefined],
            };
            this.iconPath = vscode.ThemeIcon.File;
            // Add full path to tooltip?
            this.tooltip = `${relativePathLabel(resourceUriOrUndefined)}\n${resourceUriOrUndefined.fsPath}`;
        } else if (contextValue === "identifier") {
            this.iconPath = new vscode.ThemeIcon("tag");
            this.tooltip = `Identifier: ${identifierValue}`;
        } else if (contextValue === "caller_root") { // Handle caller_root
            this.iconPath = new vscode.ThemeIcon("references"); // Use a suitable icon
            this.tooltip = `Files calling function: ${identifierValue}`;
        } else { // status message
            this.iconPath = new vscode.ThemeIcon("info");
        }
    } // Add missing closing brace for constructor
}

// Helper to get a potentially shorter relative path label with RP/BP prefixes
function relativePathLabel(uri: vscode.Uri): string {
    const relativePath = vscode.workspace.asRelativePath(uri, false); // Don't include workspace folder name

    if (relativePath.startsWith("resource_packs/")) {
        // Remove "resource_packs/" and the next segment (pack name)
        const pathParts = relativePath.split("/");
        if (pathParts.length > 2) {
            return `RP: ${pathParts.slice(2).join("/")}`;
        }
        // Handle case like resource_packs/manifest.json (though unlikely for linked files)
        return `RP: ${pathParts.slice(1).join("/")}`;
    } else if (relativePath.startsWith("behavior_packs/")) {
        // Remove "behavior_packs/" and the next segment (pack name)
        const pathParts = relativePath.split("/");
        if (pathParts.length > 2) {
            return `BP: ${pathParts.slice(2).join("/")}`;
        }
        // Handle case like behavior_packs/manifest.json
        return `BP: ${pathParts.slice(1).join("/")}`;
    }

    // If not in RP or BP, return the original relative path
    return relativePath;
}

// Helper to derive function ID from URI (e.g., my_pack:folder/my_func)
function getFunctionIdFromUri(uri: vscode.Uri): string | null {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) return null;

    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath).replace(/\\/g, "/");
    // Expected format: behavior_packs/<pack_name>/functions/<function_path>.mcfunction
    const bpMatch = relativePath.match(/^behavior_packs\/([^/]+)\/functions\/(.+)\.mcfunction$/);

    if (bpMatch && bpMatch[1] && bpMatch[2]) {
        // We don't have the pack name directly, but Minecraft often uses the folder name
        // or relies on context. For linking, we need a unique ID. Using the path relative
        // to functions/ seems the most practical approach for now.
        // TODO: Consider how to reliably get a namespace if needed.
        // For now, let's just use the path relative to functions/ as the ID.
        return bpMatch[2]; // e.g., "folder/my_func"
    }

    return null;
}

