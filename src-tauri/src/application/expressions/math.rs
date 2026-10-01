use super::context::{as_f64, num, stringify, ExprContext};
use super::eval::eval;
use rand::Rng;
use serde_json::Value;

pub fn resolve_math_constant(token: &str) -> Option<Value> {
    match token {
        "Math.PI" => Some(num(std::f64::consts::PI)),
        "Math.E" => Some(num(std::f64::consts::E)),
        "Math.SQRT2" => Some(num(std::f64::consts::SQRT_2)),
        "Math.LN2" => Some(num(std::f64::consts::LN_2)),
        "Math.LN10" => Some(num(std::f64::consts::LN_10)),
        _ => None,
    }
}

pub fn call_math(method: &str, args: &[String], ctx: &ExprContext) -> Option<Value> {
    match method {
        "round" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            let decimals = args.get(1).and_then(|a| as_f64(&eval(a, ctx))).unwrap_or(0.0) as i32;
            Some(round_decimals(x, decimals))
        }
        "floor" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            Some(num(x.floor()))
        }
        "ceil" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            Some(num(x.ceil()))
        }
        "abs" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            Some(num(x.abs()))
        }
        "min" => {
            let mut min_val = f64::INFINITY;
            let mut found = false;
            for a in args {
                if let Some(n) = as_f64(&eval(a, ctx)) {
                    if n < min_val { min_val = n; }
                    found = true;
                }
            }
            if found { Some(num(min_val)) } else { None }
        }
        "max" => {
            let mut max_val = f64::NEG_INFINITY;
            let mut found = false;
            for a in args {
                if let Some(n) = as_f64(&eval(a, ctx)) {
                    if n > max_val { max_val = n; }
                    found = true;
                }
            }
            if found { Some(num(max_val)) } else { None }
        }
        "random" => {
            let mut rng = rand::thread_rng();
            Some(num(rng.gen::<f64>()))
        }
        "sqrt" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            if x < 0.0 { Some(Value::Null) } else { Some(num(x.sqrt())) }
        }
        "pow" => {
            let base = as_f64(&eval(args.first()?, ctx))?;
            let exp = as_f64(&eval(args.get(1)?, ctx))?;
            Some(num(base.powf(exp)))
        }
        "trunc" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            Some(num(x.trunc()))
        }
        "sign" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            Some(num(if x > 0.0 { 1.0 } else if x < 0.0 { -1.0 } else { 0.0 }))
        }
        "log" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            if x <= 0.0 { Some(Value::Null) } else { Some(num(x.ln())) }
        }
        "log10" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            if x <= 0.0 { Some(Value::Null) } else { Some(num(x.log10())) }
        }
        "exp" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            Some(num(x.exp()))
        }
        "sin" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            Some(num(x.sin()))
        }
        "cos" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            Some(num(x.cos()))
        }
        "tan" => {
            let x = as_f64(&eval(args.first()?, ctx))?;
            Some(num(x.tan()))
        }
        _ => None,
    }
}

pub fn call_global_math(func: &str, args: &[String], ctx: &ExprContext) -> Option<Value> {
    match func {
        "parseInt" => {
            let text = stringify(&eval(args.first()?, ctx));
            let radix = args.get(1).and_then(|a| as_f64(&eval(a, ctx))).unwrap_or(10.0) as u32;
            let clean = text.trim();
            if radix == 16 {
                let hex_str = clean.strip_prefix("0x").or_else(|| clean.strip_prefix("0X")).unwrap_or(clean);
                i64::from_str_radix(hex_str, 16).ok().map(|n| num(n as f64))
            } else if radix == 8 {
                let oct_str = clean.strip_prefix("0o").or_else(|| clean.strip_prefix("0O")).unwrap_or(clean);
                i64::from_str_radix(oct_str, 8).ok().map(|n| num(n as f64))
            } else if radix == 2 {
                let bin_str = clean.strip_prefix("0b").or_else(|| clean.strip_prefix("0B")).unwrap_or(clean);
                i64::from_str_radix(bin_str, 2).ok().map(|n| num(n as f64))
            } else {
                clean.parse::<f64>().ok().map(|f| num(f.trunc()))
            }
        }
        "parseFloat" => {
            let text = stringify(&eval(args.first()?, ctx));
            text.trim().parse::<f64>().ok().map(num)
        }
        "round" | "floor" | "ceil" | "abs" | "min" | "max" => call_math(func, args, ctx),
        _ => None,
    }
}

pub fn apply_number_method(val: &Value, method: &str, args: &[String], ctx: &ExprContext) -> Option<Value> {
    let x = as_f64(val)?;
    match method {
        "round" => {
            let decimals = args.first().and_then(|a| as_f64(&eval(a, ctx))).unwrap_or(0.0) as i32;
            Some(round_decimals(x, decimals))
        }
        "floor" => Some(num(x.floor())),
        "ceil" => Some(num(x.ceil())),
        "abs" => Some(num(x.abs())),
        "toFixed" => {
            let digits = args.first().and_then(|a| as_f64(&eval(a, ctx))).unwrap_or(2.0) as usize;
            Some(Value::String(format!("{:.*}", digits, x)))
        }
        "toPrecision" => {
            let prec = args.first().and_then(|a| as_f64(&eval(a, ctx))).unwrap_or(4.0) as usize;
            Some(Value::String(format!("{:.*}", prec, x)))
        }
        _ => None,
    }
}

fn round_decimals(val: f64, decimals: i32) -> Value {
    if decimals <= 0 {
        num(val.round())
    } else {
        let factor = 10f64.powi(decimals);
        num((val * factor).round() / factor)
    }
}
