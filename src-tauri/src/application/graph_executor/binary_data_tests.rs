#[cfg(test)]
mod tests {
    use super::super::binary_data::*;
    use serde_json::json;

    #[test]
    fn mime_detection_from_extension() {
        let png = BinaryData::from_bytes(b"dummy", Some("photo.PNG"), None);
        assert_eq!(png.mime_type.as_deref(), Some("image/png"));
        assert_eq!(png.file_extension.as_deref(), Some("png"));

        let pdf = BinaryData::from_bytes(b"dummy", Some("document.pdf"), None);
        assert_eq!(pdf.mime_type.as_deref(), Some("application/pdf"));

        let json_file = BinaryData::from_bytes(b"{}", Some("payload.json"), None);
        assert_eq!(json_file.mime_type.as_deref(), Some("application/json"));
    }

    #[test]
    fn mime_detection_from_magic_bytes() {
        let png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00";
        let detected = mime_from_magic_bytes(png_bytes);
        assert_eq!(detected, Some("image/png"));

        let pdf_bytes = b"%PDF-1.4\n...";
        let detected_pdf = mime_from_magic_bytes(pdf_bytes);
        assert_eq!(detected_pdf, Some("application/pdf"));
    }

    #[test]
    fn base64_roundtrip_preserves_bytes() {
        let original = vec![0u8, 1, 2, 255, 128, 64, 32, 16];
        let bin = BinaryData::from_bytes(&original, Some("binary.bin"), None);
        let decoded = bin.to_bytes().expect("debe decodificar base64");
        assert_eq!(original, decoded);
    }

    #[test]
    fn wrap_and_extract_binary_envelope() {
        let original_bytes = b"Hello n8n Binary World";
        let bin = BinaryData::from_bytes(original_bytes, Some("hello.txt"), Some("text/plain"));

        let wrapped = wrap_binary_item(json!({ "id": 123 }), "data", bin.clone());
        assert!(wrapped.get("json").is_some());
        assert!(wrapped.get("binary").is_some());

        let extracted = extract_binary(&wrapped, "data").expect("debe extraer binary");
        assert_eq!(extracted.file_name.as_deref(), Some("hello.txt"));
        assert_eq!(extracted.mime_type.as_deref(), Some("text/plain"));

        let extracted_bytes = extract_bytes(&wrapped, "data").expect("debe extraer bytes");
        assert_eq!(extracted_bytes, original_bytes);
    }

    #[test]
    fn binary_file_read_and_write_pipeline() {
        let temp_dir = std::env::temp_dir().join(format!("grap_bin_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let src_file = temp_dir.join("input.dat");
        let dst_file = temp_dir.join("output.dat");

        let test_data = b"N8N_BINARY_STREAM_TEST_DATA_\x01\x02\x03\xff";
        std::fs::write(&src_file, test_data).expect("escribir archivo fuente");

        // 1. Read binary file
        let read_config = json!({
            "filePath": src_file.to_str().unwrap(),
            "dataPropertyName": "customData"
        });
        let read_res = run_read_binary_file(&read_config, vec![]).expect("leer archivo binario");
        assert_eq!(read_res.len(), 1);

        let item = &read_res[0];
        let extracted_bytes = extract_bytes(item, "customData").expect("extraer customData");
        assert_eq!(extracted_bytes, test_data);

        // 2. Write binary file
        let write_config = json!({
            "filePath": dst_file.to_str().unwrap(),
            "dataPropertyName": "customData"
        });
        let write_res = run_write_binary_file(&write_config, read_res).expect("escribir archivo binario");
        assert_eq!(write_res[0]["success"], true);

        // 3. Verify destination file on disk
        let written_bytes = std::fs::read(&dst_file).expect("leer archivo escrito");
        assert_eq!(written_bytes, test_data);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
