use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum NativeMaterial {
    LiquidGlass,
    Vibrancy,
    Mica,
    None,
}

#[cfg(target_os = "macos")]
pub fn apply(window: &tauri::WebviewWindow) -> NativeMaterial {
    use window_vibrancy::{
        apply_liquid_glass, apply_vibrancy, LiquidGlassOptions, NSGlassEffectViewStyle, NSVisualEffectMaterial,
        NSVisualEffectState,
    };
    match apply_liquid_glass(window, LiquidGlassOptions::new(NSGlassEffectViewStyle::Regular)) {
        Ok(()) => return NativeMaterial::LiquidGlass,
        Err(e) => log::info!("liquid glass unavailable ({e}); falling back to vibrancy"),
    }
    match apply_vibrancy(
        window,
        NSVisualEffectMaterial::Sidebar,
        Some(NSVisualEffectState::FollowsWindowActiveState),
        None,
    ) {
        Ok(()) => NativeMaterial::Vibrancy,
        Err(e) => {
            log::warn!("vibrancy unavailable: {e}");
            NativeMaterial::None
        }
    }
}

#[cfg(target_os = "windows")]
pub fn apply(window: &tauri::WebviewWindow) -> NativeMaterial {
    match window_vibrancy::apply_mica(window, None) {
        Ok(()) => NativeMaterial::Mica,
        Err(e) => {
            log::info!("mica unavailable: {e}");
            NativeMaterial::None
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn apply(_window: &tauri::WebviewWindow) -> NativeMaterial {
    NativeMaterial::None
}
