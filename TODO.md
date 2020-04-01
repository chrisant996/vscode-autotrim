# TODO

- [ ] [Can trim line adjacent to edited line (#4)](https://github.com/chrisant996/vscode-autotrim/issues/4) -- Due to how VSCode sends document change notifications, when inserting or deleting lines the line immediately adjacent to the edit may also get trimmed.  It should be possible to detect and compensate in those cases, but the special cases have to be very accurately and precisely defined (and Undo might be extra challenging to make work exactly right).
- [ ] [Trimmed whitespace shows up in the undo stack (#3)](https://github.com/chrisant996/vscode-autotrim/issues/3) -- Maybe the `undoStopAfter` and `undoStopBefore` options in the `editor.edit()` function can help?
- [ ] [Setting to exclude files with globbing (#2)](https://github.com/chrisant996/vscode-autotrim/issues/2)
- [ ] [Markdown files trim when more than 2 trailing spaces (#1)](https://github.com/chrisant996/vscode-autotrim/issues/1)