/// Returns true when the string contains at least one complete `{{ ... }}`.
pub fn contains_expression(input: &str) -> bool {
    let bytes = input.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'{' && bytes[i + 1] == b'{' {
            if let Some(end) = find_close(input, i + 2) {
                let _ = end;
                return true;
            }
        }
        i += 1;
    }
    false
}

/// Finds the index of the closing `}}` starting the search at `from`.
pub fn find_close(input: &str, from: usize) -> Option<usize> {
    let bytes = input.as_bytes();
    let mut i = from;
    let mut in_string: Option<u8> = None;
    while i + 1 < bytes.len() {
        let c = bytes[i];
        if let Some(q) = in_string {
            if c == b'\\' { i += 2; continue; }
            if c == q { in_string = None; }
        } else if c == b'"' || c == b'\'' {
            in_string = Some(c);
        } else if c == b'}' && bytes[i + 1] == b'}' {
            return Some(i);
        }
        i += 1;
    }
    None
}

pub enum Segment<'a> {
    Literal(&'a str),
    Expr(&'a str),
}

/// Splits `input` into literal chunks and expression chunks.
pub fn segments(input: &str) -> Vec<Segment<'_>> {
    let mut out = Vec::new();
    let mut cursor = 0;
    let mut i = 0;
    let bytes = input.as_bytes();
    while i + 1 < bytes.len() {
        if bytes[i] == b'{' && bytes[i + 1] == b'{' {
            if let Some(end) = find_close(input, i + 2) {
                if i > cursor {
                    out.push(Segment::Literal(&input[cursor..i]));
                }
                out.push(Segment::Expr(input[i + 2..end].trim()));
                i = end + 2;
                cursor = i;
                continue;
            }
        }
        i += 1;
    }
    if cursor < input.len() {
        out.push(Segment::Literal(&input[cursor..]));
    }
    out
}

/// Finds `needle` outside quotes and nested parentheses. If `reverse` is true, finds the last occurrence.
pub fn find_top_level_ext(haystack: &str, needle: &str, reverse: bool) -> Option<usize> {
    let bytes = haystack.as_bytes();
    let nbytes = needle.as_bytes();
    let mut depth = 0i32;
    let mut in_string: Option<u8> = None;
    let mut last = None;
    let mut i = 0;
    while i + nbytes.len() <= bytes.len() {
        let c = bytes[i];
        if let Some(q) = in_string {
            if c == b'\\' { i += 2; continue; }
            if c == q { in_string = None; }
            i += 1;
            continue;
        }
        if c == b'"' || c == b'\'' {
            in_string = Some(c);
            i += 1;
            continue;
        }
        if c == b'(' { depth += 1; }
        else if c == b')' { depth -= 1; }
        else if depth == 0 && &bytes[i..i + nbytes.len()] == nbytes {
            if !reverse { return Some(i); }
            last = Some(i);
        }
        i += 1;
    }
    last
}

pub fn find_top_level(haystack: &str, needle: &str) -> Option<usize> {
    find_top_level_ext(haystack, needle, false)
}

pub fn rfind_top_level(haystack: &str, needle: &str) -> Option<usize> {
    find_top_level_ext(haystack, needle, true)
}

pub fn is_wrapped_in_parens(s: &str) -> bool {
    let s = s.trim();
    if !s.starts_with('(') || !s.ends_with(')') || s.len() < 2 {
        return false;
    }
    let bytes = s.as_bytes();
    let mut depth = 0i32;
    let mut in_str: Option<u8> = None;
    for (i, &c) in bytes.iter().enumerate() {
        if let Some(q) = in_str {
            if c == b'\\' { continue; }
            if c == q { in_str = None; }
        } else if c == b'"' || c == b'\'' {
            in_str = Some(c);
        } else if c == b'(' {
            depth += 1;
        } else if c == b')' {
            depth -= 1;
            if depth == 0 && i < bytes.len() - 1 {
                return false;
            }
        }
    }
    depth == 0
}


/// Index of the last `.` that is outside quotes, parentheses and brackets.
pub fn last_top_level_dot(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth = 0i32;
    let mut in_string: Option<u8> = None;
    let mut last = None;
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if let Some(q) = in_string {
            if c == b'\\' { i += 2; continue; }
            if c == q { in_string = None; }
        } else if c == b'"' || c == b'\'' {
            in_string = Some(c);
        } else if c == b'[' || c == b'(' {
            depth += 1;
        } else if c == b']' || c == b')' {
            depth -= 1;
        } else if c == b'.' && depth == 0 {
            last = Some(i);
        }
        i += 1;
    }
    last
}

pub fn split_args(src: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut in_string: Option<char> = None;
    let mut current = String::new();
    for c in src.chars() {
        match in_string {
            Some(q) => {
                current.push(c);
                if c == q {
                    in_string = None;
                }
            }
            None => match c {
                '"' | '\'' => {
                    in_string = Some(c);
                    current.push(c);
                }
                '(' | '[' => {
                    depth += 1;
                    current.push(c);
                }
                ')' | ']' => {
                    depth -= 1;
                    current.push(c);
                }
                ',' if depth == 0 => {
                    out.push(current.trim().to_string());
                    current.clear();
                }
                _ => current.push(c),
            },
        }
    }
    if !current.trim().is_empty() {
        out.push(current.trim().to_string());
    }
    out
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrailingCall<'a> {
    pub receiver: Option<&'a str>,
    pub name: &'a str,
    pub args_src: &'a str,
}

/// Parses an expression that ends with a function or method invocation, e.g.:
/// - `$items("Node")` -> receiver: None, name: "$items", args_src: "\"Node\""
/// - `$('Node')` -> receiver: None, name: "$", args_src: "'Node'"
/// - `$json.tags.join(', ')` -> receiver: Some("$json.tags"), name: "join", args_src: "', '"
/// - `$json.arr.map(u => u.name).join(', ')` -> receiver: Some("$json.arr.map(u => u.name)"), name: "join", args_src: "', '"
pub fn parse_trailing_call(s: &str) -> Option<TrailingCall<'_>> {
    let trimmed = s.trim();
    if !trimmed.ends_with(')') {
        return None;
    }
    let bytes = trimmed.as_bytes();
    let mut depth = 0i32;
    let mut in_string: Option<u8> = None;
    let mut last_open_at_zero = None;
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        match in_string {
            Some(q) => {
                if c == b'\\' {
                    i += 2;
                    continue;
                }
                if c == q {
                    in_string = None;
                }
            }
            None => {
                if c == b'"' || c == b'\'' {
                    in_string = Some(c);
                } else if c == b'(' || c == b'[' {
                    if depth == 0 && c == b'(' {
                        last_open_at_zero = Some(i);
                    }
                    depth += 1;
                } else if c == b')' || c == b']' {
                    depth -= 1;
                }
            }
        }
        i += 1;
    }

    if depth != 0 {
        return None;
    }
    let open_paren = last_open_at_zero?;
    if open_paren == 0 {
        return None;
    }

    let head = trimmed[..open_paren].trim();
    let args_src = &trimmed[open_paren + 1..trimmed.len() - 1];

    if let Some(dot) = last_top_level_dot(head) {
        let recv = head[..dot].trim();
        let method = head[dot + 1..].trim();
        if !method.is_empty() {
            return Some(TrailingCall {
                receiver: if recv.is_empty() { None } else { Some(recv) },
                name: method,
                args_src,
            });
        }
    }

    Some(TrailingCall {
        receiver: None,
        name: head,
        args_src,
    })
}

