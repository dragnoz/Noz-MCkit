// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { buildIndex, updateIndexForFile } from './linker/identifierIndexer';
import { LinkedFilesViewProvider } from './linker/linkedFilesViewProvider';
import { initializeGlyphDecorator, disposeGlyphDecorations } from './glyphs/glyphDecorator';
import { initializeDialogueFeatures } from './dialogue/dialogueManager';
import { initializeOutputChannel, logInfo, logError, disposeOutputChannel, getOutputChannel } from './logger'; // Import getOutputChannel
import { GraphViewProvider } from './graph/graphViewProvider'; // Import GraphViewProvider
import { TranslationStore } from './translations/translationStore'; // Import translation store
import { TranslationHoverProvider } from './translations/translationHoverProvider'; // Import hover provider

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {

	initializeOutputChannel();
	const outputChannel = getOutputChannel(); // Get the initialized channel
	if (!outputChannel) {
		console.error("Failed to get output channel!");
		// Handle error appropriately, maybe disable features relying on it
		return; 
	}
	logInfo("Activating Minecraft Resource Toolkit...");

	// --- Translation Hover Feature (Initialize early, needs channel) ---
	logInfo("Initializing TranslationStore...");
	const translationStore = new TranslationStore(context, outputChannel); // Pass context and channel
	const initialTranslationBuildPromise = translationStore.initialize(); // Call initialize
	context.subscriptions.push({ dispose: () => { /* potentially dispose store resources if needed */ } }); // Add store to subscriptions if it has a dispose method
	// --- End Translation Hover Init ---

	// --- Identifier Linking Feature --- 
	logInfo("Registering LinkedFilesViewProvider...");
	const linkedFilesProvider = new LinkedFilesViewProvider(context);
	const treeView = vscode.window.createTreeView("mrtLinkedFilesView", { treeDataProvider: linkedFilesProvider });
	context.subscriptions.push(treeView);
	logInfo("LinkedFilesViewProvider registered.");

	// Function to build the index with progress
	const buildIndexWithProgress = async () => {
		linkedFilesProvider.setIndexReady(false);
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification, 
			}, async (progress) => {
				progress.report({ message: "MRT: Building identifier index..." });
				await buildIndex(context, progress);
				linkedFilesProvider.setIndexReady(true);
			});
	};

	// Initial index build
	let initialIndexBuildPromise: Promise<void> | null = null;
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders && workspaceFolders.length > 0) {
		logInfo("Workspace detected, starting initial index build.");
		initialIndexBuildPromise = buildIndexWithProgress();
	} else {
		logInfo("No workspace open, skipping initial index build.");
        linkedFilesProvider.setIndexReady(true); // Set to ready even if no workspace
	}

	// Command to manually rebuild index
	let rebuildIndexCommand = vscode.commands.registerCommand('mrt.rebuildIndex', async () => {
		logInfo("Manual index rebuild triggered.");
		 if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
			 vscode.window.showWarningMessage("Cannot rebuild index: No workspace is open.");
			 return;
		 }
		initialIndexBuildPromise = buildIndexWithProgress(); // Re-assign promise
	});
	context.subscriptions.push(rebuildIndexCommand);

	// Update index on file save
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (document) => {
		// Determine if the file is relevant for indexing
		const config = vscode.workspace.getConfiguration('mrt.linker');
    	const includePattern = config.get<string>('filesToIndex', '**/*.{json,mcfunction,lang}');
		const relevantExtensions = includePattern.match(/\{([^}]+)\}]?.[0]/)?.[1].split(',').map(ext => `.${ext.trim()}`) || [];
		const isRelevantForIndex = relevantExtensions.some(ext => document.fileName.endsWith(ext));

		// Update index if relevant
		 if (isRelevantForIndex) {
			logInfo(`File saved: ${document.fileName}, updating index...`);
			const indexChanged = await updateIndexForFile(document);
			 if (indexChanged) {
			 	linkedFilesProvider.refresh(); 
			 }
		}
		// Note: TranslationStore updates itself via its own watcher, no need to handle .lang saves here explicitly for it.
	}));

	// Update the TreeView when the active editor changes
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
		linkedFilesProvider.updateCurrentDocument(editor?.document);
	}));

	// Initial update for the view based on the currently active editor when activated
	linkedFilesProvider.updateCurrentDocument(vscode.window.activeTextEditor?.document);
	// --- End Identifier Linking --- 


	// --- Glyph Rendering Feature ---
	initializeGlyphDecorator(context);
	// --- End Glyph Rendering ---


	// --- Dialogue/Lang Feature ---
	// initializeDialogueFeatures(context); // This might be redundant if TranslationStore handles .lang files
	// --- End Dialogue/Lang --- 


	// --- Graph View Feature ---
	context.subscriptions.push(vscode.commands.registerCommand("mrt.showGraphView", () => {
		// Ensure index is ready before showing graph?
		// Or let GraphViewProvider handle loading state?
		GraphViewProvider.createOrShow(context);
	}));
	// --- End Graph View --- 


	// --- Translation Hover Feature (Register after store is initialized) ---
	// Await the initialization promise before registering the provider
	await initialTranslationBuildPromise;
	logInfo("TranslationStore initialized. Registering TranslationHoverProvider...");

	const hoverProvider = new TranslationHoverProvider(translationStore, outputChannel); // Pass store and channel
	context.subscriptions.push(
		vscode.languages.registerHoverProvider({ language: 'json', scheme: 'file' }, hoverProvider)
	);
	context.subscriptions.push(
		vscode.languages.registerHoverProvider({ language: 'jsonc', scheme: 'file' }, hoverProvider)
	);
	context.subscriptions.push(
		vscode.languages.registerHoverProvider({ language: 'mcfunction', scheme: 'file' }, hoverProvider) // Add mcfunction
	);
	logInfo("TranslationHoverProvider registered for json, jsonc, and mcfunction."); // Updated log
	// --- End Translation Hover --- 


	// Wait for all initial builds if necessary for full readiness?
	// await Promise.all([initialIndexBuildPromise, initialTranslationBuildPromise]);
	logInfo("Minecraft Resource Toolkit activation complete.");
}

// This method is called when your extension is deactivated
export function deactivate() {
	logInfo("Deactivating Minecraft Resource Toolkit...");
	disposeGlyphDecorations();
	// Dispose other resources if needed
	disposeOutputChannel();
}

