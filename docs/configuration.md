# Grove Configuration Reference

## Overview

Grove stores its configuration at `%APPDATA%/com.grove.app/config.json`. This is a single JSON file that is human-readable and can be edited manually. Restart Grove after making manual changes for them to take effect.

You can also export and import configuration from the Settings page in the dashboard.

## Full Example

```json
{
  "version": 1,
  "projects": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "my-project",
      "path": "C:/dev/my-project",
      "merge_target": "develop",
      "branch_prefix": "wt/",
      "build_files": [
        { "pattern": "src/version.py" },
        { "pattern": "src/config/constants.js" },
        { "pattern": "package.json" }
      ],
      "changelog": {
        "directory": "docs/changelog",
        "fragment_pattern": "worktree-{name}.md"
      }
    },
    {
      "id": "f9e8d7c6-b5a4-3210-fedc-ba0987654321",
      "name": "simple-project",
      "path": "C:/dev/simple-project",
      "merge_target": "main",
      "branch_prefix": "feature/"
    }
  ],
  "settings": {
    "refresh_interval": 30,
    "start_minimized": false,
    "start_with_windows": false,
    "theme": "dark",
    "auto_fetch_interval": 300,
    "notify_merge_ready": true,
    "notify_stale_branch": true,
    "notify_merge_complete": true
  }
}
```

## Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | number | `1` | Config schema version. Do not change manually. |
| `projects` | array | `[]` | List of registered project configurations. |
| `settings` | object | (see below) | Global application settings. |

## Project Configuration

Each entry in the `projects` array describes a registered git repository.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | yes | (auto-generated UUID) | Unique identifier for the project. Generated when adding a project. |
| `name` | string | yes | (auto-detected from repo) | Display name shown in the dashboard and tray menu. |
| `path` | string | yes | -- | Absolute path to the git repository root. Use forward slashes or escaped backslashes. |
| `merge_target` | string | yes | (auto-detected) | The branch that worktrees merge into (e.g., `develop`, `main`). |
| `branch_prefix` | string | no | `"wt/"` | Only branches starting with this prefix appear in the dashboard. |
| `build_files` | array | no | `[]` | Files containing build numbers that Grove manages during merge. |
| `changelog` | object | no | `null` | Changelog fragment configuration. Omit if your project does not use changelog fragments. |

## Build Files

The `build_files` array contains objects with a single field:

| Field | Type | Description |
|-------|------|-------------|
| `pattern` | string | Glob pattern matching files that contain build numbers. |

### How build files work

During a merge operation, if files matching these patterns have conflicts between the source branch and merge target, Grove:

1. Takes the merge target's version of the file (discards the branch version).
2. Reads the current build number from that file.
3. Increments the build number by 1.
4. Writes the new value back to the file.
5. Includes the updated file in the merge commit.

This resolves the most common conflict in parallel worktree workflows where multiple branches each bump the build number from the same base value.

### Example patterns

| Project type | Pattern | File example |
|-------------|---------|-------------|
| Python | `src/core/config/settings.py` | `build_number: int = Field(default=42,` |
| JavaScript | `src/config/constants.js` | `const BUILD_NUMBER = 42` |
| Node.js | `package.json` | `"buildNumber": 42` |

You can specify multiple patterns to cover projects with build numbers in several files.

## Changelog Configuration

The optional `changelog` object configures how Grove handles changelog fragment files during merge.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `directory` | string | `"docs/changelog"` | Path (relative to repo root) to the directory containing changelog fragments. |
| `fragment_pattern` | string | `"worktree-{name}.md"` | Naming pattern for branch-specific fragments. `{name}` is replaced with the worktree name. |

### How changelog fragments work

When a worktree branch is created, developers write a changelog fragment file named after the branch (e.g., `worktree-my-feature.md`). During merge, Grove:

1. Finds fragment files matching the pattern for the branch being merged.
2. Renames them from the branch-name format to the build-number format (e.g., `worktree-my-feature.md` becomes `42.md`).
3. Includes the rename in the merge commit.

If the rename fails (e.g., no fragment file exists), Grove logs a warning but completes the merge.

## Global Settings

The `settings` object controls application-wide behavior.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `refresh_interval` | number | `30` | Seconds between automatic branch status refreshes. Lower values mean more frequent updates but higher CPU usage. |
| `start_minimized` | boolean | `false` | If true, Grove starts with the window hidden. The app is still accessible from the system tray. |
| `start_with_windows` | boolean | `false` | If true, Grove launches automatically when you log in to Windows. |
| `theme` | string | `"dark"` | UI theme. Currently only `"dark"` is available. |
| `auto_fetch_interval` | number | `300` | Seconds between automatic `git fetch` operations for all projects. Set to `0` to disable. Minimum: 60. Maximum: 3600. |
| `notify_merge_ready` | boolean | `true` | Send a Windows notification when a branch has commits ahead and a clean working directory. |
| `notify_stale_branch` | boolean | `true` | Send a Windows notification when a branch has not had new commits for an extended period. |
| `notify_merge_complete` | boolean | `true` | Send a Windows notification when a merge operation completes successfully. |

## Health Checks

Grove validates each project's configuration on startup and when refreshing. A project can be in one of four states:

| Status | Meaning | Resolution |
|--------|---------|------------|
| **Healthy** | Path exists, is a git repo, merge target branch exists. | No action needed. |
| **PathNotFound** | The configured path does not exist or is inaccessible. | Check that the drive is connected and the directory exists. Update the path in project settings. |
| **NotGitRepo** | The path exists but is not a git repository. | Ensure you pointed Grove at the repository root (the directory containing `.git`). |
| **MissingMergeTarget** | The path is a valid git repo but the configured merge_target branch does not exist. | Create the branch, or update the merge_target in project settings to an existing branch. |

Health status is shown in the dashboard. Projects with errors display a warning indicator.

## Tips

- **Projects without build numbers:** Omit the `build_files` field entirely, or set it to an empty array. Grove handles plain merges without build number logic.
- **Projects without changelogs:** Omit the `changelog` field. Grove skips changelog fragment processing.
- **Manual config editing:** Open `%APPDATA%/com.grove.app/config.json` in any text editor. Make your changes, save, and restart Grove.
- **Backup before changes:** Use the Export button on the Settings page to save a copy of your configuration before making significant changes.
- **Multiple projects:** There is no limit on the number of registered projects. Each project is independent with its own merge target, prefix, and build file configuration.
