const COMMANDS: &[&str] = &["tabs", "select", "visibility", "registerListener", "remove_listener"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
