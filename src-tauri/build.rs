fn main() {
    let attrs = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attrs).expect("failed to run tauri-build");

    // `tauri_build` solo enlaza `resource.lib` (icono) para `bins`.
    // Desactivamos el manifiesto de `resource.lib` (`new_without_app_manifest`) e inyectamos
    // `windows.manifest` vía `/MANIFEST:EMBED` para que tanto el binario principal como los
    // binarios de test tengan el manifiesto SxS de comctl32 v6 (`TaskDialogIndirect`) sin
    // generar error de recurso duplicado (CVT1100 / LNK1123).
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("windows.manifest");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg=/MANIFESTINPUT:{}",
            manifest.display()
        );
    }
}

