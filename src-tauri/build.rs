fn main() {
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/macos_picker.m")
            .file("src/macos_icon.m")
            .file("src/macos_clipboard.m")
            .compiler("clang")
            .flag("-fobjc-arc")
            .flag("-Wno-undeclared-selector")
            .flag("-Wno-deprecated-declarations")
            .compile("macos_icon_and_picker");
        println!("cargo:rustc-link-lib=framework=AppKit");
    }
    tauri_build::build()
}
