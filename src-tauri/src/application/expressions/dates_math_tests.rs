use super::*;
use serde_json::{json, Value};
use std::collections::HashMap;

fn make_ctx<'a>(items: &'a [Value], nodes: &'a HashMap<String, Vec<Value>>, vars: &'a HashMap<String, String>) -> ExprContext<'a> {
    ExprContext {
        items,
        item_index: 0,
        run_index: 0,
        node_outputs: nodes,
        variables: vars,
        execution_id: "test-exec",
        credentials: None,
    }
}

#[test]
fn test_now_and_today_formatting() {
    let items = vec![];
    let nodes = HashMap::new();
    let vars = HashMap::new();
    let ctx = make_ctx(&items, &nodes, &vars);

    let res_today = render("{{ $today }}", &ctx);
    assert!(res_today.is_string());
    assert_eq!(res_today.as_str().unwrap().len(), 10); // YYYY-MM-DD

    let res_fmt = render("{{ $now.toFormat('yyyy') }}", &ctx);
    assert_eq!(res_fmt, json!("2026"));

    let res_iso_date = render("{{ $now.toISODate() }}", &ctx);
    assert_eq!(res_iso_date, res_today);
}

#[test]
fn test_now_duration_plus_minus() {
    let items = vec![];
    let nodes = HashMap::new();
    let vars = HashMap::new();
    let ctx = make_ctx(&items, &nodes, &vars);

    let base = render("{{ DateTime.fromISO('2026-10-01T12:00:00Z').toISODate() }}", &ctx);
    assert_eq!(base, json!("2026-10-01"));

    let plus_days = render("{{ DateTime.fromISO('2026-10-01T12:00:00Z').plus({ days: 5 }).toISODate() }}", &ctx);
    assert_eq!(plus_days, json!("2026-10-06"));

    let minus_days = render("{{ DateTime.fromISO('2026-10-01T12:00:00Z').minus({ days: 3 }).toISODate() }}", &ctx);
    assert_eq!(minus_days, json!("2026-09-28"));

    let plus_hours = render("{{ DateTime.fromISO('2026-10-01T10:00:00Z').plus({ hours: 4 }).toFormat('HH:mm') }}", &ctx);
    assert_eq!(plus_hours, json!("14:00"));
}

#[test]
fn test_now_start_of_and_end_of() {
    let items = vec![];
    let nodes = HashMap::new();
    let vars = HashMap::new();
    let ctx = make_ctx(&items, &nodes, &vars);

    let start_month = render("{{ DateTime.fromISO('2026-10-15T16:30:00Z').startOf('month').toISODate() }}", &ctx);
    assert_eq!(start_month, json!("2026-10-01"));

    let end_month = render("{{ DateTime.fromISO('2026-10-15T16:30:00Z').endOf('month').toISODate() }}", &ctx);
    assert_eq!(end_month, json!("2026-10-31"));
}

#[test]
fn test_date_diff() {
    let items = vec![json!({
        "json": { "createdAt": "2026-10-01T00:00:00Z", "dueAt": "2026-10-10T00:00:00Z" }
    })];
    let nodes = HashMap::new();
    let vars = HashMap::new();
    let ctx = make_ctx(&items, &nodes, &vars);

    let diff_days = render("{{ $json.dueAt.diff($json.createdAt, 'days') }}", &ctx);
    assert_eq!(diff_days, json!(9));

    let diff_hours = render("{{ $json.dueAt.diff($json.createdAt, 'hours') }}", &ctx);
    assert_eq!(diff_hours, json!(216));
}

#[test]
fn test_now_property_accessors() {
    let items = vec![];
    let nodes = HashMap::new();
    let vars = HashMap::new();
    let ctx = make_ctx(&items, &nodes, &vars);

    let year = render("{{ $now.year }}", &ctx);
    assert_eq!(year, json!(2026));

    let month = render("{{ $now.month }}", &ctx);
    assert!(month.as_f64().unwrap() >= 1.0 && month.as_f64().unwrap() <= 12.0);

    let day = render("{{ $now.day }}", &ctx);
    assert!(day.as_f64().unwrap() >= 1.0 && day.as_f64().unwrap() <= 31.0);
}

#[test]
fn test_math_namespace_methods() {
    let items = vec![];
    let nodes = HashMap::new();
    let vars = HashMap::new();
    let ctx = make_ctx(&items, &nodes, &vars);

    assert_eq!(render("{{ Math.round(4.6) }}", &ctx), json!(5));
    assert_eq!(render("{{ Math.round(4.1234, 2) }}", &ctx), json!(4.12));
    assert_eq!(render("{{ Math.floor(4.9) }}", &ctx), json!(4));
    assert_eq!(render("{{ Math.ceil(4.1) }}", &ctx), json!(5));
    assert_eq!(render("{{ Math.abs(-42) }}", &ctx), json!(42));
    assert_eq!(render("{{ Math.min(10, 5, 20) }}", &ctx), json!(5));
    assert_eq!(render("{{ Math.max(10, 5, 20) }}", &ctx), json!(20));
    assert_eq!(render("{{ Math.pow(2, 8) }}", &ctx), json!(256));
    assert_eq!(render("{{ Math.sqrt(64) }}", &ctx), json!(8));
    assert_eq!(render("{{ Math.trunc(7.89) }}", &ctx), json!(7));
    assert_eq!(render("{{ Math.sign(-15) }}", &ctx), json!(-1));
}

#[test]
fn test_math_constants_and_parse() {
    let items = vec![];
    let nodes = HashMap::new();
    let vars = HashMap::new();
    let ctx = make_ctx(&items, &nodes, &vars);

    let pi = render("{{ Math.PI }}", &ctx);
    assert!((pi.as_f64().unwrap() - std::f64::consts::PI).abs() < 1e-6);

    let e = render("{{ Math.E }}", &ctx);
    assert!((e.as_f64().unwrap() - std::f64::consts::E).abs() < 1e-6);

    assert_eq!(render("{{ parseInt('42') }}", &ctx), json!(42));
    assert_eq!(render("{{ parseInt('0xFF', 16) }}", &ctx), json!(255));
    assert_eq!(render("{{ parseFloat('12.34567') }}", &ctx), json!(12.34567));
}

#[test]
fn test_number_prototype_methods() {
    let items = vec![json!({ "json": { "price": 100.456, "discount": -25 } })];
    let nodes = HashMap::new();
    let vars = HashMap::new();
    let ctx = make_ctx(&items, &nodes, &vars);

    assert_eq!(render("{{ $json.price.round(2) }}", &ctx), json!(100.46));
    assert_eq!(render("{{ $json.price.floor() }}", &ctx), json!(100));
    assert_eq!(render("{{ $json.price.ceil() }}", &ctx), json!(101));
    assert_eq!(render("{{ $json.discount.abs() }}", &ctx), json!(25));
    assert_eq!(render("{{ $json.price.toFixed(1) }}", &ctx), json!("100.5"));
}

#[test]
fn test_parentheses_and_associativity() {
    let items = vec![json!({ "json": { "price": 100, "qty": 3, "discount": 20 } })];
    let nodes = HashMap::new();
    let vars = HashMap::new();
    let ctx = make_ctx(&items, &nodes, &vars);

    // Parentheses grouping
    assert_eq!(render("{{ (2 + 3) * 4 }}", &ctx), json!(20));
    assert_eq!(render("{{ 100 / (2 * 5) }}", &ctx), json!(10));
    assert_eq!(render("{{ (10 - 2) * (3 + 1) }}", &ctx), json!(32));
    assert_eq!(render("{{ ($json.price - $json.discount) * $json.qty }}", &ctx), json!(240));

    // Left-to-right associativity
    assert_eq!(render("{{ 10 - 4 - 2 }}", &ctx), json!(4)); // (10-4)-2 = 4, not 10-(4-2)=8
    assert_eq!(render("{{ 20 / 4 * 2 }}", &ctx), json!(10)); // (20/4)*2 = 10, not 20/(4*2)=2.5
    assert_eq!(render("{{ 10 - 4 + 2 }}", &ctx), json!(8)); // (10-4)+2 = 8

    // Number method chained on parenthesized expression
    assert_eq!(render("{{ ($json.price * 1.16).round(2) }}", &ctx), json!(116));
}

#[test]
fn test_unary_minus() {
    let items = vec![json!({ "json": { "val": 15, "total": 100 } })];
    let nodes = HashMap::new();
    let vars = HashMap::new();
    let ctx = make_ctx(&items, &nodes, &vars);

    assert_eq!(render("{{ -$json.val }}", &ctx), json!(-15));
    assert_eq!(render("{{ $json.total + -$json.val }}", &ctx), json!(85));
}
