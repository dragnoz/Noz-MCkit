// Logic for building and querying the identifier index
import * as vscode from 'vscode';
import { parseFileForIdentifiers } from './identifierParser';

// In-memory index: Map<identifierString, Set<fileUriString>>
const identifierIndex: Map<string, Set<string>> = new Map();
// Index for function calls: Map<callerFileUriString, Set<calledFunctionId>>
const functionCallIndex: Map<string, Set<string>> = new Map();

// --- Index Management ---

export async function buildIndex(context: vscode.ExtensionContext, progress?: vscode.Progress<{ message?: string; increment?: number }>): Promise<void> {
    console.log("Building identifier index...");
    identifierIndex.clear();
    functionCallIndex.clear(); // Clear function call index too

    const config = vscode.workspace.getConfiguration("mrt.linker");
    const includePattern = config.get<string>('filesToIndex', '**/*.{json,mcfunction,lang}');
    const excludePattern = config.get<string>('excludePattern', '**/node_modules/**,**/dist/**,**/out/**');

    progress?.report({ message: "Finding relevant files..." });
    const files = await vscode.workspace.findFiles(includePattern, excludePattern);

    console.log(`Found ${files.length} files matching pattern '${includePattern}' excluding '${excludePattern}'.`);
    progress?.report({ message: `Processing ${files.length} files...`, increment: 0 });

    const totalFiles = files.length;
    let processedFiles = 0;
    const reportIncrement = Math.max(1, Math.floor(totalFiles / 100)); // Report progress roughly every 1%

    // Process files in chunks to avoid overwhelming the system?
    // For now, process all concurrently
    const promises = files.map(async (fileUri) => {
        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            const parseResult = parseFileForIdentifiers(document);
            const uriString = fileUri.toString();

            // Update identifier index
            for (const id of parseResult.identifiers) {
                if (!identifierIndex.has(id)) {
                    identifierIndex.set(id, new Set());
                }
                identifierIndex.get(id)?.add(uriString);
            }

            // Update function call index (caller -> called)
            if (parseResult.calledFunctions.size > 0) {
                functionCallIndex.set(uriString, parseResult.calledFunctions);
            }
        } catch (error) {
            // Log errors but continue processing other files
            console.error(`Error processing file ${fileUri.fsPath}:`, error);
        } finally {
            processedFiles++;
            if (processedFiles % reportIncrement === 0) {
                progress?.report({ message: `Processing ${totalFiles} files...`, increment: (reportIncrement / totalFiles) * 100 });
            }
        }
    });

    await Promise.all(promises);
    progress?.report({ message: "Index build complete.", increment: 100 });
    console.log(`Identifier index built. Found ${identifierIndex.size} unique identifiers across ${processedFiles} processed files.`);
}

export async function updateIndexForFile(document: vscode.TextDocument): Promise<boolean> {
    const uriString = document.uri.toString();
    let indexChanged = false;
    console.log(`Updating index for ${uriString}`);

    // --- Remove old entries for this file --- 
    const oldIdentifiersForFile = new Set<string>();
    for (const [id, uriSet] of identifierIndex.entries()) {
        if (uriSet.has(uriString)) {
            oldIdentifiersForFile.add(id);
            uriSet.delete(uriString);
            if (uriSet.size === 0) {
                identifierIndex.delete(id);
            }
            indexChanged = true; // Mark change if deletion occurred
        }
    }
    // Remove old function calls for this file
    if (functionCallIndex.has(uriString)) {
        functionCallIndex.delete(uriString);
        indexChanged = true; // Mark change if deletion occurred
    }

    // --- Add current identifiers and function calls for this file --- 
    const parseResult = parseFileForIdentifiers(document);
    // Add identifiers
    for (const id of parseResult.identifiers) {
        if (!identifierIndex.has(id)) {
            identifierIndex.set(id, new Set());
        }
        const uriSet = identifierIndex.get(id)!; // We know it exists now
        if (!uriSet.has(uriString)) {
            uriSet.add(uriString);
            indexChanged = true; // Mark change if addition occurred
        }
    }
    // Add function calls
    if (parseResult.calledFunctions.size > 0) {
        functionCallIndex.set(uriString, parseResult.calledFunctions);
        indexChanged = true; // Mark change if addition occurred (or if calls changed)
    }
    
    // Check if any identifiers were removed but not re-added
    for(const oldId of oldIdentifiersForFile) {
        if (!parseResult.identifiers.has(oldId)) {
            indexChanged = true; // Mark change if an identifier was fully removed by this file change
            break;
        }
    }

    if (indexChanged) {
        console.log(`Index updated for ${uriString}`);
    } else {
        console.log(`Index unchanged for ${uriString}`);
    }
    return indexChanged;
}

// --- Querying Function --- 

export function getLinkedFiles(identifier: string): vscode.Uri[] {
    const uriStrings = identifierIndex.get(identifier) || new Set();
    return Array.from(uriStrings).map(uriStr => vscode.Uri.parse(uriStr));
}

// Function to find files that call a specific function ID
export function getFunctionCallers(functionId: string): vscode.Uri[] {
    const callerUris: vscode.Uri[] = [];
    for (const [callerUriString, calledFunctions] of functionCallIndex.entries()) {
        if (calledFunctions.has(functionId)) {
            callerUris.push(vscode.Uri.parse(callerUriString));
        }
    }
    return callerUris;
}

// Function to get all function calls for graph visualization
export function getAllFunctionCallsForGraph(): { nodes: { id: string, label: string }[], edges: { source: string, target: string }[] } {
    const nodes = new Map<string, { id: string, label: string }>();
    const edges: { source: string, target: string }[] = [];

    // Helper to get a short label (e.g., BP: functions/myfunc)
    const getShortLabel = (uriString: string): string => {
        try {
            const uri = vscode.Uri.parse(uriString);
            const relativePath = vscode.workspace.asRelativePath(uri, false);
            if (relativePath.startsWith("behavior_packs/")) {
                const pathParts = relativePath.split("/");
                if (pathParts.length > 2) {
                    return `BP: ${pathParts.slice(2).join("/").replace(/\.mcfunction$/, "")}`;
                }
                return `BP: ${pathParts.slice(1).join("/").replace(/\.mcfunction$/, "")}`;
            }
            return relativePath.replace(/\.mcfunction$/, ""); // Fallback, remove extension
        } catch (e) {
            console.error("Error creating short label for graph:", e);
            return uriString; // Fallback to full URI string
        }
    };

    for (const [callerUriString, calledFunctions] of functionCallIndex.entries()) {
        // Add caller node if not already added
        if (!nodes.has(callerUriString)) {
            nodes.set(callerUriString, { id: callerUriString, label: getShortLabel(callerUriString) });
        }

        for (const calledFunctionId of calledFunctions) {
            // Need to find the URI(s) corresponding to the calledFunctionId
            // This is tricky because the ID might not directly map to a single file URI
            // For now, let's represent the called function ID as a node itself.
            // A better approach might involve resolving IDs to URIs during indexing.
            
            // Simplification: Create a node for the ID string itself if no URI found easily.
            // We need a way to map calledFunctionId (e.g., "folder/my_func") back to a URI.
            // Let's assume for now the ID *is* the target node identifier for simplicity.
            // We will need to refine this ID -> URI mapping later.
            
            // Find potential target URIs (where the function ID is defined)
            const targetUris = getLinkedFiles(calledFunctionId); // This uses identifierIndex
            
            // For simplicity, let's just use the ID as the target node ID for the edge
            // and create a node for the ID if it doesn't correspond to a known file URI.
            const targetNodeId = calledFunctionId; // Use the ID itself as the node ID

            // Add target node if not already added (using the ID as key)
            if (!nodes.has(targetNodeId)) {
                 // Attempt to find a representative URI for the label
                 let targetLabel = calledFunctionId;
                 if (targetUris.length > 0) {
                     targetLabel = getShortLabel(targetUris[0].toString()); // Use first URI for label
                 }
                nodes.set(targetNodeId, { id: targetNodeId, label: targetLabel });
            }

            // Add the edge
            edges.push({ source: callerUriString, target: targetNodeId });
        }
    }

    return { nodes: Array.from(nodes.values()), edges };
}

