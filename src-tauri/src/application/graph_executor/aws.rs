//! AWS request building and SigV4 signing.
//!
//! n8n's AWS nodes do not hand a URL to the engine: they pass
//! `{ method, qs: { service, path, query } }` to the `aws` credential, which
//! addresses the service and signs the call with SigV4. That recipe is
//! recoverable — the capture records it — so the engine rebuilds the same
//! request here, in Rust, with the same canonical form.
//!
//! HMAC-SHA256 is built on `sha2` rather than pulling another dependency: the
//! signing key is four chained HMACs, which is a dozen lines once the digest
//! primitive exists.

use crate::application::http_client::HttpRequest;
use sha2::{Digest, Sha256};
use std::fmt::Write as _;

/// One credential field, or an empty string.
fn field(credential: Option<&serde_json::Value>, name: &str) -> String {
    let Some(credential) = credential else {
        return String::new();
    };
    let map = match credential.get("data") {
        Some(data) if data.is_object() => data,
        _ => credential,
    };
    map.get(name)
        .map(|value| match value {
            serde_json::Value::String(text) => text.clone(),
            other => other.to_string(),
        })
        .unwrap_or_default()
}

/// Percent-encodes for a canonical query string (RFC 3986, space as `%20`).
fn uri_encode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for byte in raw.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            other => {
                let _ = write!(out, "%{other:02X}");
            }
        }
    }
    out
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;
    let mut normalised = [0u8; BLOCK];
    if key.len() > BLOCK {
        normalised[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        normalised[..key.len()].copy_from_slice(key);
    }
    let mut inner = Sha256::new();
    inner.update(normalised.map(|b| b ^ 0x36));
    inner.update(message);
    let inner = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(normalised.map(|b| b ^ 0x5c));
    outer.update(inner);
    outer.finalize().into()
}

fn sha256_hex(data: &[u8]) -> String {
    hex(&Sha256::digest(data))
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

/// The recipe n8n's AWS helper receives: which service and which path.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AwsRecipe {
    pub service: String,
    pub path: String,
}

/// Splits a URL into the pieces SigV4 signs.
struct Target<'a> {
    host: &'a str,
    path: &'a str,
    query: &'a str,
}

fn split_url(url: &str) -> Target<'_> {
    let authority = match url.split_once("://") {
        Some((_, rest)) => rest,
        None => url,
    };
    let (host, rest) = match authority.find('/') {
        Some(at) => (&authority[..at], &authority[at..]),
        None => (authority, "/"),
    };
    let (path, query) = match rest.split_once('?') {
        Some((path, query)) => (path, query),
        None => (rest, ""),
    };
    Target {
        host,
        path: if path.is_empty() { "/" } else { path },
        query,
    }
}

/// Builds the request n8n would have sent, signature included.
///
/// Returns `None` when the credential lacks the key material: an unsigned AWS
/// call is a guaranteed 403, and the user should read that here instead of
/// seeing the 403 with no explanation.
pub fn build(
    method: &str,
    recipe: &AwsRecipe,
    query: &[(String, String)],
    body: Option<&str>,
    credential: Option<&serde_json::Value>,
) -> Option<HttpRequest> {
    let region = field(credential, "region");
    let access_key = field(credential, "accessKeyId");
    let secret_key = field(credential, "secretAccessKey");
    let session_token = field(credential, "sessionToken");
    let service = recipe.service.trim();
    if access_key.is_empty() || secret_key.is_empty() || region.is_empty() || service.is_empty() {
        return None;
    }

    // Path-style addressing, which is what n8n's helper uses for every service.
    let path = if recipe.path.is_empty() {
        "/".to_string()
    } else if recipe.path.starts_with('/') {
        recipe.path.clone()
    } else {
        format!("/{}", recipe.path)
    };
    let mut pairs: Vec<(String, String)> = query
        .iter()
        .map(|(name, value)| (uri_encode(name), uri_encode(value)))
        .collect();
    pairs.sort();
    let query_string = pairs
        .iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("&");
    let assembled = format!(
        "https://{service}.{region}.amazonaws.com{path}{}",
        if query_string.is_empty() {
            String::new()
        } else {
            format!("?{query_string}")
        }
    );
    let target = split_url(&assembled);
    let url = format!(
        "https://{}{}{}",
        target.host,
        target.path,
        if target.query.is_empty() {
            String::new()
        } else {
            format!("?{}", target.query)
        }
    );

    // Signed with the real clock: the date is part of what the server checks.
    let now = chrono::Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date = now.format("%Y%m%d").to_string();
    let payload_hash = sha256_hex(body.unwrap_or("").as_bytes());

    let mut headers: Vec<(String, String)> = vec![
        ("host".into(), target.host.to_string()),
        ("x-amz-content-sha256".into(), payload_hash.clone()),
        ("x-amz-date".into(), amz_date.clone()),
    ];
    if !session_token.is_empty() {
        headers.push(("x-amz-security-token".into(), session_token));
    }
    if body.is_some() {
        headers.push((
            "content-type".into(),
            "application/x-www-form-urlencoded; charset=utf-8".into(),
        ));
    }
    headers.sort_by(|a, b| a.0.cmp(&b.0));

    let canonical_headers = headers
        .iter()
        .map(|(name, value)| format!("{}:{}\n", name, value.trim()))
        .collect::<String>();
    let signed_headers = headers
        .iter()
        .map(|(name, _)| name.as_str())
        .collect::<Vec<_>>()
        .join(";");
    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method.to_uppercase(),
        target.path,
        target.query,
        canonical_headers,
        signed_headers,
        payload_hash
    );
    let scope = format!("{date}/{region}/{service}/aws4_request");
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        sha256_hex(canonical_request.as_bytes())
    );
    let k_date = hmac_sha256(format!("AWS4{secret_key}").as_bytes(), date.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    let k_signing = hmac_sha256(&k_service, b"aws4_request");
    let signature = hex(&hmac_sha256(&k_signing, string_to_sign.as_bytes()));
    headers.push((
        "authorization".into(),
        format!(
            "AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed_headers}, Signature={signature}"
        ),
    ));

    Some(HttpRequest {
        method: method.to_uppercase(),
        url,
        headers,
        body: body.map(|b| b.to_string()),
        timeout_secs: 60,
    })
}

#[cfg(test)]
mod tests;

