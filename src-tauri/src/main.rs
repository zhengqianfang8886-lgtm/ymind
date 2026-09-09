#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Prevents additional console window on Windows in release, DO NOT REMOVE!!

use std::fs;
use std::path::PathBuf;
use tauri::Manager;


// 🌟 Rust 原生保存引擎：支持弹窗选目录保存 & 覆盖保存
#[tauri::command]
fn save_mindmap_file(path: Option<String>, default_name: String, content: String) -> Result<String, String> {
    let target_path = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => {
            let file_path = rfd::FileDialog::new()
                .set_file_name(&default_name)
                .add_filter("YMind 思维导图 (*.ymind)", &["ymind", "mind", "json"])
                .add_filter("所有文件 (*.*)", &["*"])
                .save_file();

            match file_path {
                Some(p) => p,
                None => return Ok("CANCELLED".to_string()),
            }
        }
    };

    fs::write(&target_path, content).map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(target_path.to_string_lossy().to_string())
}

// 🌟 Rust 原生打开引擎：支持读取任意 .mind, .ymind, .json, .xmind
#[tauri::command]
fn open_mindmap_file() -> Result<Option<(String, String)>, String> {
    let file_path = rfd::FileDialog::new()
        .add_filter("思维导图文件 (*.mind, *.ymind, *.json, *.xmind)", &["mind", "ymind", "json", "xmind"])
        .add_filter("所有文件 (*.*)", &["*"])
        .pick_file();

    match file_path {
        Some(p) => {
            let content = fs::read_to_string(&p).map_err(|e| format!("读取文件失败: {}", e))?;
            Ok(Some((p.to_string_lossy().to_string(), content)))
        }
        None => Ok(None),
    }
}


#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}


#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct SystemPlaces {
    pub home: String,
    pub documents: String,
    pub desktop: String,
    pub downloads: String,
}

#[tauri::command]
fn get_system_places() -> SystemPlaces {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
    let docs = format!("{}/Documents", home);
    let desktop = format!("{}/Desktop", home);
    let downloads = format!("{}/Downloads", home);
    SystemPlaces {
        home,
        documents: docs,
        desktop,
        downloads,
    }
}

#[tauri::command]
fn list_directory(dir_path: String) -> Result<Vec<FileEntry>, String> {
    let p = std::path::Path::new(&dir_path);
    if !p.is_dir() {
        return Err("Not a directory".into());
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(p).map_err(|e| e.to_string())?;

    for entry in read_dir.flatten() {
        let p_buf = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && name != ".ymind" {
            continue;
        }

        let is_dir = p_buf.is_dir();
        let metadata = entry.metadata().ok();
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified = metadata
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        entries.push(FileEntry {
            name,
            path: p_buf.to_string_lossy().to_string(),
            is_dir,
            size,
            modified,
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}



#[tauri::command]
fn create_directory(dir_path: String) -> Result<(), String> {
    std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
                let window = app.get_webview_window("main").unwrap();
                window.maximize()?;
                Ok(())
        })
        .invoke_handler(tauri::generate_handler![read_file_content, save_mindmap_file, open_mindmap_file, get_system_places, list_directory, create_directory])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}