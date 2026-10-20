use super::*;
use serde_json::json;
use std::collections::BTreeMap;

fn spec(auth_type: &str) -> CredentialSpec {
    CredentialSpec {
        name: Some("test".into()),
        auth_type: auth_type.into(),
        base_url: None,
        headers: BTreeMap::new(),
        qs: BTreeMap::new(),
        fields: vec![],
    }
}

#[test]
fn declared_header_templates_win_over_the_fallback() {
    let mut s = spec("bearer");
    s.headers
        .insert("Authorization".into(), "=Bearer {{$credentials.accessToken}}".into());
    let cred = json!({ "accessToken": "tok_123" });
    let a = apply(&s, Some(&cred));
    assert_eq!(
        a.headers,
        vec![("Authorization".to_string(), "Bearer tok_123".to_string())]
    );
    assert!(a.notes.is_empty());
}

#[test]
fn spaced_and_bracket_placeholder_forms_resolve() {
    let mut s = spec("generic");
    s.headers.insert("X-A".into(), "{{ $credentials.token }}".into());
    s.headers.insert("X-B".into(), "{{$credentials['apiKey']}}".into());
    let cred = json!({ "token": "t1", "apiKey": "k2" });
    let a = apply(&s, Some(&cred));
    assert!(a.headers.contains(&("X-A".to_string(), "t1".to_string())));
    assert!(a.headers.contains(&("X-B".to_string(), "k2".to_string())));
}

#[test]
fn a_missing_credential_field_yields_no_empty_header() {
    let mut s = spec("bearer");
    s.headers
        .insert("Authorization".into(), "=Bearer {{$credentials.accessToken}}".into());
    let a = apply(&s, Some(&json!({ "other": "x" })));
    assert!(a.headers.is_empty());
}

#[test]
fn bearer_falls_back_to_well_known_field_names() {
    let a = apply(&spec("bearer"), Some(&json!({ "access_token": "abc" })));
    assert_eq!(a.headers, vec![("Authorization".into(), "Bearer abc".into())]);
}

#[test]
fn basic_encodes_user_and_password() {
    let a = apply(&spec("basic"), Some(&json!({ "user": "ana", "password": "s3cr3t" })));
    assert_eq!(a.headers.len(), 1);
    let (name, value) = &a.headers[0];
    assert_eq!(name, "Authorization");
    assert_eq!(value, "Basic YW5hOnMzY3IzdA==");
}

#[test]
fn nested_data_wrapper_is_unwrapped() {
    let cred = json!({ "data": { "apiKey": "nested-key" } });
    let a = apply(&spec("bearer"), Some(&cred));
    assert_eq!(a.headers, vec![("Authorization".into(), "Bearer nested-key".into())]);
}

#[test]
fn query_templates_become_query_parameters() {
    let mut s = spec("apiKey");
    s.qs.insert("key".into(), "{{$credentials.apiKey}}".into());
    let a = apply(&s, Some(&json!({ "apiKey": "qk" })));
    assert_eq!(a.query, vec![("key".into(), "qk".into())]);
    assert!(a.headers.is_empty());
}

#[test]
fn digest_reports_an_explicit_note_instead_of_silently_failing() {
    let a = apply(&spec("digest"), Some(&json!({ "user": "u", "password": "p" })));
    assert!(a.headers.is_empty());
    assert_eq!(a.notes.len(), 1);
    assert!(a.notes[0].contains("Digest"));
}

#[test]
fn no_credential_at_all_produces_no_headers_and_no_panic() {
    let a = apply(&spec("bearer"), None);
    assert!(a.headers.is_empty());
    assert!(a.query.is_empty());
    assert_eq!(a.notes.len(), 1);
}

#[test]
fn declared_templates_that_all_resolve_empty_are_reported() {
    let mut s = spec("generic");
    s.headers
        .insert("Authorization".into(), "=Bearer {{$credentials.accessToken}}".into());
    let a = apply(&s, Some(&json!({ "unrelated": "x" })));
    assert!(a.headers.is_empty());
    assert_eq!(a.notes.len(), 1);
    assert!(a.notes[0].contains("sin autenticar"));
}

#[test]
fn a_non_credential_expression_is_left_visible_in_the_header() {
    let mut s = spec("generic");
    s.headers.insert("X-Tenant".into(), "{{ $vars.tenant }}".into());
    let a = apply(&s, Some(&json!({})));
    assert_eq!(a.headers, vec![("X-Tenant".into(), "{{ $vars.tenant }}".into())]);
}

#[test]
fn an_empty_credential_value_is_treated_as_absent() {
    let mut s = spec("bearer");
    s.headers
        .insert("Authorization".into(), "=Bearer {{$credentials.accessToken}}".into());
    let a = apply(&s, Some(&json!({ "accessToken": "   " })));
    assert!(a.headers.is_empty());
}
