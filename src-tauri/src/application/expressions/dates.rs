use super::context::{as_f64, num, stringify, ExprContext};
use super::eval::eval;
use chrono::{DateTime, Datelike, Duration, FixedOffset, Local, NaiveDate, NaiveDateTime, Offset, TimeZone, Timelike};
use serde_json::Value;

/// Parses an input value (ISO string, date string, or timestamp) into a `DateTime<FixedOffset>`.
pub fn parse_date_value(val: &Value) -> Option<DateTime<FixedOffset>> {
    match val {
        Value::String(s) => {
            let trimmed = s.trim();
            if let Ok(dt) = DateTime::parse_from_rfc3339(trimmed) {
                return Some(dt);
            }
            let local_offset = *Local::now().offset();
            if let Ok(ndt) = NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S")
                .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M:%S"))
            {
                return local_offset.from_local_datetime(&ndt).single();
            }
            if let Ok(nd) = NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
                let ndt = nd.and_hms_opt(0, 0, 0)?;
                return local_offset.from_local_datetime(&ndt).single();
            }
            if let Ok(ms) = trimmed.parse::<i64>() {
                return if ms > 10_000_000_000 {
                    DateTime::from_timestamp_millis(ms).map(|dt| dt.with_timezone(&local_offset))
                } else {
                    DateTime::from_timestamp(ms, 0).map(|dt| dt.with_timezone(&local_offset))
                };
            }
            None
        }
        Value::Number(n) => {
            let num_f = n.as_f64()?;
            let local_offset = *Local::now().offset();
            if num_f > 10_000_000_000.0 {
                DateTime::from_timestamp_millis(num_f as i64).map(|dt| dt.with_timezone(&local_offset))
            } else {
                DateTime::from_timestamp(num_f as i64, 0).map(|dt| dt.with_timezone(&local_offset))
            }
        }
        _ => None,
    }
}

/// Formats `dt` using Luxon-compatible tokens (e.g. yyyy, MM, dd, HH, mm, ss, SSS, a, etc.).
pub fn format_date(dt: &DateTime<FixedOffset>, fmt: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = fmt.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\'' {
            i += 1;
            while i < chars.len() && chars[i] != '\'' {
                out.push(chars[i]);
                i += 1;
            }
            if i < chars.len() && chars[i] == '\'' { i += 1; }
            continue;
        }
        let start = i;
        let c = chars[i];
        while i < chars.len() && chars[i] == c { i += 1; }
        let token: String = chars[start..i].iter().collect();
        match token.as_str() {
            "yyyy" => out.push_str(&format!("{:04}", dt.year())),
            "yy" => out.push_str(&format!("{:02}", dt.year() % 100)),
            "MMMM" | "LLLL" => out.push_str(&dt.format("%B").to_string()),
            "MMM" | "LLL" => out.push_str(&dt.format("%b").to_string()),
            "MM" => out.push_str(&format!("{:02}", dt.month())),
            "M" => out.push_str(&format!("{}", dt.month())),
            "dd" => out.push_str(&format!("{:02}", dt.day())),
            "d" => out.push_str(&format!("{}", dt.day())),
            "HH" => out.push_str(&format!("{:02}", dt.hour())),
            "H" => out.push_str(&format!("{}", dt.hour())),
            "hh" => out.push_str(&format!("{:02}", match dt.hour() % 12 { 0 => 12, h => h })),
            "h" => out.push_str(&format!("{}", match dt.hour() % 12 { 0 => 12, h => h })),
            "mm" => out.push_str(&format!("{:02}", dt.minute())),
            "m" => out.push_str(&format!("{}", dt.minute())),
            "ss" => out.push_str(&format!("{:02}", dt.second())),
            "s" => out.push_str(&format!("{}", dt.second())),
            "SSS" => out.push_str(&format!("{:03}", dt.timestamp_subsec_millis())),
            "a" => out.push_str(if dt.hour() < 12 { "AM" } else { "PM" }),
            "cccc" => out.push_str(&dt.format("%A").to_string()),
            "ccc" => out.push_str(&dt.format("%a").to_string()),
            "ZZZ" | "ZZ" => out.push_str(&dt.format("%:z").to_string()),
            "Z" => out.push_str(&dt.format("%z").to_string()),
            _ => out.push_str(&token),
        }
    }
    out
}

/// Applies `.plus({ days: 1 })` or `.minus(...)` with duration arguments.
pub fn apply_duration(dt: DateTime<FixedOffset>, args: &[String], sign: i32) -> DateTime<FixedOffset> {
    if args.is_empty() { return dt; }
    if args.len() >= 2 {
        if let Ok(amt) = args[0].trim().parse::<i64>() {
            let unit = args[1].trim().trim_matches(|c| c == '\'' || c == '"').to_lowercase();
            return add_unit(dt, amt * sign as i64, &unit);
        }
    }
    let src = args[0].trim().trim_matches(|c| c == '{' || c == '}');
    let mut curr = dt;
    for part in src.split(',') {
        if let Some((k, v)) = part.split_once(':') {
            let key = k.trim().trim_matches(|c| c == '\'' || c == '"').to_lowercase();
            if let Ok(val) = v.trim().trim_matches(|c| c == '\'' || c == '"').parse::<i64>() {
                curr = add_unit(curr, val * sign as i64, &key);
            }
        }
    }
    curr
}

fn add_unit(dt: DateTime<FixedOffset>, amt: i64, unit: &str) -> DateTime<FixedOffset> {
    match unit {
        "day" | "days" | "d" => dt + Duration::days(amt),
        "hour" | "hours" | "h" => dt + Duration::hours(amt),
        "minute" | "minutes" | "m" => dt + Duration::minutes(amt),
        "second" | "seconds" | "s" => dt + Duration::seconds(amt),
        "millisecond" | "milliseconds" | "ms" => dt + Duration::milliseconds(amt),
        "week" | "weeks" | "w" => dt + Duration::weeks(amt),
        "month" | "months" => dt + Duration::days(amt * 30),
        "year" | "years" => dt + Duration::days(amt * 365),
        _ => dt,
    }
}

pub fn apply_start_of(dt: DateTime<FixedOffset>, unit: &str) -> DateTime<FixedOffset> {
    let offset = *dt.offset();
    let u = unit.trim().trim_matches(|c| c == '\'' || c == '"').to_lowercase();
    let naive = dt.naive_local();
    let res = match u.as_str() {
        "year" => naive.date().with_day(1).and_then(|d| d.with_month(1)).and_then(|d| d.and_hms_opt(0, 0, 0)),
        "month" => naive.date().with_day(1).and_then(|d| d.and_hms_opt(0, 0, 0)),
        "week" => (naive - Duration::days(naive.weekday().num_days_from_monday() as i64)).date().and_hms_opt(0, 0, 0),
        "day" => naive.date().and_hms_opt(0, 0, 0),
        "hour" => naive.date().and_hms_opt(naive.hour(), 0, 0),
        "minute" => naive.date().and_hms_opt(naive.hour(), naive.minute(), 0),
        "second" => naive.date().and_hms_milli_opt(naive.hour(), naive.minute(), naive.second(), 0),
        _ => Some(naive),
    };
    res.and_then(|n| offset.from_local_datetime(&n).single()).unwrap_or(dt)
}

pub fn apply_end_of(dt: DateTime<FixedOffset>, unit: &str) -> DateTime<FixedOffset> {
    let offset = *dt.offset();
    let u = unit.trim().trim_matches(|c| c == '\'' || c == '"').to_lowercase();
    let naive = dt.naive_local();
    let res = match u.as_str() {
        "year" => naive.date().with_day(31).and_then(|d| d.with_month(12)).and_then(|d| d.and_hms_milli_opt(23, 59, 59, 999)),
        "month" => {
            let (next_y, next_m) = if naive.month() == 12 { (naive.year() + 1, 1) } else { (naive.year(), naive.month() + 1) };
            NaiveDate::from_ymd_opt(next_y, next_m, 1).and_then(|d| d.and_hms_opt(0, 0, 0)).and_then(|d| d.checked_sub_signed(Duration::milliseconds(1)))
        }
        "week" => (naive + Duration::days(6 - naive.weekday().num_days_from_monday() as i64)).date().and_hms_milli_opt(23, 59, 59, 999),
        "day" => naive.date().and_hms_milli_opt(23, 59, 59, 999),
        "hour" => naive.date().and_hms_milli_opt(naive.hour(), 59, 59, 999),
        "minute" => naive.date().and_hms_milli_opt(naive.hour(), naive.minute(), 59, 999),
        _ => Some(naive),
    };
    res.and_then(|n| offset.from_local_datetime(&n).single()).unwrap_or(dt)
}

pub fn apply_diff(dt: DateTime<FixedOffset>, other_val: &Value, unit: &str) -> f64 {
    let other_dt = match parse_date_value(other_val) {
        Some(d) => d,
        None => return 0.0,
    };
    let diff = dt.signed_duration_since(other_dt);
    let u = unit.trim().trim_matches(|c| c == '\'' || c == '"').to_lowercase();
    match u.as_str() {
        "second" | "seconds" | "s" => diff.num_seconds() as f64,
        "minute" | "minutes" | "m" => (diff.num_seconds() as f64) / 60.0,
        "hour" | "hours" | "h" => (diff.num_seconds() as f64) / 3600.0,
        "day" | "days" | "d" => (diff.num_seconds() as f64) / 86400.0,
        "week" | "weeks" | "w" => (diff.num_seconds() as f64) / 604800.0,
        "month" | "months" => (diff.num_seconds() as f64) / (86400.0 * 30.0),
        "year" | "years" => (diff.num_seconds() as f64) / (86400.0 * 365.0),
        _ => diff.num_milliseconds() as f64,
    }
}

pub fn apply_date_method(val: &Value, method: &str, args: &[String], ctx: &ExprContext) -> Option<Value> {
    let dt = parse_date_value(val)?;
    match method {
        "toFormat" => {
            let fmt = args.first().map(|a| stringify(&eval(a, ctx))).unwrap_or_else(|| "yyyy-MM-dd".to_string());
            Some(Value::String(format_date(&dt, &fmt)))
        }
        "toISO" => Some(Value::String(dt.to_rfc3339())),
        "toISODate" => Some(Value::String(dt.format("%Y-%m-%d").to_string())),
        "toISOTime" => Some(Value::String(dt.format("%H:%M:%S").to_string())),
        "toMillis" | "valueOf" => Some(num(dt.timestamp_millis() as f64)),
        "toSeconds" => Some(num(dt.timestamp() as f64)),
        "plus" => Some(Value::String(apply_duration(dt, args, 1).to_rfc3339())),
        "minus" => Some(Value::String(apply_duration(dt, args, -1).to_rfc3339())),
        "startOf" => {
            let unit = args.first().map(|a| stringify(&eval(a, ctx))).unwrap_or_else(|| "day".to_string());
            Some(Value::String(apply_start_of(dt, &unit).to_rfc3339()))
        }
        "endOf" => {
            let unit = args.first().map(|a| stringify(&eval(a, ctx))).unwrap_or_else(|| "day".to_string());
            Some(Value::String(apply_end_of(dt, &unit).to_rfc3339()))
        }
        "diff" => {
            let other = args.first().map(|a| eval(a, ctx)).unwrap_or(Value::Null);
            let unit = args.get(1).map(|a| stringify(&eval(a, ctx))).unwrap_or_else(|| "milliseconds".to_string());
            Some(num(apply_diff(dt, &other, &unit)))
        }
        "diffNow" => {
            let unit = args.first().map(|a| stringify(&eval(a, ctx))).unwrap_or_else(|| "milliseconds".to_string());
            let now_fixed = Local::now().fixed_offset();
            Some(num(apply_diff(dt, &Value::String(now_fixed.to_rfc3339()), &unit)))
        }
        "setZone" => {
            let zone = args.first().map(|a| stringify(&eval(a, ctx))).unwrap_or_default();
            if zone.trim().to_lowercase() == "utc" {
                let utc_offset = FixedOffset::east_opt(0).unwrap_or(*Local::now().offset());
                Some(Value::String(dt.with_timezone(&utc_offset).to_rfc3339()))
            } else {
                Some(Value::String(dt.to_rfc3339()))
            }
        }
        "isValid" => Some(Value::Bool(true)),
        _ => None,
    }
}

pub fn call_datetime(method: &str, args: &[String], ctx: &ExprContext) -> Option<Value> {
    match method {
        "now" => Some(Value::String(Local::now().fixed_offset().to_rfc3339())),
        "fromISO" => {
            let raw = args.first().map(|a| stringify(&eval(a, ctx)))?;
            let dt = parse_date_value(&Value::String(raw))?;
            Some(Value::String(dt.to_rfc3339()))
        }
        "fromMillis" => {
            let ms = args.first().and_then(|a| as_f64(&eval(a, ctx)))?;
            let local_offset = *Local::now().offset();
            let dt = DateTime::from_timestamp_millis(ms as i64)?.with_timezone(&local_offset);
            Some(Value::String(dt.to_rfc3339()))
        }
        "fromSeconds" => {
            let s = args.first().and_then(|a| as_f64(&eval(a, ctx)))?;
            let local_offset = *Local::now().offset();
            let dt = DateTime::from_timestamp(s as i64, 0)?.with_timezone(&local_offset);
            Some(Value::String(dt.to_rfc3339()))
        }
        "fromFormat" => {
            let text = args.first().map(|a| stringify(&eval(a, ctx)))?;
            let fmt = args.get(1).map(|a| stringify(&eval(a, ctx))).unwrap_or_else(|| "yyyy-MM-dd".to_string());
            let ndt = NaiveDateTime::parse_from_str(&text, &fmt).ok()?;
            let local_offset = *Local::now().offset();
            let dt = local_offset.from_local_datetime(&ndt).single()?;
            Some(Value::String(dt.to_rfc3339()))
        }
        "fromSQL" => {
            let text = args.first().map(|a| stringify(&eval(a, ctx)))?;
            let dt = parse_date_value(&Value::String(text))?;
            Some(Value::String(dt.to_rfc3339()))
        }
        _ => None,
    }
}

pub fn resolve_now_prop(prop: &str) -> Option<Value> {
    let now = Local::now();
    match prop.trim().to_lowercase().as_str() {
        "year" => Some(num(now.year() as f64)),
        "month" => Some(num(now.month() as f64)),
        "day" => Some(num(now.day() as f64)),
        "hour" => Some(num(now.hour() as f64)),
        "minute" => Some(num(now.minute() as f64)),
        "second" => Some(num(now.second() as f64)),
        "millisecond" => Some(num(now.timestamp_subsec_millis() as f64)),
        "weekday" => Some(num(now.weekday().number_from_monday() as f64)),
        "isvalid" => Some(Value::Bool(true)),
        _ => None,
    }
}
