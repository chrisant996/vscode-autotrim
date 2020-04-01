# Change Log

All notable changes to the "vscode-autotrim" extension will be documented in this file.

- Format based on [Keep a Changelog](https://keepachangelog.com/).
- Follows [Semantic Versioning](https://semver.org/).

## [1.1.0](https://github.com/chrisant996/vscode-autotrim/tree/811363ccb780471c2559282c4df3bef7e865a32f)

- Forked from [axefrog.vscode-autotrim, v1.0.5](https://github.com/axefrog/vscode-autotrim/commit/d19562a22b873e80e6d5e37af2009509945dfea9).
- Changed to only trim trailing whitespace from edited lines.  This involved mostly rewriting the extension.
- Added `autotrim.pauseFile` command that toggles whether trimming is paused for the current file.  The pause state is maintained on a per-file basis, and is not persisted between sessions.
- Added status bar item.  Clicking it toggles whether trimming is paused for the current file.
- Added `autotrim.debugMode` setting to enable debug mode (see Settings for descriptions of the three modes).
