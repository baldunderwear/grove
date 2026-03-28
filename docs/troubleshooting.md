# Troubleshooting Grove

## Common Issues

### Problem: Grove does not start or the window does not appear

**Symptoms:** You launched Grove but no window appeared. The app seems to not be running.

**Cause:** Grove is a tray-resident application. It starts with the window hidden by default and lives in the system tray.

**Solution:** Look for the Grove icon in the system tray area (bottom-right of the taskbar). If the icon is not visible, click the upward arrow to expand the tray overflow area. Left-click the icon to show the dashboard window. If you prefer the window to appear on startup, enable **Start minimized: Off** in settings (this is the default).

---

### Problem: Branches not showing up in the dashboard

**Symptoms:** You added a project but the branch table is empty or missing branches you expect to see.

**Cause:** Grove filters branches by the configured `branch_prefix`. Only branches whose names start with this prefix appear in the dashboard.

**Solution:** Check your project's `branch_prefix` setting. The default is `wt/`, meaning only branches named like `wt/my-feature` are shown. If your worktree branches use a different naming convention (e.g., `feature/`, `worktree-`), update the prefix in project settings. To show all branches, set the prefix to an empty string.

---

### Problem: Path not found health indicator on a project

**Symptoms:** A project shows a warning icon with "Path not found" in the dashboard.

**Cause:** The configured repository path does not exist. The drive may be disconnected, the directory may have been moved or renamed, or a network share may be unavailable.

**Solution:** Verify the path exists on disk. If the repository moved, update the path in project settings. If the drive is a removable or network drive, ensure it is connected. Grove re-checks health on each refresh cycle.

---

### Problem: Merge fails with unexpected conflicts

**Symptoms:** The merge dialog shows an error about unexpected conflicts in files that are not build files.

**Cause:** The source branch and merge target have conflicting changes in files that Grove cannot auto-resolve. Grove only auto-resolves conflicts in files matching the configured `build_files` patterns.

**Solution:** Merge the branch manually using git. Resolve the conflicts in your editor, then commit the merge. Alternatively, rebase the source branch onto the merge target first to resolve conflicts, then retry the merge in Grove.

---

### Problem: Claude Code does not launch from Grove

**Symptoms:** Clicking the play button on a branch row does nothing, or a command window flashes and closes.

**Cause:** The `claude` command is not in your system PATH, or the worktree directory does not exist on disk.

**Solution:** Verify that Claude Code is installed and the `claude` command works from a terminal. Run `claude --version` in a command prompt to check. If the command is not found, reinstall Claude Code or add its installation directory to your PATH. Also verify the worktree directory exists -- it may have been deleted outside of Grove.

---

### Problem: Auto-fetch is not working

**Symptoms:** Branch ahead/behind counts do not update to reflect remote changes. You have to manually run `git fetch` to see updates.

**Cause:** Auto-fetch may be disabled, or SSH key authentication may be failing silently.

**Solution:** Check the `auto_fetch_interval` setting. If it is `0`, auto-fetch is disabled. Set it to a value between 60 and 3600 seconds. If using SSH remotes, ensure your SSH key is loaded in an agent (`ssh-add -l` to check). Grove uses the git CLI for fetch operations, which relies on the same SSH configuration as your terminal.

---

### Problem: Notifications are not appearing

**Symptoms:** You expected a notification (merge-ready, stale branch) but none appeared.

**Cause:** Notifications may be disabled in Grove settings, or Windows may be blocking them.

**Solution:** Check that the relevant notification toggles are enabled in Grove settings (`notify_merge_ready`, `notify_stale_branch`, `notify_merge_complete`). Also check Windows notification settings: open Windows Settings, go to System, then Notifications, and ensure Grove is allowed to send notifications. Focus Assist (Do Not Disturb) mode also suppresses notifications.

---

### Problem: Config file is corrupted

**Symptoms:** Grove fails to start or shows default/empty state despite having projects configured previously.

**Cause:** The JSON config file at `%APPDATA%/com.grove.app/config.json` has invalid syntax, typically from a manual edit.

**Solution:** Open the config file in a text editor and check for JSON syntax errors (missing commas, unclosed brackets, trailing commas). If the file is beyond repair, delete it and restart Grove -- it creates a fresh default configuration. If you had an export, use the import function to restore your projects after Grove recreates the config file.

---

### Problem: High CPU usage

**Symptoms:** Grove is consuming noticeable CPU, especially with multiple projects registered.

**Cause:** A low `refresh_interval` combined with many registered projects causes frequent git operations. Each refresh cycle opens a Repository instance for every project and every worktree branch.

**Solution:** Increase the `refresh_interval` setting. The default of 30 seconds is reasonable for most setups. For systems with many projects (10+), consider 60 or 120 seconds. Also check `auto_fetch_interval` -- frequent fetches to remote repositories add network and CPU overhead.

## Getting Help

If your issue is not listed above, open an issue at:

https://github.com/baldunderwear/grove/issues

Include the following information:

- Grove version (shown in the dashboard header or About dialog)
- Windows version
- Steps to reproduce the issue
- The relevant portion of your config file (redact paths if sensitive)
- Any error messages shown in the dashboard or dialog

## Log Locations

Grove stores its configuration at `%APPDATA%/com.grove.app/config.json`. There is no dedicated log file. Errors are written to stderr, which is only visible if you launch Grove from a terminal:

```
grove.exe 2> grove-errors.txt
```

This captures backend error output for debugging purposes.
