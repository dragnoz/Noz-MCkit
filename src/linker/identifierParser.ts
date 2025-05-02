// Logic for parsing different file types to extract potential identifiers
import * as vscode from 'vscode';

// Regex for typical Minecraft identifiers (namespace:name) and function paths
const MINECRAFT_ID_REGEX = /[a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+/g;
// Regex for texture paths (e.g., textures/entity/pig)
const TEXTURE_PATH_REGEX = /textures\/[a-zA-Z0-9_./-]+/g;
// Regex for geometry identifiers (e.g., geometry.pig)
const GEOMETRY_ID_REGEX = /geometry\.[a-zA-Z0-9_.-]+/g;
// Regex for material identifiers (e.g., entity_alphatest)
const MATERIAL_ID_REGEX = /[a-zA-Z_]+[a-zA-Z0-9_]*/g; // Broad match for material keys, might need refinement
// Regex for animation short names (e.g., walk, attack.rotations)
const ANIMATION_SHORT_NAME_REGEX = /[a-zA-Z0-9_.]+/g; // Very broad, used contextually

function getJsonKeysToScan(): string[] {
    // Consider adding a default list if config is empty
    return vscode.workspace.getConfiguration('mrt').get<string[]>('linker.jsonKeysToScan', [
        "identifier",
        "textures",
        "geometry",
        "materials",
        "render_controllers",
        "animations",
        "animation_controllers",
        "scripts",
        "parent"
    ]);
}

export interface ParseResult {
    identifiers: Set<string>;
    calledFunctions: Set<string>; // Functions called by this file
}

export function parseFileForIdentifiers(document: vscode.TextDocument): ParseResult {
    const result: ParseResult = { identifiers: new Set<string>(), calledFunctions: new Set<string>() };
    const fileContent = document.getText();
    const languageId = document.languageId;

    try {
        switch (languageId) {
            case 'json':
            case 'jsonc': // Handle JSON with comments
                parseJsonContent(fileContent, result.identifiers);
                break;
            case 'mcfunction':
                parseMcfunctionContent(fileContent, result);
                break;
            case 'lang': // Assuming 'lang' is the identifier for .lang files
                parseLangContent(fileContent, result.identifiers);
                break;
            default:
                // For unknown file types, maybe do a generic regex scan?
                // Check if the file extension matches configured patterns?
                findMatches(fileContent, MINECRAFT_ID_REGEX, result.identifiers);
                break;
        }
    } catch (error) {
        console.error(`Error parsing ${document.uri.fsPath} as ${languageId}:`, error);
        // Fallback: Perform a generic scan on error?
        findMatches(fileContent, MINECRAFT_ID_REGEX, result.identifiers);
    }

    // console.log(`Found identifiers in ${document.uri.fsPath}:`, Array.from(result.identifiers));
    // console.log(`Found called functions in ${document.uri.fsPath}:`, Array.from(result.calledFunctions));
    return result;
}

// --- Parsing Functions --- 

function parseJsonContent(content: string, identifiers: Set<string>): void {
    try {
        const obj = JSON.parse(content);
        recursivelyFindIdentifiersInJson(obj, identifiers);
    } catch (e) {
        console.error("JSON parsing failed:", e);
        // Fallback: Regex scan on raw JSON string might catch some identifiers
        findMatches(content, MINECRAFT_ID_REGEX, identifiers);
        findMatches(content, TEXTURE_PATH_REGEX, identifiers);
        findMatches(content, GEOMETRY_ID_REGEX, identifiers);
    }
}

function recursivelyFindIdentifiersInJson(data: any, identifiers: Set<string>, currentKey?: string): void {
    const jsonKeysToScan = getJsonKeysToScan(); // Get current config

    if (typeof data === 'string') {
        // Check if the string matches known patterns
        if (MINECRAFT_ID_REGEX.test(data)) {
            findMatches(data, MINECRAFT_ID_REGEX, identifiers);
        }
        if (TEXTURE_PATH_REGEX.test(data)) {
            findMatches(data, TEXTURE_PATH_REGEX, identifiers);
        }
        if (GEOMETRY_ID_REGEX.test(data)) {
            findMatches(data, GEOMETRY_ID_REGEX, identifiers);
        }
        // Add strings found under specific keys, even if they don't match strict patterns
        if (currentKey && jsonKeysToScan.includes(currentKey)) {
             // Be careful with overly broad additions, maybe add context?
             // Example: Add animation short names only if key is 'animations'
             if (currentKey === 'animations' || currentKey === 'animation_controllers') {
                 findMatches(data, ANIMATION_SHORT_NAME_REGEX, identifiers); 
             } else if (currentKey === 'materials') {
                 findMatches(data, MATERIAL_ID_REGEX, identifiers);
             } else {
                 // For other keys like 'identifier', 'geometry', 'textures', add the string directly
                 identifiers.add(data.trim());
             }
        }

    } else if (Array.isArray(data)) {
        data.forEach(item => recursivelyFindIdentifiersInJson(item, identifiers, currentKey));
    } else if (typeof data === 'object' && data !== null) {
        Object.entries(data).forEach(([key, value]) => {
            // Check if the key itself is relevant (e.g., in animation definitions)
            if (key === 'animations' || key === 'animation_controllers') {
                 // Keys within these objects might be animation short names
                 if (typeof value === 'object' && value !== null) { // Check if value is an object
                    Object.keys(value).forEach(animKey => identifiers.add(animKey.trim()));
                 }
            }
            // Pass the key down for context
            recursivelyFindIdentifiersInJson(value, identifiers, key);
        });
    }
}

function parseMcfunctionContent(content: string, result: ParseResult): void {
    const identifiers = result.identifiers;
    const calledFunctions = result.calledFunctions;

    // Find standard identifiers (namespace:name)
    findMatches(content, MINECRAFT_ID_REGEX, identifiers);
    // Find function calls and add to both identifiers and calledFunctions
    const functionCallRegex = /function\s+([a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+)/g;
    findMatches(content, functionCallRegex, identifiers, 1); // Capture group 1
    findMatches(content, functionCallRegex, calledFunctions, 1); // Capture group 1

    // Find entity types in selectors (e.g., @e[type=minecraft:pig])
    const entityTypeRegex = /@\w\[(?:[^,\]]+,)*\s*type\s*=\s*!?\s*([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+)\s*(?:,[^,\]]*)*\]/g;
    findMatches(content, entityTypeRegex, identifiers, 1); // Capture group 1
    // Could add more regex for item IDs, block IDs, etc. if needed
}

function parseLangContent(content: string, identifiers: Set<string>): void {
    const lines = content.split('\n');
    lines.forEach(line => {
        // Remove comments starting with #
        const uncommentedLine = line.split('#')[0].trim();
        if (uncommentedLine.includes('=')) {
            const parts = uncommentedLine.split('=');
            const key = parts[0].trim();
            // Lang keys often act as identifiers (e.g., entity.minecraft:pig.name)
            if (key) {
                identifiers.add(key);
                // Also check if the key *contains* a standard identifier
                findMatches(key, MINECRAFT_ID_REGEX, identifiers);
            }
            // Optionally parse the value as well?
            // const value = parts.slice(1).join('=').trim();
        }
    });
}

// --- Helper Function --- 

function findMatches(content: string, regex: RegExp, collection: Set<string>, captureGroup: number = 0): void {
    let match;
    // Reset lastIndex if the regex is global (has 'g' flag)
    if (regex.global) {
        regex.lastIndex = 0;
    }
    while ((match = regex.exec(content)) !== null) {
        if (match[captureGroup]) {
            collection.add(match[captureGroup].trim());
        }
        // Prevent infinite loops with zero-width matches on global regex
        if (regex.global && match.index === regex.lastIndex) {
            regex.lastIndex++;
        }
    }
}

