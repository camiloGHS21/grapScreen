//! Minimal ZIP helper functions extracted from xlsx_writer.rs to keep code files under 300 lines.

use std::path::Path;

pub fn crc32(data: &[u8]) -> u32 {
    let mut table = [0u32; 256];
    for n in 0..256u32 {
        let mut c = n;
        for _ in 0..8 {
            if c & 1 != 0 {
                c = 0xEDB8_8320 ^ (c >> 1);
            } else {
                c >>= 1;
            }
        }
        table[n as usize] = c;
    }
    let mut crc: u32 = 0xFFFF_FFFF;
    for &b in data {
        crc = table[((crc ^ b as u32) & 0xFF) as usize] ^ (crc >> 8);
    }
    crc ^ 0xFFFF_FFFF
}

/// Write a ZIP archive (store / no compression) from the given (name, bytes) entries.
pub fn write_zip(path: &Path, files: &[(&str, Vec<u8>)]) -> std::io::Result<()> {
    let mut buf: Vec<u8> = Vec::new();
    let mut central: Vec<u8> = Vec::new();

    for (name, data) in files {
        let local_offset = buf.len() as u32;
        let name_bytes = name.as_bytes();
        let crc = crc32(data);
        let size = data.len() as u32;

        // Local file header
        buf.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        buf.extend_from_slice(&20u16.to_le_bytes()); // version needed
        buf.extend_from_slice(&0u16.to_le_bytes()); // general purpose flag
        buf.extend_from_slice(&0u16.to_le_bytes()); // compression method (store)
        buf.extend_from_slice(&0u16.to_le_bytes()); // last mod time
        buf.extend_from_slice(&0u16.to_le_bytes()); // last mod date
        buf.extend_from_slice(&crc.to_le_bytes());
        buf.extend_from_slice(&size.to_le_bytes()); // compressed size
        buf.extend_from_slice(&size.to_le_bytes()); // uncompressed size
        buf.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
        buf.extend_from_slice(&0u16.to_le_bytes()); // extra field length
        buf.extend_from_slice(name_bytes);
        buf.extend_from_slice(data);

        // Central directory entry
        central.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes()); // version made by
        central.extend_from_slice(&20u16.to_le_bytes()); // version needed
        central.extend_from_slice(&0u16.to_le_bytes()); // general purpose flag
        central.extend_from_slice(&0u16.to_le_bytes()); // compression method
        central.extend_from_slice(&0u16.to_le_bytes()); // last mod time
        central.extend_from_slice(&0u16.to_le_bytes()); // last mod date
        central.extend_from_slice(&crc.to_le_bytes());
        central.extend_from_slice(&size.to_le_bytes());
        central.extend_from_slice(&size.to_le_bytes());
        central.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes()); // extra field length
        central.extend_from_slice(&0u16.to_le_bytes()); // file comment length
        central.extend_from_slice(&0u16.to_le_bytes()); // disk number start
        central.extend_from_slice(&0u16.to_le_bytes()); // internal file attributes
        central.extend_from_slice(&0u32.to_le_bytes()); // external file attributes
        central.extend_from_slice(&local_offset.to_le_bytes());
        central.extend_from_slice(name_bytes);
    }

    let central_offset = buf.len() as u32;
    let central_size = central.len() as u32;
    let num = files.len() as u16;

    buf.extend_from_slice(&central);
    buf.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    buf.extend_from_slice(&0u16.to_le_bytes()); // disk number
    buf.extend_from_slice(&0u16.to_le_bytes()); // disk with central dir
    buf.extend_from_slice(&num.to_le_bytes());
    buf.extend_from_slice(&num.to_le_bytes());
    buf.extend_from_slice(&central_size.to_le_bytes());
    buf.extend_from_slice(&central_offset.to_le_bytes());
    buf.extend_from_slice(&0u16.to_le_bytes()); // comment length

    std::fs::write(path, &buf)
}

pub fn extract_zip_entry(zip: &[u8], target: &str) -> Option<Vec<u8>> {
    let mut pos = 0usize;
    while pos + 30 <= zip.len() {
        let sig = u32::from_le_bytes([zip[pos], zip[pos + 1], zip[pos + 2], zip[pos + 3]]);
        if sig != 0x0403_4b50 {
            break;
        }
        let name_len = u16::from_le_bytes([zip[pos + 26], zip[pos + 27]]) as usize;
        let extra_len = u16::from_le_bytes([zip[pos + 28], zip[pos + 29]]) as usize;
        let comp_size = u32::from_le_bytes([zip[pos + 18], zip[pos + 19], zip[pos + 20], zip[pos + 21]]) as usize;
        let name_start = pos + 30;
        if name_start + name_len > zip.len() {
            break;
        }
        let name = &zip[name_start..name_start + name_len];
        let data_start = name_start + name_len + extra_len;
        if data_start + comp_size > zip.len() {
            break;
        }
        if name == target.as_bytes() {
            return Some(zip[data_start..data_start + comp_size].to_vec());
        }
        pos = data_start + comp_size;
    }
    None
}
