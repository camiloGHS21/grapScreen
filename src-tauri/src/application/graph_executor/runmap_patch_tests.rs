//! Tests verifying that operation patches and sibling syntheses provide 100% executable coverage.

#[cfg(test)]
mod tests {
    use crate::application::graph_executor::runmap::{plan, RunMap};
    use serde_json::json;

    #[test]
    fn test_airtable_record_upsert_is_executable() {
        let map = RunMap::global();
        let node = map.get("Airtable").expect("Airtable node must exist");
        let case = node.case_for(Some("record"), "upsert").expect("upsert case must exist");
        assert!(case.sendable().is_some(), "Airtable record::upsert must have sendable request");

        let data = json!({
            "n8n_key": "Airtable",
            "n8n_config": {
                "resource": "record",
                "operation": "upsert",
                "base": "app12345",
                "table": "tbl67890",
                "fieldsToMergeOn": "Email"
            }
        });
        let planned = plan(&data).expect("Must plan Airtable record::upsert");
        assert_eq!(planned.method, "PATCH");
        assert_eq!(planned.url, "https://api.airtable.com/v0/app12345/tbl67890");
    }

    #[test]
    fn test_notion_database_page_get_all_is_executable() {
        let map = RunMap::global();
        let node = map.get("Notion").expect("Notion node must exist");
        let case = node.case_for(Some("databasePage"), "getAll").expect("getAll case must exist");
        assert!(case.sendable().is_some(), "Notion databasePage::getAll must be sendable");

        let data = json!({
            "n8n_key": "Notion",
            "n8n_config": {
                "resource": "databasePage",
                "operation": "getAll",
                "databaseId": "db_notion_999"
            }
        });
        let planned = plan(&data).expect("Must plan Notion databasePage::getAll");
        assert_eq!(planned.method, "POST");
        assert_eq!(planned.url, "https://api.notion.com/v1/databases/db_notion_999/query");
        let nv = planned
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("notion-version"))
            .map(|(_, v)| v.as_str());
        assert_eq!(nv, Some("2026-03-11"));
    }

    #[test]
    fn test_github_workflow_dispatch_and_wait_is_executable() {
        let map = RunMap::global();
        let node = map.get("Github").expect("Github node must exist");
        let case = node.case_for(Some("workflow"), "dispatchAndWait").expect("dispatchAndWait must exist");
        assert!(case.sendable().is_some());

        let data = json!({
            "n8n_key": "Github",
            "n8n_config": {
                "resource": "workflow",
                "operation": "dispatchAndWait",
                "owner": "octocat",
                "repository": "Hello-World",
                "workflowId": "main.yml",
                "ref": "main"
            }
        });
        let planned = plan(&data).expect("Must plan Github dispatchAndWait");
        assert_eq!(planned.method, "POST");
        assert_eq!(
            planned.url,
            "https://api.github.com/repos/octocat/Hello-World/actions/workflows/main.yml/dispatches"
        );
    }

    #[test]
    fn test_slack_message_post_and_user_update_profile() {
        let map = RunMap::global();
        let node = map.get("Slack").expect("Slack node must exist");
        let post_case = node.case_for(Some("message"), "post").expect("post must exist");
        assert!(post_case.sendable().is_some());

        let profile_case = node.case_for(Some("user"), "updateProfile").expect("updateProfile must exist");
        assert!(profile_case.sendable().is_some());

        let data = json!({
            "n8n_key": "Slack",
            "n8n_config": {
                "resource": "message",
                "operation": "post",
                "channelId": "C12345678",
                "text": "Hello Slack!"
            }
        });
        let planned = plan(&data).expect("Must plan Slack message::post");
        assert_eq!(planned.method, "POST");
        assert_eq!(planned.url, "https://slack.com/api/chat.postMessage");
    }

    #[test]
    fn test_stripe_token_create_is_executable() {
        let map = RunMap::global();
        let node = map.get("Stripe").expect("Stripe node must exist");
        let case = node.case_for(Some("token"), "create").expect("create token must exist");
        assert!(case.sendable().is_some());

        let data = json!({
            "n8n_key": "Stripe",
            "n8n_config": {
                "resource": "token",
                "operation": "create"
            }
        });
        let planned = plan(&data).expect("Must plan Stripe token::create");
        assert_eq!(planned.method, "POST");
        assert_eq!(planned.url, "https://api.stripe.com/v1/tokens");
    }

    #[test]
    fn test_clickup_and_zendesk_patches() {
        let map = RunMap::global();
        let clickup = map.get("ClickUp").expect("ClickUp exists");
        assert!(clickup.case_for(Some("task"), "create").unwrap().sendable().is_some());

        let zendesk = map.get("Zendesk").expect("Zendesk exists");
        assert!(zendesk.case_for(Some("organization"), "create").unwrap().sendable().is_some());
        assert!(zendesk.case_for(Some("organization"), "update").unwrap().sendable().is_some());
    }
}
