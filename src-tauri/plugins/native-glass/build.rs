const COMMANDS: &[&str] = &["tabs", "select", "visibility"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
