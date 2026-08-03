use notify::{Event, EventKind, RecursiveMode, Watcher, Config};
use regex::Regex;
use serde::Serialize;
use std::sync::Mutex;
use tauri::Emitter;

pub mod search;

#[derive(Debug, Serialize)]
struct LinkCheckIssue {
    url: String,
    status: String,
    message: String,
}

#[derive(Debug, Serialize)]
struct SecretScanResult {
    matches: usize,
}



struct FolderWatcher {
    watcher: Mutex<Option<notify::RecommendedWatcher>>,
    path: Mutex<Option<String>>,
}

#[cfg(target_os = "windows")]
fn toggle_file_association(
    extension: &str,
    prog_id: &str,
    description: &str,
    enable: bool,
) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let classes = hkcu
        .open_subkey_with_flags("Software\\Classes", KEY_ALL_ACCESS)
        .map_err(|e| e.to_string())?;

    if enable {
        let (ext_key, _) = classes.create_subkey(extension).map_err(|e| e.to_string())?;
        ext_key.set_value("", &prog_id).map_err(|e| e.to_string())?;

        let (prog_key, _) = classes.create_subkey(prog_id).map_err(|e| e.to_string())?;
        prog_key.set_value("", &description).map_err(|e| e.to_string())?;

        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;

        let (icon_key, _) = prog_key
            .create_subkey("DefaultIcon")
            .map_err(|e| e.to_string())?;
        let icon_str = format!("\"{}\",0", exe_path.display());
        icon_key
            .set_value("", &icon_str)
            .map_err(|e| e.to_string())?;

        let (command_key, _) = prog_key
            .create_subkey("shell\\open\\command")
            .map_err(|e| e.to_string())?;

        let command_str = format!("\"{}\" \"%1\"", exe_path.display());

        command_key
            .set_value("", &command_str)
            .map_err(|e| e.to_string())?;
    } else if let Ok(ext_key) = classes.open_subkey_with_flags(extension, KEY_READ | KEY_WRITE) {
        let current_val: String = ext_key.get_value("").unwrap_or_default();
        if current_val == prog_id {
            let _ = ext_key.delete_value("");
        }
    }

    Ok(())
}

#[tauri::command]
fn watch_folder(app: tauri::AppHandle, path: String, state: tauri::State<'_, FolderWatcher>) {
    // Stop any existing watcher
    if let Some(w) = state.watcher.lock().unwrap().take() {
        // Drop the watcher
        drop(w);
    }

    let app_handle = app.clone();
    let path_clone = path.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        match res {
            Ok(event) => {
                // Filter for document-related events and emit to frontend.
                let is_supported_document_change = event.paths.iter().any(|p| {
                    let ext = p.extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("");
                    matches!(ext, "md" | "markdown" | "txt" | "json")
                        || p.is_dir()
                });

                if is_supported_document_change {
                    let kind = match event.kind {
                        EventKind::Create(_) => "create",
                        EventKind::Modify(_) => "modify",
                        EventKind::Remove(_) => "remove",
                        _ => return,
                    };
                    let _ = app_handle.emit("file-change", serde_json::json!({
                        "kind": kind,
                        "paths": event.paths.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>(),
                    }));
                }
            }
            Err(e) => {
                log::error!("Watch error: {:?}", e);
            }
        }
    }).unwrap();

    watcher.configure(Config::default()
        .with_poll_interval(std::time::Duration::from_secs(1))
    ).ok();

    watcher.watch(std::path::Path::new(&path_clone), RecursiveMode::Recursive).ok();

    let mut guard = state.watcher.lock().unwrap();
    *guard = Some(watcher);

    let mut path_guard = state.path.lock().unwrap();
    *path_guard = Some(path_clone);
}

#[tauri::command]
fn stop_watching(state: tauri::State<'_, FolderWatcher>) {
    let mut guard = state.watcher.lock().unwrap();
    if let Some(w) = guard.take() {
        drop(w);
    }
    let mut path_guard = state.path.lock().unwrap();
    *path_guard = None;
}

#[tauri::command]
fn toggle_md_association(enable: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    toggle_file_association(".md", "PrismPane.Editor.Markdown", "Markdown File", enable)?;

    Ok(())
}

#[tauri::command]
fn toggle_json_association(enable: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    toggle_file_association(".json", "PrismPane.Editor.Json", "JSON File", enable)?;

    Ok(())
}

#[tauri::command]
fn get_startup_file() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        for arg in args.into_iter().skip(1) {
            if !arg.starts_with("--") {
                let path = std::path::Path::new(&arg);
                if path.exists() && path.is_file() {
                    return Some(arg);
                }
            }
        }
    }
    None
}

#[tauri::command]
async fn check_links_with_lychee(content: String) -> Result<Vec<LinkCheckIssue>, String> {
    let url_regex = Regex::new(r#"https?://[^\s\)\]"'>]+"#).map_err(|e| e.to_string())?;
    let mut seen = std::collections::HashSet::new();
    let mut issues = Vec::new();

    for matched in url_regex.find_iter(&content) {
        let url = matched.as_str().to_string();
        if !seen.insert(url.clone()) {
            continue;
        }

        match lychee_lib::check(url.as_str()).await {
            Ok(response) => {
                let status = response.status();
                if !status.is_success() {
                    issues.push(LinkCheckIssue {
                        url,
                        status: status.to_string(),
                        message: "Link check failed".to_string(),
                    });
                }
            }
            Err(err) => {
                issues.push(LinkCheckIssue {
                    url,
                    status: "error".to_string(),
                    message: err.to_string(),
                });
            }
        }
    }

    Ok(issues)
}



#[tauri::command]
fn scan_secrets_with_ripsecrets(content: String) -> Result<SecretScanResult, String> {
    use std::io::Write;
    use std::path::PathBuf;
    use termcolor::{BufferWriter, ColorChoice};

    let mut temp = tempfile::Builder::new()
        .prefix("prismpane-secrets-")
        .suffix(".txt")
        .tempfile()
        .map_err(|e| e.to_string())?;

    temp.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    temp.flush().map_err(|e| e.to_string())?;

    let path: PathBuf = temp.path().to_path_buf();
    let count = ripsecrets::find_secrets(
        &[path],
        &[],
        false,
        true,
        BufferWriter::stdout(ColorChoice::Never),
    )
    .map_err(|e| e.to_string())?;

    Ok(SecretScanResult { matches: count })
}

#[tauri::command]
fn get_fallback_schema_catalog() -> String {
    include_str!("../resources/catalog.json").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if argv.len() > 1 {
                for arg in argv.into_iter().skip(1) {
                    if !arg.starts_with("--") {
                        let path = std::path::Path::new(&arg);
                        if path.exists() && path.is_file() {
                            let _ = app.emit("open-external-file", arg);
                            break;
                        }
                    }
                }
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(FolderWatcher {
            watcher: Mutex::new(None),
            path: Mutex::new(None),
        })
        .manage(search::SearchState {
            index: Mutex::new(None),
            reader: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            watch_folder, 
            stop_watching,
            toggle_md_association,
            toggle_json_association,
            get_startup_file,
            check_links_with_lychee,
            scan_secrets_with_ripsecrets,
            get_fallback_schema_catalog,
            search::build_search_index,
            search::search_index
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                use tauri_plugin_window_state::{WindowExt, StateFlags};
                let _ = window.restore_state(StateFlags::all());
                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Resized(_)
            | tauri::WindowEvent::Moved(_)
            | tauri::WindowEvent::CloseRequested { .. } => {
                use tauri::Manager;
                use tauri_plugin_window_state::{AppHandleExt, StateFlags};
                let _ = window.app_handle().save_window_state(StateFlags::all());
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
