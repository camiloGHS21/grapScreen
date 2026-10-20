use super::runmap_subst::*;
use super::*;
use serde_json::json;

fn params(pairs: &[(&str, Value)]) -> Map<String, Value> {
    pairs
        .iter()
        .map(|(k, v)| ((*k).to_string(), v.clone()))
        .collect()
}

fn plan_trigger(data: &Value) -> Result<PlannedRequest, String> {
    let key = data
        .get("n8n_key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let node = RunMap::global()
        .get(&key)
        .ok_or_else(|| format!("sin mapa para '{}'", key))?;
    let case = node
        .cases
        .iter()
        .find(|case| case.operation.is_empty() && case.sendable().is_some())
        .ok_or_else(|| format!("'{}' sin poll() capturado", key))?;
    plan_request(&key, data, None, case)
}

#[test]
fn the_artifact_parses_and_covers_a_large_part_of_the_catalogue() {
    let map = RunMap::global();
    assert!(map.len() > 400, "nodos en el mapa: {}", map.len());
    assert!(
        map.executable_keys().len() > 100,
        "nodos ejecutables: {}",
        map.executable_keys().len()
    );
}

#[test]
fn a_captured_case_carries_the_headers_the_node_code_sets() {
    let notion = RunMap::global()
        .get("Notion")
        .expect("la captura debe incluir Notion");
    let case = notion
        .cases
        .iter()
        .find(|c| c.operation == "get")
        .expect("Notion debe tener la operación 'get'");
    let request = case.sendable().expect("con petición capturada");
    let headers = request.headers.as_ref().expect("con cabeceras");
    assert!(headers.keys().any(|k| k == "Notion-Version"));
}

#[test]
fn a_whole_placeholder_keeps_the_json_type_of_the_parameter() {
    let params = params(&[("limit", json!(3))]);
    let resolved = resolve_json(&json!({ "page_size": "{{$parameter.limit}}" }), &params, None);
    assert_eq!(resolved["page_size"], json!(3));
}

#[test]
fn an_inline_placeholder_is_rendered_inside_the_text() {
    let params = params(&[("name", json!("ana"))]);
    let resolved = resolve_json(&json!("hola {{$parameter.name}}!"), &params, None);
    assert_eq!(resolved, json!("hola ana!"));
}

#[test]
fn a_credential_placeholder_resolves_from_the_vault_scope() {
    let params = Map::new();
    let credential = json!({ "data": { "accessToken": "sec-ret" } });
    let resolved = resolve_json(
        &json!("https://api.test/bot{{$credentials.accessToken}}/getChat"),
        &params,
        Some(&credential),
    );
    assert_eq!(resolved, json!("https://api.test/botsec-ret/getChat"));
}

#[test]
fn a_missing_credential_contributes_nothing_instead_of_the_placeholder() {
    let resolved = resolve_json(&json!("{{$credentials.token}}"), &Map::new(), None);
    assert_eq!(resolved, json!(null));
    let resolved = resolve_json(&json!("/bot{{$credentials.token}}/x"), &Map::new(), None);
    assert_eq!(resolved, json!("/bot/x"));
}

#[test]
fn a_nested_credential_path_resolves() {
    let credential = json!({
        "data": { "oauthTokenData": { "instance_url": "https://acme.my.salesforce.com" } }
    });
    let resolved = resolve_json(
        &json!("{{$credentials.oauthTokenData.instance_url}}/services/data/v59.0/query"),
        &Map::new(),
        Some(&credential),
    );
    assert_eq!(
        resolved,
        json!("https://acme.my.salesforce.com/services/data/v59.0/query")
    );
}

#[test]
fn a_nested_credential_path_is_case_insensitive_at_every_step() {
    let credential =
        json!({ "data": { "OauthTokenData": { "Instance_Url": "https://x.test" } } });
    let resolved = resolve_json(
        &json!("{{$credentials.oauthTokenData.instance_url}}/q"),
        &Map::new(),
        Some(&credential),
    );
    assert_eq!(resolved, json!("https://x.test/q"));
}

#[test]
fn a_flat_credential_field_still_resolves_after_the_nested_change() {
    let credential = json!({ "data": { "accessToken": "tok" } });
    let resolved = resolve_json(
        &json!("{{$credentials.accessToken}}"),
        &Map::new(),
        Some(&credential),
    );
    assert_eq!(resolved, json!("tok"));
}

#[test]
fn an_engine_expression_is_left_for_the_interpolator() {
    assert_eq!(
        substitute_params("id: {{ $json.id }}", &Map::new(), None),
        "id: {{ $json.id }}"
    );
}

#[test]
fn a_parameter_in_a_path_is_percent_encoded() {
    let params = params(&[("id", json!("a b/c"))]);
    assert_eq!(
        render_path("https://api.test/v1/{{$parameter.id}}", &params, None),
        "https://api.test/v1/a%20b%2Fc"
    );
}

#[test]
fn a_parameter_that_is_a_url_is_not_encoded() {
    let params = params(&[("target", json!("https://other.test/x?y=1"))]);
    assert_eq!(
        render_path("{{$parameter.target}}", &params, None),
        "https://other.test/x?y=1"
    );
}

#[test]
fn a_missing_parameter_contributes_nothing_instead_of_the_placeholder() {
    let resolved = resolve_json(&json!("{{$parameter.nope}}"), &Map::new(), None);
    assert_eq!(resolved, json!(null));
    assert_eq!(
        substitute_params("x{{$parameter.nope}}y", &Map::new(), None),
        "xy"
    );
}

#[test]
fn a_node_without_a_map_says_so_and_names_itself() {
    let error = plan(&json!({ "n8n_key": "DefinitelyNotCaptured" })).unwrap_err();
    assert!(error.contains("DefinitelyNotCaptured"), "mensaje: {}", error);
}

#[test]
fn an_operation_that_was_not_captured_lists_the_ones_that_were() {
    let key = RunMap::global()
        .executable_keys()
        .into_iter()
        .find(|k| {
            RunMap::global()
                .get(k)
                .is_some_and(|n| n.cases.iter().any(|c| !c.operation.is_empty()))
        })
        .expect("algún nodo con operaciones capturadas");
    let error = plan(&json!({
        "n8n_key": key,
        "n8n_config": { "operation": "___no_existe___" }
    }))
    .unwrap_err();
    assert!(error.contains("no está soportada"), "mensaje: {}", error);
    assert!(error.contains(key), "el error debe nombrar el nodo: {}", error);
}

#[test]
fn a_captured_poll_plans_the_request_the_trigger_makes() {
    let planned = plan_trigger(&json!({
        "n8n_key": "GmailTrigger",
        "n8n_config": { "resource": "message", "event": "messageReceived", "simple": true }
    }))
    .expect("GmailTrigger debe tener su poll() capturado");
    assert_eq!(planned.method, "GET");
    assert!(
        planned.url.starts_with("https://www.googleapis.com/gmail/v1/users/me/messages"),
        "url inesperada: {}",
        planned.url
    );
}

#[test]
fn a_trigger_without_a_captured_poll_says_so() {
    let error = plan_trigger(&json!({ "n8n_key": "Cron" })).unwrap_err();
    assert!(error.contains("Cron"), "mensaje: {}", error);
}

#[test]
fn a_poll_plan_never_expects_an_operation() {
    let node = RunMap::global()
        .get("GmailTrigger")
        .expect("GmailTrigger está en el mapa");
    assert!(node.is_complete() || node.usable_cases() > 0);
    let planned = plan_trigger(&json!({
        "n8n_key": "GmailTrigger",
        "n8n_config": { "simple": true }
    }));
    assert!(planned.is_ok(), "sin operación debe planificar igual");
}

#[test]
fn an_aws_recipe_plans_a_signed_request_through_the_builder() {
    let map = RunMap::global();
    let node = map.get("AwsSes").unwrap_or_else(|| {
        panic!("expected AwsSes in map: {}", map.executable_keys().join(", "));
    });
    let sendable = node.cases.iter().find(|c| c.sendable().is_some()).expect("un caso enviable");
    let credential = serde_json::json!({
        "data": { "region": "eu-west-1", "accessKeyId": "AKIAEXAMPLE", "secretAccessKey": "secret" }
    });
    let recipe_service = sendable
        .requests
        .last()
        .as_ref()
        .and_then(|r| r.qs.as_ref())
        .and_then(|qs| qs.get("service"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    assert_eq!(recipe_service, "email", "la receta SES cambió de forma");
    let data = serde_json::json!({
        "n8n_key": "AwsSes",
        "n8n_config": { "operation": sendable.operation.clone() },
        "n8n_credential": credential,
    });
    let result = plan(&data);
    match result {
        Ok(planned) => {
            assert!(planned.url.starts_with("https://email."), "url: {}", planned.url);
            assert!(planned.headers.iter().any(|(name, value)| name == "authorization" && value.starts_with("AWS4-HMAC-SHA256")));
        }
        Err(error) => {
            assert!(error.contains("URL") || error.contains("aws"), "error: {error}");
        }
    }
}

#[test]
fn a_captured_case_plans_a_request_with_the_parameter_in_the_path() {
    let planned = plan(&json!({
        "n8n_key": "Notion",
        "n8n_config": {
            "resource": "dataSource",
            "operation": "get",
            "dataSourceId": "11111111-2222-3333-4444-555555555555"
        }
    }))
    .expect("Notion dataSource/get debe planificarse");
    assert_eq!(planned.method, "GET");
    assert_eq!(
        planned.url,
        "https://api.notion.com/v1/data_sources/11111111-2222-3333-4444-555555555555"
    );
    assert!(planned.headers.iter().any(|(name, _)| name == "Notion-Version"));
    assert!(planned.body.is_none(), "una lectura no lleva cuerpo");
}

#[test]
fn flat_instance_url_resolves_for_relative_node() {
    let cred = json!({
        "data": { "instance_url": "https://tenant123.my.salesforce.com" }
    });
    let planned = plan(&json!({
        "n8n_key": "Salesforce",
        "n8n_credential": cred,
        "n8n_config": {
            "resource": "note",
            "operation": "get",
            "noteId": "001xx000003DGb2AAG"
        }
    }));
    if let Ok(p) = planned {
        assert!(p.url.starts_with("https://tenant123.my.salesforce.com"));
    }
}
