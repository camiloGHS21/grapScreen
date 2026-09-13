//! Minimal, dependency-free XLSX (Office Open XML) writer + reader.
//! Writes a real .xlsx file using inline strings and a store-only ZIP container,
//! so no external crates are required. Good enough for spreadsheet data produced
//! by the "Excel / CSV" node.

use std::path::Path;
use super::zip_util::{write_zip, extract_zip_entry};


fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

fn col_letter(mut n: usize) -> String {
    let mut s = String::new();
    n += 1;
    while n > 0 {
        let rem = (n - 1) % 26;
        s.insert(0, (b'A' + rem as u8) as char);
        n = (n - 1) / 26;
    }
    s
}

fn build_sheet_xml(header: &[String], rows: &[Vec<String>]) -> String {
    let mut s = String::new();
    s.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n");
    s.push_str("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>");
    let mut r = 1u32;
    if !header.is_empty() {
        s.push_str(&format!("<row r=\"{}\">", r));
        for (ci, h) in header.iter().enumerate() {
            s.push_str(&format!(
                "<c r=\"{}{}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">{}</t></is></c>",
                col_letter(ci),
                r,
                xml_escape(h)
            ));
        }
        s.push_str("</row>");
        r += 1;
    }
    for row in rows {
        s.push_str(&format!("<row r=\"{}\">", r));
        for (ci, cell) in row.iter().enumerate() {
            s.push_str(&format!(
                "<c r=\"{}{}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">{}</t></is></c>",
                col_letter(ci),
                r,
                xml_escape(cell)
            ));
        }
        s.push_str("</row>");
        r += 1;
    }
    s.push_str("</sheetData></worksheet>");
    s
}

const CONTENT_TYPES: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>";
const ROOT_RELS: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>";
const WORKBOOK: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Sheet1\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>";
const WORKBOOK_RELS: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>";

/// Write a real Excel .xlsx file containing the given header and rows.
pub fn write_xlsx(path: &Path, header: &[String], rows: &[Vec<String>]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let sheet = build_sheet_xml(header, rows);
    let files: &[(&str, Vec<u8>)] = &[
        ("[Content_Types].xml", CONTENT_TYPES.as_bytes().to_vec()),
        ("_rels/.rels", ROOT_RELS.as_bytes().to_vec()),
        ("xl/workbook.xml", WORKBOOK.as_bytes().to_vec()),
        ("xl/_rels/workbook.xml.rels", WORKBOOK_RELS.as_bytes().to_vec()),
        ("xl/worksheets/sheet1.xml", sheet.as_bytes().to_vec()),
    ];
    write_zip(path, files)
}



fn unescape_xml(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

/// Minimal parser for the sheet XML we generate (inline strings).
fn parse_sheet_rows(xml: &str) -> Option<Vec<Vec<String>>> {
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut pos = 0usize;
    while pos < xml.len() {
        if let Some(row_start) = find_tag_start(xml, pos, "row") {
            let (row_body_start, row_body_end) = match tag_body_range(xml, row_start, "row") {
                Some(r) => r,
                None => break,
            };
            let body = &xml[row_body_start..row_body_end];
            let mut cells: Vec<String> = Vec::new();
            let mut cpos = 0usize;
            while cpos < body.len() {
                if let Some(c_start) = find_tag_start(body, cpos, "c") {
                    if let Some((c_body_start, c_body_end)) = tag_body_range(body, c_start, "c") {
                        // Find the inline string text within this cell.
                        if let Some(is_start) = find_tag_start(body, c_body_start, "is") {
                            if let Some(t_start) = find_tag_start(body, is_start, "t") {
                                if let Some((t_body_start, t_body_end)) = tag_body_range(body, t_start, "t") {
                                    let raw = &body[t_body_start..t_body_end];
                                    cells.push(unescape_xml(raw));
                                }
                            }
                        }
                        cpos = c_body_end;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            rows.push(cells);
            pos = row_body_end;
        } else {
            break;
        }
    }
    Some(rows)
}

/// Return the byte offset of the `<tag ...>` opener starting at or after `from`, if any.
fn find_tag_start(s: &str, from: usize, tag: &str) -> Option<usize> {
    let pat = format!("<{}", tag);
    let idx = s[from..].find(&pat)? + from;
    Some(idx)
}

/// Given the offset of a `<tag`, return the (inner_start, inner_end) range of its body,
/// accounting for the matching `</tag>`.
fn tag_body_range(s: &str, tag_open: usize, tag: &str) -> Option<(usize, usize)> {
    let close = format!("</{}>", tag);
    let after_open = s[tag_open..].find('>')? + tag_open + 1;
    if s[tag_open..after_open].ends_with("/>") {
        return Some((after_open, after_open));
    }
    let body_end = s[after_open..].find(&close)? + after_open;
    Some((after_open, body_end))
}

/// Read rows from an existing .xlsx (used for append mode). Returns None on any failure.
pub fn read_xlsx_rows(path: &Path) -> Option<Vec<Vec<String>>> {
    let data = std::fs::read(path).ok()?;
    let sheet = extract_zip_entry(&data, "xl/worksheets/sheet1.xml")?;
    let sheet_str = String::from_utf8(sheet).ok()?;
    parse_sheet_rows(&sheet_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_reads_xlsx_roundtrip() {
        let dir = std::env::temp_dir().join("xlsx_writer_test");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("test.xlsx");
        let _ = std::fs::remove_file(&path);

        let header = vec!["Nombre".to_string(), "Email".to_string()];
        let rows = vec![
            vec!["Ana <&> \"x\"".to_string(), "ana@mail.com".to_string()],
            vec!["BetO".to_string(), "betO@mail.com".to_string()],
        ];
        write_xlsx(&path, &header, &rows).expect("write failed");
        assert!(path.exists(), "xlsx file should exist");

        let read = read_xlsx_rows(&path).expect("read failed");
        assert_eq!(read.len(), 3, "header + 2 rows");
        assert_eq!(read[0], header);
        assert_eq!(read[1], rows[0]);
        assert_eq!(read[2], rows[1]);

        // Append mode: read existing, drop duplicate header, add new rows.
        let prev = read_xlsx_rows(&path).unwrap();
        let mut combined = prev;
        if combined.first() == Some(&header) {
            combined.remove(0);
        }
        combined.extend(vec![vec!["Carlos".to_string(), "carlos@mail.com".to_string()]]);
        write_xlsx(&path, &[], &combined).expect("rewrite failed");
        let read2 = read_xlsx_rows(&path).unwrap();
        assert_eq!(read2.len(), 3, "two data rows after dedup+append");
        assert_eq!(read2[0], rows[0]);
        assert_eq!(read2[2], vec!["Carlos".to_string(), "carlos@mail.com".to_string()]);
    }
}

