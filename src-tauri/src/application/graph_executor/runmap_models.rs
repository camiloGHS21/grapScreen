//! Data models and artifact loading for n8n execution map.

use serde::Deserialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

#[path = "runmap_patches.rs"]
pub mod runmap_patches;
#[cfg(test)]
#[path = "runmap_patch_tests.rs"]
mod runmap_patch_tests;

const EMBEDDED: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src/data/n8n-runmap.json"
));

const EMBEDDED_TRIGGERS: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src/data/n8n-trigger-runmap.json"
));

/// One HTTP call the captured node made.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct CapturedRequest {
    pub kind: String,
    pub method: String,
    pub path: String,
    pub qs: Option<Map<String, Value>>,
    pub headers: Option<Map<String, Value>>,
    pub body: Option<Value>,
    pub json: Option<Value>,
    #[serde(rename = "credentialType")]
    pub credential_type: Option<String>,
}

impl CapturedRequest {
    pub fn payload(&self) -> Option<&Value> {
        match (&self.json, &self.body) {
            (Some(json), _) if json.is_object() || json.is_array() => Some(json),
            (_, Some(body)) => Some(body),
            _ => None,
        }
    }
}

/// One `resource`/`operation` pair of a node.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct RunCase {
    pub resource: Option<String>,
    pub operation: String,
    pub status: String,
    pub needs: Vec<String>,
    pub requests: Vec<CapturedRequest>,
    pub error: Option<String>,
}

impl RunCase {
    pub fn sendable(&self) -> Option<&CapturedRequest> {
        self.requests.last()
    }
}

/// Every captured case of one catalogue node.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct RunNode {
    pub status: String,
    pub cases: Vec<RunCase>,
}

impl RunNode {
    pub fn usable_cases(&self) -> usize {
        self.cases.iter().filter(|c| c.sendable().is_some()).count()
    }

    pub fn is_complete(&self) -> bool {
        !self.cases.is_empty() && self.usable_cases() == self.cases.len()
    }

    pub fn case_for(&self, resource: Option<&str>, operation: &str) -> Option<&RunCase> {
        self.cases
            .iter()
            .find(|c| {
                c.operation == operation
                    && match (c.resource.as_deref(), resource) {
                        (_, None) => true,
                        (Some(a), Some(b)) => a == b,
                        (None, Some(_)) => true,
                    }
            })
            .or_else(|| self.cases.iter().find(|c| c.operation == operation))
    }
}

/// The whole artifact, indexed by catalogue key.
pub struct RunMap {
    by_key: HashMap<String, RunNode>,
}

impl RunMap {
    fn from_json(raw: &str, raw_triggers: &str) -> Result<Self, String> {
        #[derive(Deserialize)]
        struct Artifact {
            #[serde(default)]
            nodes: HashMap<String, RunNode>,
        }
        let mut nodes: HashMap<String, RunNode> = serde_json::from_str::<Artifact>(raw)
            .map_err(|e| format!("mapa de ejecución ilegible: {}", e))?
            .nodes;
        let triggers: HashMap<String, RunNode> =
            serde_json::from_str::<Artifact>(raw_triggers)
                .map_err(|e| format!("mapa de disparadores ilegible: {}", e))?
                .nodes;
        for (key, node) in triggers {
            match nodes.get_mut(&key) {
                Some(existing) => existing.cases.extend(node.cases),
                None => {
                    nodes.insert(key, node);
                }
            }
        }
        runmap_patches::apply_patches(&mut nodes);
        Ok(Self { by_key: nodes })
    }

    pub fn global() -> &'static RunMap {
        static MAP: OnceLock<RunMap> = OnceLock::new();
        MAP.get_or_init(|| {
            RunMap::from_json(EMBEDDED, EMBEDDED_TRIGGERS)
                .unwrap_or_else(|e| panic!("mapa de ejecución n8n corrupto: {}", e))
        })
    }

    pub fn get(&self, key: &str) -> Option<&RunNode> {
        self.by_key.get(key)
    }

    pub fn is_executable(&self, key: &str) -> bool {
        self.by_key.get(key).is_some_and(|n| n.usable_cases() > 0)
    }

    pub fn is_pollable(&self, key: &str) -> bool {
        self.by_key.get(key).is_some_and(|node| {
            node.cases
                .iter()
                .any(|case| case.operation.is_empty() && case.sendable().is_some())
        })
    }

    pub fn executable_keys(&self) -> Vec<&str> {
        let mut keys: Vec<&str> = self
            .by_key
            .iter()
            .filter(|(_, n)| n.usable_cases() > 0)
            .map(|(k, _)| k.as_str())
            .collect();
        keys.sort_unstable();
        keys
    }

    pub fn len(&self) -> usize {
        self.by_key.len()
    }

    pub fn is_empty(&self) -> bool {
        self.by_key.is_empty()
    }
}

/// A request the map produced, ready to be handed to the HTTP client.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedRequest {
    pub key: String,
    pub resource: Option<String>,
    pub operation: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
}
