use super::context::{num, stringify, truthy, unwrap_item, ExprContext};
use super::lambda::eval_lambda;
use super::parser::{split_args, TrailingCall};
use serde_json::Value;

pub fn call_function(call: &TrailingCall, ctx: &ExprContext) -> Option<Value> {
    let args = split_args(call.args_src);

    if let Some(recv) = call.receiver {
        let value = super::eval::eval(recv, ctx);
        return apply_helper(&value, call.name, &args, ctx);
    }

    match call.name {
        "$" => {
            let node_name = args
                .first()
                .map(|a| a.trim().trim_matches(|c| c == '\'' || c == '"'))
                .unwrap_or("");
            let items = ctx.lookup_node(node_name).cloned().unwrap_or_default();
            Some(Value::Array(items))
        }
        "$items" => {
            let items = match args.first() {
                Some(a) => {
                    let node_name = stringify(&super::eval::eval(a, ctx));
                    ctx.lookup_node(&node_name).cloned().unwrap_or_default()
                }
                None => ctx.items.to_vec(),
            };
            Some(Value::Array(items))
        }
        _ => None,
    }
}

pub fn apply_helper(value: &Value, method: &str, args: &[String], ctx: &ExprContext) -> Option<Value> {
    match method {
        // ── Modern node accessors ──
        "all" => match value {
            Value::Array(a) => Some(Value::Array(a.clone())),
            Value::Null => Some(Value::Array(vec![])),
            other => Some(Value::Array(vec![other.clone()])),
        },
        "first" => match value {
            Value::Array(a) => Some(a.first().cloned().unwrap_or(Value::Null)),
            other => Some(other.clone()),
        },
        "last" => match value {
            Value::Array(a) => Some(a.last().cloned().unwrap_or(Value::Null)),
            other => Some(other.clone()),
        },
        "item" => match value {
            Value::Array(a) => {
                let idx = args.first().and_then(|x| x.parse::<usize>().ok()).unwrap_or(ctx.item_index);
                Some(a.get(idx).cloned().or_else(|| a.first().cloned()).unwrap_or(Value::Null))
            }
            other => Some(other.clone()),
        },

        // ── Array methods: .map(), .filter(), .join(), .slice(), etc. ──
        "map" => {
            let arr = match value {
                Value::Array(a) => a.clone(),
                Value::Null => return Some(Value::Array(vec![])),
                other => vec![other.clone()],
            };
            let lambda = args.first().map(|s| s.as_str()).unwrap_or("");
            let mapped: Vec<Value> = arr.iter().map(|item| eval_lambda(lambda, item, ctx)).collect();
            Some(Value::Array(mapped))
        }
        "filter" => {
            let arr = match value {
                Value::Array(a) => a.clone(),
                Value::Null => return Some(Value::Array(vec![])),
                other => vec![other.clone()],
            };
            let lambda = args.first().map(|s| s.as_str()).unwrap_or("");
            let filtered: Vec<Value> = arr.into_iter().filter(|item| truthy(&eval_lambda(lambda, item, ctx))).collect();
            Some(Value::Array(filtered))
        }
        "join" => {
            let arr = match value {
                Value::Array(a) => a.clone(),
                Value::Null => return Some(Value::String(String::new())),
                other => vec![other.clone()],
            };
            let sep_raw = args.first().map(|a| stringify(&super::eval::eval(a, ctx))).unwrap_or_else(|| ",".to_string());
            let res = arr.iter().map(|item| stringify(&unwrap_item(item))).collect::<Vec<_>>().join(&sep_raw);
            Some(Value::String(res))
        }
        "find" => {
            if let Value::Array(arr) = value {
                let lambda = args.first().map(|s| s.as_str()).unwrap_or("");
                let found = arr.iter().find(|item| truthy(&eval_lambda(lambda, item, ctx))).cloned().unwrap_or(Value::Null);
                return Some(found);
            }
            Some(Value::Null)
        }
        "some" => {
            if let Value::Array(arr) = value {
                let lambda = args.first().map(|s| s.as_str()).unwrap_or("");
                let ok = arr.iter().any(|item| truthy(&eval_lambda(lambda, item, ctx)));
                return Some(Value::Bool(ok));
            }
            Some(Value::Bool(false))
        }
        "every" => {
            if let Value::Array(arr) = value {
                let lambda = args.first().map(|s| s.as_str()).unwrap_or("");
                let ok = arr.iter().all(|item| truthy(&eval_lambda(lambda, item, ctx)));
                return Some(Value::Bool(ok));
            }
            Some(Value::Bool(false))
        }
        "reverse" => {
            if let Value::Array(arr) = value {
                let mut rev = arr.clone();
                rev.reverse();
                return Some(Value::Array(rev));
            }
            Some(value.clone())
        }
        "sort" => {
            if let Value::Array(arr) = value {
                let mut sorted = arr.clone();
                sorted.sort_by(|a, b| stringify(a).cmp(&stringify(b)));
                return Some(Value::Array(sorted));
            }
            Some(value.clone())
        }
        "flat" => {
            if let Value::Array(arr) = value {
                let mut flat = Vec::new();
                for item in arr {
                    if let Value::Array(inner) = item {
                        flat.extend(inner.clone());
                    } else {
                        flat.push(item.clone());
                    }
                }
                return Some(Value::Array(flat));
            }
            Some(value.clone())
        }
        "split" => {
            let s = stringify(value);
            let delim = args.first().map(|a| stringify(&super::eval::eval(a, ctx))).unwrap_or_else(|| ",".to_string());
            let parts: Vec<Value> = s.split(&delim).map(|p| Value::String(p.to_string())).collect();
            Some(Value::Array(parts))
        }
        "slice" => {
            let start = args.first().and_then(|a| stringify(&super::eval::eval(a, ctx)).parse::<i64>().ok()).unwrap_or(0);
            let end_opt = args.get(1).and_then(|a| stringify(&super::eval::eval(a, ctx)).parse::<i64>().ok());
            if let Value::Array(arr) = value {
                let len = arr.len() as i64;
                let s = if start < 0 { (len + start).max(0) } else { start.min(len) } as usize;
                let e = match end_opt {
                    Some(end) => (if end < 0 { (len + end).max(0) } else { end.min(len) }) as usize,
                    None => len as usize,
                };
                let res = if s <= e { arr[s..e].to_vec() } else { vec![] };
                return Some(Value::Array(res));
            }
            let s_str = stringify(value);
            let len = s_str.chars().count() as i64;
            let s = if start < 0 { (len + start).max(0) } else { start.min(len) } as usize;
            let e = match end_opt {
                Some(end) => (if end < 0 { (len + end).max(0) } else { end.min(len) }) as usize,
                None => len as usize,
            };
            let res: String = if s <= e { s_str.chars().skip(s).take(e - s).collect() } else { String::new() };
            Some(Value::String(res))
        }

        // ── String & General methods ──
        "toUpperCase" => Some(Value::String(stringify(value).to_uppercase())),
        "toLowerCase" => Some(Value::String(stringify(value).to_lowercase())),
        "trim" => Some(Value::String(stringify(value).trim().to_string())),
        "length" | "size" => {
            match value {
                Value::Array(a) => Some(num(a.len() as f64)),
                Value::Object(o) => Some(num(o.len() as f64)),
                _ => Some(num(stringify(value).chars().count() as f64)),
            }
        }
        "includes" => {
            let needle_val = args.first().map(|a| super::eval::eval(a, ctx)).unwrap_or(Value::Null);
            if let Value::Array(arr) = value {
                let ok = arr.iter().any(|item| super::context::json_eq(item, &needle_val));
                return Some(Value::Bool(ok));
            }
            let needle = stringify(&needle_val);
            Some(Value::Bool(stringify(value).contains(&needle)))
        }
        "startsWith" => {
            let needle = args.first().map(|a| stringify(&super::eval::eval(a, ctx))).unwrap_or_default();
            Some(Value::Bool(stringify(value).starts_with(&needle)))
        }
        "endsWith" => {
            let needle = args.first().map(|a| stringify(&super::eval::eval(a, ctx))).unwrap_or_default();
            Some(Value::Bool(stringify(value).ends_with(&needle)))
        }
        "replace" => {
            let s = stringify(value);
            if args.len() >= 2 {
                let from = stringify(&super::eval::eval(&args[0], ctx));
                let to = stringify(&super::eval::eval(&args[1], ctx));
                Some(Value::String(s.replacen(&from, &to, 1)))
            } else {
                Some(Value::String(s))
            }
        }
        "replaceAll" => {
            let s = stringify(value);
            if args.len() >= 2 {
                let from = stringify(&super::eval::eval(&args[0], ctx));
                let to = stringify(&super::eval::eval(&args[1], ctx));
                Some(Value::String(s.replace(&from, &to)))
            } else {
                Some(Value::String(s))
            }
        }
        "toNumber" | "toFloat" => Some(num(stringify(value).trim().parse::<f64>().unwrap_or(0.0))),
        "toFixed" => {
            let s = stringify(value);
            let digits = args.first().and_then(|a| stringify(&super::eval::eval(a, ctx)).parse::<usize>().ok()).unwrap_or(2);
            Some(Value::String(format!("{:.*}", digits, s.trim().parse::<f64>().unwrap_or(0.0))))
        }
        _ => Some(value.clone()),
    }
}

