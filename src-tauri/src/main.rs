// Lumora, an unofficial desktop client for Proton Lumo (lumo.proton.me).
// The web client does the actual work. This shell hosts it in WebKitGTK
// and adds session persistence, a custom titlebar, tray, hotkey and export

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const HOME_URL: &str = "https://lumo.proton.me";
const INIT_JS: &str = include_str!("inject.js");

// Hosts allowed to load inside the app window. Everything else opens in the
// system browser instead. hcaptcha is needed for login challenges
fn host_is_allowed(host: &str) -> bool {
    host == "proton.me"
        || host.ends_with(".proton.me")
        || host == "protonmail.com"
        || host.ends_with(".protonmail.com")
        || host == "hcaptcha.com"
        || host.ends_with(".hcaptcha.com")
}

// xdg-open can block for a moment, so never call it on the UI thread
fn open_external(url: String) {
    std::thread::spawn(move || {
        let _ = open::that(url);
    });
}

#[derive(serde::Deserialize)]
struct SavePayload {
    filename: String,
    contents: String,
}

// Handles the "save-transcript" event emitted by inject.js and writes the
// export to the Downloads folder. This goes over the event bus instead of a
// command because the webview origin is remote, and remote origins can't be
// granted access to app commands in Tauri v2
fn save_transcript(app: &tauri::AppHandle, payload: &str) {
    let data: SavePayload = match serde_json::from_str(payload) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("lumora: bad save payload: {e}");
            return;
        }
    };

    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    // Keep only filename-safe characters. The page never controls the path
    let mut name: String = data
        .filename
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if name.is_empty() {
        name = "lumo-conversation".to_string();
    }

    // Don't overwrite an earlier export with the same timestamp
    let mut path = dir.join(format!("{name}.txt"));
    let mut n = 1;
    while path.exists() {
        path = dir.join(format!("{name}-{n}.txt"));
        n += 1;
    }

    match std::fs::write(&path, &data.contents) {
        Ok(_) => {
            let _ = app.emit("save-transcript-done", path.to_string_lossy().to_string());
        }
        Err(e) => {
            eprintln!("lumora: save failed: {e}");
            let _ = app.emit("save-transcript-error", e.to_string());
        }
    }
}

fn show_and_focus(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn main() {
    // WebKitGTK 2.50's in-place WASM interpreter crashes with a fatal assert
    // (ipint_reserved_0xcb_validate) in Proton's post-login crypto, killing
    // the web process right after 2FA. Forcing the older WASM tiers avoids
    // it. Took a coredump backtrace to find. Must be set before any webview
    // exists. Remove once fixed upstream
    #[cfg(target_os = "linux")]
    std::env::set_var("JSC_useWasmIPInt", "0");

    let hotkey = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyL);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Not restoring DECORATIONS or FULLSCREEN. The window has to
                // stay frameless no matter what was saved
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, sc, event| {
                    if sc == &hotkey && event.state() == ShortcutState::Pressed {
                        show_and_focus(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            let handle = app.handle().clone();

            let show_i = MenuItem::with_id(app, "show", "Show Lumora", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit Lumora", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            // The icon is embedded at compile time. Loading it from a path at
            // runtime breaks in the packaged AppImage, where the working
            // directory is wherever the app was launched from
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(tray_icon)
                .tooltip("Lumora")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_and_focus(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left click toggles the window, right click opens the menu.
                    if let TrayIconEvent::Click { button, .. } = event {
                        if button == tauri::tray::MouseButton::Left {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) {
                                    let _ = w.hide();
                                } else {
                                    show_and_focus(app);
                                }
                            }
                        }
                    }
                })
                .build(app)?;

            // Registration can fail on Wayland compositors that own global
            // shortcuts. The app still works, only the hotkey is lost.
            if let Err(e) = app.global_shortcut().register(hotkey) {
                eprintln!("lumora: hotkey register failed: {e}");
            }

            let win = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(HOME_URL.parse().unwrap()))
                .title("Lumora")
                .inner_size(980.0, 680.0)
                .min_inner_size(760.0, 560.0)
                .center()
                .decorations(false)
                .theme(Some(tauri::Theme::Dark))
                .background_color(tauri::webview::Color(13, 11, 22, 255))
                .initialization_script(INIT_JS)
                .on_navigation(|url| {
                    match url.scheme() {
                        "http" | "https" => {
                            let allowed = url.host_str().map(host_is_allowed).unwrap_or(false);
                            if !allowed {
                                open_external(url.to_string());
                            }
                            allowed
                        }
                        // Internal page machinery (iframes, blobs).
                        "about" | "blob" | "data" => true,
                        "mailto" | "tel" => {
                            open_external(url.to_string());
                            false
                        }
                        // file:, javascript: and custom protocol handlers are
                        // blocked outright. Never hand those to xdg-open.
                        _ => false,
                    }
                })
                .build()?;

            // Closing the window hides it to the tray. Quit is in the tray menu.
            let win_for_close = win.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win_for_close.hide();
                }
            });

            let save_handle = handle.clone();
            app.listen("save-transcript", move |event| {
                save_transcript(&save_handle, event.payload());
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to launch Lumora");
}