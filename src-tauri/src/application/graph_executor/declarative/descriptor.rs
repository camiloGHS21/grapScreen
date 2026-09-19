//! Declarative node descriptors.
//!
//! n8n implements the overwhelming majority of its built-in nodes as *data* — a
//! description object plus one shared HTTP helper — rather than as bespoke code
//! per integration. That is the only way catalogue parity is reachable here:
//! the current hand-written-runner-per-node approach produced ~40 runners for
//! 35 types and does not scale to 554.
//!
//! `src/data/n8n-descriptors.json` is generated from the n8n source repository
//! by `scripts/n8n-extract-descriptors.mjs` and embedded at compile time, so the
//! backend can execute a declarative node without the frontend being involved.
//!
//! Existing hand-written kinds are untouched by design: this is purely additive.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;

/// Reads a field the way `#[serde(default)]` does, but also accepts an explicit
/// `null`.
///
/// `#[serde(default)]` only covers a field that is *absent*. The generator
/// emits `null` for values n8n leaves undefined — 41 credentials declare no
/// `authenticate` block and land here as `"authType": null` — and a single
/// explicit `null` used to fail the parse of the entire embedded catalogue.
/// Every non-`Option` field of this model goes through this helper so a `null`
/// the generator produces can never take the registry down with it.
fn null_as_default<'de, D, T>(de: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de> + Default,
{
    Ok(Option::<T>::deserialize(de)?.unwrap_or_default())
}

/// How a node authenticates, as declared by the n8n credential type it uses.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CredentialSpec {
    /// n8n credential type name, e.g. `slackApi`.
    #[serde(default)]
    pub name: Option<String>,
    /// n8n `authenticate.type`: `generic`, `bearer`, `basic`, `apiKey`,
    /// `queryAuth`, `oAuth2`, … Empty when the credential declares no
    /// `authenticate` block at all, which is a legitimate state meaning "this
    /// credential type adds nothing to the request".
    #[serde(rename = "authType", default, deserialize_with = "null_as_default")]
    pub auth_type: String,
    #[serde(rename = "baseUrl", default)]
    pub base_url: Option<String>,
    /// Header templates, e.g. `Authorization: =Bearer {{$credentials.accessToken}}`.
    #[serde(default, deserialize_with = "null_as_default")]
    pub headers: BTreeMap<String, String>,
    /// Query-string templates applied to every request.
    #[serde(default, deserialize_with = "null_as_default")]
    pub qs: BTreeMap<String, String>,
    /// Credential field names referenced by those templates.
    #[serde(default, deserialize_with = "null_as_default")]
    pub fields: Vec<String>,
}

/// The editable request template stored on the node. Empty by default: a wrong
/// guess would be worse than an obvious blank the user fills in once.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestTemplate {
    #[serde(default = "default_method", deserialize_with = "method_or_default")]
    pub method: String,
    #[serde(default, deserialize_with = "null_as_default")]
    pub path: String,
    #[serde(default, deserialize_with = "null_as_default")]
    pub qs: BTreeMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
}

fn default_method() -> String {
    "GET".to_string()
}

/// `default_method` as a `deserialize_with` target: a `null` method means "not
/// specified", which is a GET, not an empty verb.
fn method_or_default<'de, D>(de: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<String>::deserialize(de)?.unwrap_or_else(default_method))
}

impl Default for RequestTemplate {
    fn default() -> Self {
        Self {
            method: default_method(),
            path: String::new(),
            qs: BTreeMap::new(),
            body: None,
        }
    }
}

/// One n8n built-in node, reduced to the data the generic runner needs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeDescriptor {
    /// Stable identifier, e.g. `Slack`. This is what a graph node stores.
    pub key: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(default, deserialize_with = "null_as_default")]
    pub description: String,
    #[serde(default, deserialize_with = "null_as_default")]
    pub category: String,
    #[serde(default)]
    pub subcategory: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(rename = "isTrigger", default, deserialize_with = "null_as_default")]
    pub is_trigger: bool,
    /// How the trigger receives its event: `webhook`, `polling`, `schedule` or
    /// `event`. Detected from the node class in the n8n source (`async poll()`
    /// vs a `webhook`/`webhookMethods` member), because the catalogue we join
    /// against only flags 27 of the 111 triggers.
    #[serde(rename = "triggerMode", default)]
    pub trigger_mode: Option<String>,
    #[serde(default, deserialize_with = "null_as_default")]
    pub polling: bool,
    #[serde(default, deserialize_with = "null_as_default")]
    pub webhook: bool,
    #[serde(default, deserialize_with = "null_as_default")]
    pub package: String,
    #[serde(default, deserialize_with = "null_as_default")]
    pub path: String,
    #[serde(default)]
    pub credential: Option<CredentialSpec>,
    /// Resolved API root, from the credential or a sibling helper file.
    #[serde(rename = "baseUrl", default)]
    pub base_url: Option<String>,
    #[serde(default, deserialize_with = "null_as_default")]
    pub request: RequestTemplate,
}

impl NodeDescriptor {
    /// True when the descriptor carries enough information to attempt a real
    /// request without the user having to invent a URL from scratch.
    pub fn is_executable(&self) -> bool {
        self.base_url.is_some()
    }

    /// The trigger mechanism, falling back to the boolean flags when the
    /// generated data predates `triggerMode`.
    pub fn trigger_mode(&self) -> &str {
        match self.trigger_mode.as_deref() {
            Some(m) if !m.trim().is_empty() => m,
            _ => {
                if self.webhook {
                    "webhook"
                } else if self.polling {
                    "polling"
                } else if self.is_trigger {
                    "event"
                } else {
                    "action"
                }
            }
        }
    }

    /// Whether the trigger daemon knows how to arm this node by itself.
    ///
    /// `event` covers broker subscribers (Kafka, MQTT, Redis), IMAP watchers
    /// and manual/subflow triggers. Those need a client library or an external
    /// caller, so the daemon reports them instead of silently arming nothing.
    pub fn is_armable(&self) -> bool {
        matches!(self.trigger_mode(), "webhook" | "polling" | "schedule")
    }

    /// The base URL to use, preferring whatever the user typed on the node so a
    /// wrong extraction can always be corrected in the UI.
    pub fn effective_base_url(&self, override_url: Option<&str>) -> Option<String> {
        override_url
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .or_else(|| self.base_url.clone())
    }
}

const EMBEDDED: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src/data/n8n-descriptors.json"
));

/// Lookup table over every descriptor, built once per process.
pub struct DescriptorRegistry {
    by_key: HashMap<String, NodeDescriptor>,
    all: Vec<NodeDescriptor>,
}

impl DescriptorRegistry {
    fn from_json(raw: &str) -> Result<Self, String> {
        let all: Vec<NodeDescriptor> =
            serde_json::from_str(raw).map_err(|e| format!("descriptores n8n ilegibles: {}", e))?;
        let mut by_key = HashMap::with_capacity(all.len());
        for d in &all {
            by_key.entry(d.key.clone()).or_insert_with(|| d.clone());
        }
        Ok(Self { by_key, all })
    }

    /// Process-wide registry, parsed on first use.
    pub fn global() -> &'static DescriptorRegistry {
        static REGISTRY: OnceLock<DescriptorRegistry> = OnceLock::new();
        REGISTRY.get_or_init(|| registry_or_panic(EMBEDDED))
    }

    pub fn get(&self, key: &str) -> Option<&NodeDescriptor> {
        self.by_key.get(key)
    }

    pub fn all(&self) -> &[NodeDescriptor] {
        &self.all
    }

    pub fn len(&self) -> usize {
        self.all.len()
    }

    pub fn is_empty(&self) -> bool {
        self.all.is_empty()
    }
}

/// Builds the registry from the embedded catalogue, aborting on a parse error.
///
/// Degrading to an empty registry is the one outcome this must never have: the
/// catalogue is a compile-time artifact, so an unreadable one is a build defect,
/// not a runtime condition. Swallowing it turns "the generator emitted a `null`"
/// into "all 565 n8n nodes are silently unavailable", with no error anywhere the
/// user or the developer can see.
fn registry_or_panic(raw: &str) -> DescriptorRegistry {
    DescriptorRegistry::from_json(raw)
        .unwrap_or_else(|e| panic!("catálogo de descriptores n8n corrupto: {}", e))
}

#[cfg(test)]
#[path = "descriptor_tests.rs"]
mod tests;
