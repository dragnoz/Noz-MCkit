# Minecraft Resource Toolkit

A Visual Studio Code extension designed to enhance the development workflow for Minecraft: Bedrock Edition addons.

## Features

### 1. Identifier Cross-Referencing ("Linked Files" View)

*   When you open a relevant addon file (e.g., `.json`, `.mcfunction`, `.lang`), the extension scans your workspace for related files.
*   A dedicated view panel named "Linked Files" (found in the Explorer sidebar) displays a tree of identifiers found in the current file.
*   Expanding an identifier shows a list of other files in your workspace that define or use that same identifier.
*   File paths are shortened for readability:
    *   Files in `resource_packs/<pack_name>/...` are shown as `RP: ...`
    *   Files in `behavior_packs/<pack_name>/...` are shown as `BP: ...`
*   Clicking on a linked file opens it in the editor.
*   The index updates automatically when you save relevant files.
*   You can manually rebuild the index using the command `MRT: Rebuild Index` from the Command Palette (Ctrl+Shift+P).

### 2. Custom Glyph Rendering

*   Automatically renders custom Minecraft glyphs (Unicode characters in the Private Use Area, e.g., `U+E000` - `U+EFFF`) directly within the text editor.
*   Supports glyphs defined in `glyph_E0.png`, `glyph_E1.png`, etc., located within a `font` directory inside any resource pack in your workspace (e.g., `resource_packs/MyPack/font/glyph_E1.png`).
*   Glyphs should appear automatically in files like `.lang`, `.mcfunction`, `.json`, etc.
*   The size of the rendered glyph can be configured via the `mrt.glyphs.tileSize` setting (default is 16).

### 3. Dialogue & `.lang` File Helper

*   Provides hover information and potentially other assistance when working with `.lang` files and dialogue JSON files (details may vary based on implementation).

## Usage

1.  Install the extension (`.vsix` file).
2.  Open a Minecraft: Bedrock Edition addon project workspace containing `resource_packs` and/or `behavior_packs` folders.
3.  The extension will automatically build an index of identifiers (you'll see a progress notification).
4.  Open a relevant file (e.g., an entity JSON file, a `.mcfunction` file, a `.lang` file).
5.  Check the "Linked Files" view in the Explorer sidebar to see cross-references.
6.  Observe custom glyphs rendering directly in the editor if your project uses them and includes the corresponding `glyph_Ex.png` files.

## Contributing

(Placeholder for contribution guidelines)

## License

(Placeholder - currently MIT License based on previous context)

