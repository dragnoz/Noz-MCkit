// src/translations/translationHoverProvider.ts
import * as vscode from 'vscode';
import { TranslationStore } from './translationStore';

export class TranslationHoverProvider implements vscode.HoverProvider {

    constructor(private translationStore: TranslationStore, private outputChannel: vscode.OutputChannel) {}

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        // Define patterns to identify potential translation keys
        // 1. Check if inside a string literal
        const range = document.getWordRangeAtPosition(position, /["'][a-zA-Z0-9_\.\-]+["']/);
        if (!range) {
            // Try a broader pattern if the simple word range fails (e.g., key might not have quotes directly around it)
            const potentialKeyRange = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_\.\-]+/);
            if (!potentialKeyRange) {
                return null; // Not a word
            }
            // Basic check: is it likely within quotes? (More robust parsing might be needed)
            const lineText = document.lineAt(position.line).text;
            const textBefore = lineText.substring(0, potentialKeyRange.start.character);
            const textAfter = lineText.substring(potentialKeyRange.end.character);
            if (!textBefore.includes('"') || !textAfter.includes('"')) {
                 // Also check for specific JSON contexts like "translate": "key"
                 const potentialJsonKeyRange = document.getWordRangeAtPosition(position, /"translate"\s*:\s*"([a-zA-Z0-9_\.\-]+)"/);
                 if (!potentialJsonKeyRange || !potentialJsonKeyRange.contains(position)) {
                    // Check if it's a value in dialogue JSON
                    const potentialDialogueKeyRange = document.getWordRangeAtPosition(position, /"(npc_name|text)"\s*:\s*"([a-zA-Z0-9_\.\-]+)"/);
                     if (!potentialDialogueKeyRange || !potentialDialogueKeyRange.contains(position)) {
                        return null; // Not clearly a translation key in known contexts
                     }
                 }
            }
        }

        // Extract the potential key (remove quotes if present)
        let potentialKey = document.getText(range || document.getWordRangeAtPosition(position, /[a-zA-Z0-9_\.\-]+/));
        potentialKey = potentialKey.replace(/[""]/g, ''); // Remove surrounding quotes

        if (!potentialKey || !potentialKey.includes('.')) { // Basic sanity check for key format
            return null;
        }

        this.outputChannel.appendLine(`[HoverProvider] Checking key: ${potentialKey}`);

        const translations = this.translationStore.getTranslations(potentialKey);

        if (translations && translations.size > 0) {
            this.outputChannel.appendLine(`[HoverProvider] Found translations for ${potentialKey}`);
            const markdown = new vscode.MarkdownString();
            markdown.supportHtml = true; // Allow basic HTML if needed
            markdown.isTrusted = true; // Allow commands if we add them later

            markdown.appendMarkdown(`**${potentialKey}**

---

`); // Use key as title

            // Sort languages for consistent order (e.g., alphabetically)
            const sortedLanguages = Array.from(translations.keys()).sort();

            for (const langCode of sortedLanguages) {
                const text = translations.get(langCode);
                // Basic escaping for markdown - might need more robust solution
                const escapedText = text?.replace(/([\`*_{}\[\]()#+\-.!])/g, '\\$1') || ''; 
                markdown.appendMarkdown(`*   **${langCode}:** ${escapedText}
`);
            }

            return new vscode.Hover(markdown);
        } else {
            this.outputChannel.appendLine(`[HoverProvider] No translations found for ${potentialKey}`);
            return null;
        }
    }
}

