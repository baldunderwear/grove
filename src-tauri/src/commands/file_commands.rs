use serde::Serialize;

/// A directory entry returned by list_directory.
#[derive(Debug, Clone, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

/// Maximum file size we'll read (512 KB).
const MAX_FILE_SIZE: u64 = 512 * 1024;

/// Read a text file at the given path and return its contents as a UTF-8 string.
/// Returns an error if the file is not found, not readable, or exceeds 512 KB.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let file_path = std::path::Path::new(&path);

    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    let metadata = std::fs::metadata(file_path)
        .map_err(|e| format!("Cannot read file metadata: {}", e))?;

    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File too large ({} bytes, max {} bytes): {}",
            metadata.len(),
            MAX_FILE_SIZE,
            path
        ));
    }

    std::fs::read_to_string(file_path)
        .map_err(|e| format!("Cannot read file: {}", e))
}

/// Write text content to the given path, creating parent directories if needed.
/// Returns an error if the path is empty or the write fails.
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let file_path = std::path::Path::new(&path);

    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create parent directories: {}", e))?;
    }

    std::fs::write(file_path, content)
        .map_err(|e| format!("Cannot write file: {}", e))
}

/// List the immediate children of a directory.
/// Returns name, is_dir, and size for each entry.
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let dir_path = std::path::Path::new(&path);

    if !dir_path.exists() {
        return Err(format!("Directory not found: {}", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries = Vec::new();

    let read_dir = std::fs::read_dir(dir_path)
        .map_err(|e| format!("Cannot read directory: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Cannot read entry: {}", e))?;
        let metadata = entry.metadata().map_err(|e| format!("Cannot read metadata: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();

        entries.push(DirEntry {
            name,
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }

    // Sort: directories first, then by name
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name))
    });

    Ok(entries)
}

/// Delete a file at the given path.
/// Returns an error if the file doesn't exist or cannot be removed.
#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    let file_path = std::path::Path::new(&path);

    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    if file_path.is_dir() {
        return Err(format!("Path is a directory, not a file: {}", path));
    }

    std::fs::remove_file(file_path)
        .map_err(|e| format!("Cannot delete file: {}", e))
}
