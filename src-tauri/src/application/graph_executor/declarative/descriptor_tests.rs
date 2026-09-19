//! Tests for the descriptor model and its embedded registry.
//!
//! Split out of `descriptor.rs` to keep that file under the 300-line budget.

use super::*;

fn node(key: &str) -> NodeDescriptor {
    NodeDescriptor {
        key: key.into(),
        display_name: key.into(),
        description: String::new(),
        category: String::new(),
        subcategory: None,
        group: None,
        is_trigger: false,
        trigger_mode: None,
        polling: false,
        webhook: false,
        package: String::new(),
        path: String::new(),
        credential: None,
        base_url: None,
        request: RequestTemplate::default(),
    }
}

// ── the embedded catalogue ───────────────────────────────────────────────

#[test]
fn embedded_registry_parses_and_is_not_empty() {
    let r = DescriptorRegistry::global();
    assert!(
        r.len() > 500,
        "se esperaban los 554 nodos de n8n, se leyeron {}",
        r.len()
    );
}

#[test]
fn every_descriptor_has_a_key_and_a_display_name() {
    for d in DescriptorRegistry::global().all() {
        assert!(!d.key.trim().is_empty(), "descriptor sin key");
        assert!(
            !d.display_name.trim().is_empty(),
            "descriptor '{}' sin displayName",
            d.key
        );
    }
}

#[test]
fn lookup_by_key_round_trips() {
    let r = DescriptorRegistry::global();
    let first = &r.all()[0];
    let found = r.get(&first.key).expect("la key debe encontrarse");
    assert_eq!(found.key, first.key);
}

#[test]
fn triggers_are_present_in_the_registry() {
    let triggers = DescriptorRegistry::global()
        .all()
        .iter()
        .filter(|d| d.is_trigger)
        .count();
    assert!(
        triggers >= 100,
        "se esperaban ~111 disparadores de n8n, se leyeron {}",
        triggers
    );
}

#[test]
fn every_trigger_declares_a_known_mode() {
    for d in DescriptorRegistry::global().all() {
        if !d.is_trigger {
            continue;
        }
        assert!(
            matches!(d.trigger_mode(), "webhook" | "polling" | "schedule" | "event"),
            "el disparador '{}' tiene un modo desconocido: {:?}",
            d.key,
            d.trigger_mode()
        );
    }
}

#[test]
fn the_armable_trigger_modes_cover_most_of_the_catalogue() {
    // The point of detecting the mode from source: the catalogue's own
    // flags only marked 27 triggers as webhook/polling, which left 84
    // triggers with no way to fire. Source detection brings the armable set
    // to 95 of 111.
    let all: Vec<&NodeDescriptor> = DescriptorRegistry::global()
        .all()
        .iter()
        .filter(|d| d.is_trigger)
        .collect();
    let armable = all.iter().filter(|d| d.is_armable()).count();
    assert!(
        armable >= 90,
        "se esperaban >=90 disparadores armables, se leyeron {} de {}",
        armable,
        all.len()
    );
}

#[test]
fn the_known_trigger_modes_land_on_the_right_node() {
    let r = DescriptorRegistry::global();
    let mode = |k: &str| r.get(k).map(|d| d.trigger_mode().to_string());
    // Schedule-style triggers are the engine's own timers.
    assert_eq!(mode("ScheduleTrigger").as_deref(), Some("schedule"));
    assert_eq!(mode("Cron").as_deref(), Some("schedule"));
    // Webhook triggers register an incoming route.
    assert_eq!(mode("SlackTrigger").as_deref(), Some("webhook"));
    assert_eq!(mode("Webhook").as_deref(), Some("webhook"));
    // Polling triggers are driven by the engine's scheduler.
    assert_eq!(mode("GmailTrigger").as_deref(), Some("polling"));
    // Broker subscribers need a client library, so they stay unarmed.
    assert_eq!(mode("KafkaTrigger").as_deref(), Some("event"));
    assert!(!r.get("KafkaTrigger").unwrap().is_armable());
}

// ── null tolerance in the generated data ─────────────────────────────────

/// The generator writes `"authType": null` for every credential type that
/// declares no `authenticate` block — 41 of them. `#[serde(default)]` only
/// covers an *absent* field, so a single explicit `null` used to fail the whole
/// parse of the embedded catalogue, and `global()` swallowed that error into an
/// empty registry: all 565 `n8n_node`s silently stopped resolving.
#[test]
fn a_null_auth_type_does_not_sink_the_whole_registry() {
    let raw = r#"[{"key":"GoogleSheets","displayName":"Google Sheets",
        "credential":{"name":"googleSheetsOAuth2Api","authType":null,
                      "baseUrl":null,"headers":{},"qs":{},"fields":["scope"]}}]"#;
    let r = DescriptorRegistry::from_json(raw)
        .expect("un descriptor con authType null debe poder leerse");
    assert_eq!(r.len(), 1, "el descriptor debe sobrevivir al null");
    let spec = r
        .get("GoogleSheets")
        .and_then(|d| d.credential.as_ref())
        .expect("la credencial debe seguir ahí");
    // A credential with no `authenticate` block authenticates with nothing.
    assert_eq!(spec.auth_type, "");
    assert_eq!(spec.name.as_deref(), Some("googleSheetsOAuth2Api"));
    assert_eq!(spec.fields, vec!["scope".to_string()]);
}

/// Same contract, for every other non-`Option` field of the model: the
/// generator is free to write `null`, and none of them may sink the parse.
#[test]
fn explicit_nulls_are_tolerated_the_way_missing_fields_are() {
    let raw = r#"[{"key":"X","displayName":"X","description":null,"category":null,
        "isTrigger":null,"polling":null,"webhook":null,"package":null,"path":null,
        "request":{"method":null,"path":null,"qs":null,"body":null},
        "credential":{"name":null,"authType":null,"headers":null,"qs":null,"fields":null}}]"#;
    let r = DescriptorRegistry::from_json(raw).expect("los nulls explícitos deben tolerarse");
    let d = r.get("X").expect("el descriptor debe estar");
    assert_eq!(d.description, "");
    assert!(!d.is_trigger);
    assert_eq!(d.request.method, "GET", "un method nulo cae al valor por defecto");
    assert!(d.request.qs.is_empty());
    let spec = d.credential.as_ref().expect("credencial presente");
    assert_eq!(spec.auth_type, "");
    assert!(spec.headers.is_empty());
    assert!(spec.fields.is_empty());
}

/// One of the 41 real entries must survive the embedded parse — otherwise the
/// unit test above could pass while the shipped catalogue still degrades.
#[test]
fn the_real_catalogue_keeps_the_credentials_that_omit_authenticate() {
    let r = DescriptorRegistry::global();
    for key in ["GoogleSheets", "Discord", "Airtable", "Confluence", "BambooHr"] {
        let d = r
            .get(key)
            .unwrap_or_else(|| panic!("'{}' desapareció del registro", key));
        let spec = d
            .credential
            .as_ref()
            .unwrap_or_else(|| panic!("'{}' perdió su credencial", key));
        assert_eq!(
            spec.auth_type, "",
            "'{}' declara un authType que no está en el origen",
            key
        );
    }
}

// ── failing loudly instead of degrading to empty ─────────────────────────

/// A malformed catalogue is a defect in a compile-time artifact, not a runtime
/// condition to recover from. Returning an empty registry turns it into "every
/// n8n node is unavailable", which is indistinguishable from the user having
/// configured nothing.
#[test]
fn malformed_catalogue_json_is_an_error_not_an_empty_registry() {
    let err = DescriptorRegistry::from_json("[{\"key\": 12}]")
        .err()
        .expect("un catálogo malformado debe devolver Err, no un registro vacío");
    assert!(
        err.contains("descriptores n8n ilegibles"),
        "el error debe explicar qué falló, se leyó: {}",
        err
    );
}

/// The same defect, driven through the path production actually takes. This is
/// the regression guard for the old `unwrap_or_else(|_| empty)`: it must abort
/// with the serde error instead of handing back a registry of zero nodes.
#[test]
#[should_panic(expected = "catálogo de descriptores n8n corrupto")]
fn a_corrupt_catalogue_aborts_instead_of_degrading_to_empty() {
    let _ = super::registry_or_panic("[{\"key\": 12}]");
}

// ── derived behaviour ───────────────────────────────────────────────────

#[test]
fn the_mode_falls_back_to_the_boolean_flags() {
    // Generated data that predates `triggerMode` must still arm correctly.
    let mut d = node("X");
    d.is_trigger = true;
    d.webhook = true;
    assert_eq!(d.trigger_mode(), "webhook");
    assert!(d.is_armable());

    d.webhook = false;
    d.polling = true;
    assert_eq!(d.trigger_mode(), "polling");

    d.polling = false;
    assert_eq!(d.trigger_mode(), "event");
    assert!(!d.is_armable());
}

#[test]
fn effective_base_url_prefers_the_node_override() {
    let mut d = node("X");
    d.base_url = Some("https://api.example.com".into());
    assert_eq!(
        d.effective_base_url(Some(" https://override.test ")).as_deref(),
        Some("https://override.test")
    );
    assert_eq!(
        d.effective_base_url(None).as_deref(),
        Some("https://api.example.com")
    );
    // A blank override must fall back rather than produce an empty URL.
    assert_eq!(
        d.effective_base_url(Some("   ")).as_deref(),
        Some("https://api.example.com")
    );
}
