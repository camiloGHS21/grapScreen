use super::*;
use serde_json::json;

fn credential() -> serde_json::Value {
    json!({ "data": { "region": "eu-west-1", "accessKeyId": "AKIAEXAMPLE", "secretAccessKey": "secret" } })
}

#[test]
fn the_url_is_built_from_the_service_region_and_path() {
    let request = build(
        "POST",
        &AwsRecipe { service: "email".into(), path: String::new() },
        &[],
        Some("Action=SendEmail"),
        Some(&credential()),
    )
    .expect("firma");
    assert_eq!(request.url, "https://email.eu-west-1.amazonaws.com/");
    assert_eq!(request.method, "POST");
}

#[test]
fn the_signature_carries_the_scope_and_the_signed_headers() {
    let request = build(
        "GET",
        &AwsRecipe {
            service: "elasticloadbalancing".into(),
            path: "/?Action=DescribeLoadBalancers".into(),
        },
        &[],
        None,
        Some(&credential()),
    )
    .expect("firma");
    let auth = request
        .headers
        .iter()
        .find(|(name, _)| name == "authorization")
        .map(|(_, value)| value.clone())
        .expect("cabecera authorization");
    assert!(auth.starts_with("AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/"), "{auth}");
    assert!(auth.contains("/eu-west-1/elasticloadbalancing/aws4_request"), "{auth}");
    assert!(auth.contains("SignedHeaders=host;x-amz-content-sha256;x-amz-date"), "{auth}");
}

#[test]
fn a_query_is_encoded_and_sorted() {
    let request = build(
        "GET",
        &AwsRecipe { service: "sqs".into(), path: "/queue".into() },
        &[
            ("Version".into(), "2012-11-05".into()),
            ("Action".into(), "SendMessage".into()),
        ],
        None,
        Some(&credential()),
    )
    .expect("firma");
    assert!(request.url.contains("?Action=SendMessage&Version=2012-11-05"), "{}", request.url);
}

#[test]
fn a_session_token_is_signed_too() {
    let mut cred = credential();
    cred["data"]["sessionToken"] = json!("session");
    let request = build(
        "GET",
        &AwsRecipe { service: "s3".into(), path: "/key".into() },
        &[],
        None,
        Some(&cred),
    )
    .expect("firma");
    assert!(request
        .headers
        .iter()
        .any(|(name, value)| name == "x-amz-security-token" && value == "session"));
}

#[test]
fn without_key_material_there_is_no_signed_request() {
    // An unsigned call is a guaranteed 403; failing here says why instead.
    assert!(build(
        "GET",
        &AwsRecipe { service: "s3".into(), path: "/k".into() },
        &[],
        None,
        Some(&json!({ "data": { "region": "eu-west-1" } })),
    )
    .is_none());
    assert!(build(
        "GET",
        &AwsRecipe { service: String::new(), path: "/k".into() },
        &[],
        None,
        Some(&credential()),
    )
    .is_none());
}
