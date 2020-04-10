# Change Log

All notable changes to the "vscode-autotrim" extension will be documented in this file.

- Format based on [Keep a Changelog](https://keepachangelog.com/).
- Follows [Semantic Versioning](https://semver.org/).

## 1.2.0

- Added `autotrim.highlightTrailing` (off by default) to highlight trailing whitespace.
- Added `autotrim.highlightTrailingEvenWhileEditing` (off by default) to highlight trailing whitespace even on a line that's actively being edited (since the trailing whitespace will get trimmed, and it's distracting to see highlights flicker while typing naturally).
- Added various settings to control the appearance of highlighted trailing whitespace.
- Added `autotrim.ignoreSyntax` that's a space-delimited list of language Ids for which to disable auto trimming and highlighting (see <https://code.visualstudio.com/docs/languages/identifiers> for some of the available language Ids).
- Added `autotrim.ignoreScheme` that's a space-delimited list of Uri schemes for which to disable auto trimming and highlighting (files are 'file', and by default 'output' is ignored).
- Changed `autotrim.debugMode` to `autotrim.logLevel`, and changed the enum.

## [1.1.1](https://github.com/chrisant996/vscode-autotrim/tree/25d663569dfb7a3a720b64a7b8cb781bb202e29c)

- Fixed mistaken arithmetic that could potentially get slightly off about which lines it thought had been edited.
- Added `autotrim.statusBar` setting to control whether the status bar item is created.  Or you can hide it via the status bar's right click menu, but then it still uses runtime resources.

## [1.1.0](https://github.com/chrisant996/vscode-autotrim/tree/811363ccb780471c2559282c4df3bef7e865a32f)

- Forked from [axefrog.vscode-autotrim, v1.0.5](https://github.com/axefrog/vscode-autotrim/commit/d19562a22b873e80e6d5e37af2009509945dfea9).
- Changed to only trim trailing whitespace from edited lines.  This involved mostly rewriting the extension.
- Added `autotrim.pauseFile` command that toggles whether trimming is paused for the current file.  The pause state is maintained on a per-file basis, and is not persisted between sessions.
- Added status bar item.  Clicking it toggles whether trimming is paused for the current file.
- Added `autotrim.debugMode` setting to enable debug mode (see Settings for descriptions of the three modes).
