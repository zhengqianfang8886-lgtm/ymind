// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DriveInfo {
    pub name: String,
    pub path: String,
    pub is_removable: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SystemPlaces {
    pub home: String,
    pub documents: String,
    pub desktop: String,
    pub downloads: String,
    pub drives: Vec<DriveInfo>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileEntryItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

/// 🌟 跨平台物理盘符与挂载点枚举 (Windows A-Z, macOS Volumes, Linux Mounts)
#[tauri::command]
fn get_system_drives() -> Vec<DriveInfo> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for b in b'A'..=b'Z' {
            let letter = b as char;
            let root_str = format!("{}:\\", letter);
            let p = Path::new(&root_str);
            if p.exists() {
                drives.push(DriveInfo {
                    name: format!("本地磁盘 ({}:)", letter),
                    path: format!("{}:/", letter),
                    is_removable: false,
                });
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        drives.push(DriveInfo {
            name: "Macintosh HD".to_string(),
            path: "/".to_string(),
            is_removable: false,
        });

        if let Ok(entries) = fs::read_dir("/Volumes") {
            for entry in entries.flatten() {
                if let Ok(ft) = entry.file_type() {
                    if ft.is_dir() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name != "Macintosh HD" && !name.starts_with('.') {
                            drives.push(DriveInfo {
                                name,
                                path: entry.path().to_string_lossy().replace('\\', "/"),
                                is_removable: true,
                            });
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        drives.push(DriveInfo {
            name: "系统根目录 (/)".to_string(),
            path: "/".to_string(),
            is_removable: false,
        });

        for m_root in &["/media", "/run/media", "/mnt"] {
            if let Ok(entries) = fs::read_dir(m_root) {
                for entry in entries.flatten() {
                    if let Ok(ft) = entry.file_type() {
                        if ft.is_dir() {
                            let name = entry.file_name().to_string_lossy().to_string();
                            drives.push(DriveInfo {
                                name: format!("外部设备 ({})", name),
                                path: entry.path().to_string_lossy().replace('\\', "/"),
                                is_removable: true,
                            });
                        }
                    }
                }
            }
        }
    }

    drives
}

fn resolve_home_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Some(userprofile) = std::env::var_os("USERPROFILE") {
            return PathBuf::from(userprofile);
        }
        if let (Some(drive), Some(path)) = (std::env::var_os("HOMEDRIVE"), std::env::var_os("HOMEPATH")) {
            let mut p = PathBuf::from(drive);
            p.push(path);
            return p;
        }
        PathBuf::from("C:\\")
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home);
        }
        PathBuf::from("/")
    }
}

/// 🌟 获取系统常用目录与全部盘符
#[tauri::command]
fn get_system_places() -> SystemPlaces {
    let home = resolve_home_dir();
    let documents = home.join("Documents");
    let desktop = home.join("Desktop");
    let downloads = home.join("Downloads");

    SystemPlaces {
        home: home.to_string_lossy().replace('\\', "/"),
        documents: documents.to_string_lossy().replace('\\', "/"),
        desktop: desktop.to_string_lossy().replace('\\', "/"),
        downloads: downloads.to_string_lossy().replace('\\', "/"),
        drives: get_system_drives(),
    }
}

/// 🌟 列出目录文件（自动排除点开头的隐藏项）
#[tauri::command]
fn list_directory(dir_path: String) -> Result<Vec<FileEntryItem>, String> {
    let clean_path = dir_path.trim();
    let path = Path::new(clean_path);
    if !path.exists() {
        return Err(format!("目录不存在: {}", clean_path));
    }

    let mut result = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let entry_path = entry.path();
        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified = metadata
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with('.') {
            continue;
        }

        result.push(FileEntryItem {
            name: file_name,
            path: entry_path.to_string_lossy().replace('\\', "/"),
            is_dir,
            size,
            modified,
        });
    }

    Ok(result)
}

/// 🌟 跨平台创建多层目录
#[tauri::command]
fn create_directory(dir_path: String) -> Result<bool, String> {
    fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;
    Ok(true)
}

/// 🌟 读取文件内容
#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 🌟 保存思维导图文件
#[tauri::command]
fn save_mindmap_file(path: String, _default_name: String, content: String) -> Result<String, String> {
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_system_drives,
            get_system_places,
            list_directory,
            create_directory,
            read_file_content,
            save_mindmap_file
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用失败");
}