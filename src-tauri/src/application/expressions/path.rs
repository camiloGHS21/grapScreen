use serde_json::Value;

/// Walks a `.a.b[0].c` style path into a JSON value.
pub fn get_path(root: &Value, path: &str) -> Value {
    let mut curr = root;
    let mut rest = path.trim();
    if rest.is_empty() {
        return curr.clone();
    }
    if !rest.starts_with('.') && !rest.starts_with('[') {
        let end = rest.find(['.', '[']).unwrap_or(rest.len());
        let key = &rest[..end];
        curr = match curr.get(key) {
            Some(v) => v,
            None => return Value::Null,
        };
        rest = &rest[end..];
    }
    while !rest.is_empty() {
        if let Some(r) = rest.strip_prefix('.') {
            let end = r.find(['.', '[']).unwrap_or(r.len());
            let key = &r[..end];
            curr = match curr.get(key) {
                Some(v) => v,
                None => return Value::Null,
            };
            rest = &r[end..];
            continue;
        }
        if let Some(r) = rest.strip_prefix('[') {
            let close = match r.find(']') {
                Some(c) => c,
                None => return Value::Null,
            };
            let inner = r[..close].trim();
            let unquoted = inner.trim_matches(|c| c == '"' || c == '\'');
            if let Ok(idx) = unquoted.parse::<usize>() {
                curr = match curr.get(idx) {
                    Some(v) => v,
                    None => return Value::Null,
                };
            } else {
                curr = match curr.get(unquoted) {
                    Some(v) => v,
                    None => return Value::Null,
                };
            }
            rest = &r[close + 1..];
            continue;
        }
        break;
    }
    curr.clone()
}
