#[cfg(test)]
mod tests {
    use super::super::merge_nodes::*;
    use serde_json::json;

    #[test]
    fn test_merge_append_mode() {
        let input1 = vec![json!({ "id": 1, "name": "Alice" })];
        let input2 = vec![json!({ "id": 2, "name": "Bob" })];
        let res = run_merge(&json!({ "mode": "append" }), input1, input2).expect("run_merge append");
        assert_eq!(res.len(), 2);
        assert_eq!(res[0]["id"], 1);
        assert_eq!(res[1]["id"], 2);
    }

    #[test]
    fn test_merge_choose_branch() {
        let input1 = vec![json!({ "branch": 1 })];
        let input2 = vec![json!({ "branch": 2 })];

        let res1 = run_merge(&json!({ "mode": "chooseBranch", "output": "input1" }), input1.clone(), input2.clone()).unwrap();
        assert_eq!(res1, input1);

        let res2 = run_merge(&json!({ "mode": "chooseBranch", "output": "input2" }), input1, input2).unwrap();
        assert_eq!(res2[0]["branch"], 2);
    }

    #[test]
    fn test_merge_by_position() {
        let input1 = vec![json!({ "a": 1 }), json!({ "a": 2 }), json!({ "a": 3 })];
        let input2 = vec![json!({ "b": 10 }), json!({ "b": 20 })];

        // outputType: all
        let res_all = run_merge(&json!({ "mode": "combine", "combinationMode": "mergeByPosition", "outputType": "all" }), input1.clone(), input2.clone()).unwrap();
        assert_eq!(res_all.len(), 3);
        assert_eq!(res_all[0], json!({ "a": 1, "b": 10 }));
        assert_eq!(res_all[1], json!({ "a": 2, "b": 20 }));
        assert_eq!(res_all[2], json!({ "a": 3 }));

        // outputType: matching
        let res_matching = run_merge(&json!({ "mode": "combine", "combinationMode": "mergeByPosition", "outputType": "matching" }), input1, input2).unwrap();
        assert_eq!(res_matching.len(), 2);
    }

    #[test]
    fn test_merge_by_fields_inner_and_left() {
        let input1 = vec![
            json!({ "userId": 1, "name": "Alice" }),
            json!({ "userId": 2, "name": "Bob" }),
            json!({ "userId": 3, "name": "Charlie" }),
        ];
        let input2 = vec![
            json!({ "id": 1, "role": "Admin" }),
            json!({ "id": 2, "role": "Developer" }),
            json!({ "id": 99, "role": "Guest" }),
        ];

        // Inner join on userId == id
        let inner_cfg = json!({
            "mode": "combine",
            "combinationMode": "mergeByFields",
            "joinMode": "inner",
            "field1": "userId",
            "field2": "id"
        });
        let res_inner = run_merge(&inner_cfg, input1.clone(), input2.clone()).unwrap();
        assert_eq!(res_inner.len(), 2);
        assert_eq!(res_inner[0]["name"], "Alice");
        assert_eq!(res_inner[0]["role"], "Admin");
        assert_eq!(res_inner[1]["name"], "Bob");
        assert_eq!(res_inner[1]["role"], "Developer");

        // Left join (enrich input 1)
        let left_cfg = json!({
            "mode": "combine",
            "combinationMode": "mergeByFields",
            "joinMode": "left",
            "field1": "userId",
            "field2": "id"
        });
        let res_left = run_merge(&left_cfg, input1.clone(), input2.clone()).unwrap();
        assert_eq!(res_left.len(), 3);
        assert_eq!(res_left[2]["name"], "Charlie");
        assert!(res_left[2].get("role").is_none());

        // Keep non-matches
        let non_match_cfg = json!({
            "mode": "combine",
            "combinationMode": "mergeByFields",
            "joinMode": "keepNonMatches",
            "field1": "userId",
            "field2": "id"
        });
        let res_nm = run_merge(&non_match_cfg, input1, input2).unwrap();
        assert_eq!(res_nm.len(), 1);
        assert_eq!(res_nm[0]["name"], "Charlie");
    }

    #[test]
    fn test_merge_multiplex() {
        let input1 = vec![json!({ "color": "red" }), json!({ "color": "blue" })];
        let input2 = vec![json!({ "size": "S" }), json!({ "size": "M" }), json!({ "size": "L" })];

        let cfg = json!({ "mode": "combine", "combinationMode": "multiplex" });
        let res = run_merge(&cfg, input1, input2).unwrap();
        assert_eq!(res.len(), 6);
        assert_eq!(res[0], json!({ "color": "red", "size": "S" }));
        assert_eq!(res[5], json!({ "color": "blue", "size": "L" }));
    }

    #[test]
    fn test_merge_preserves_binary_envelopes() {
        let item1 = json!({
            "json": { "id": 100 },
            "binary": { "report": { "fileName": "report.pdf", "data": "AAAA" } }
        });
        let item2 = json!({
            "json": { "status": "approved" },
            "binary": { "signature": { "fileName": "sign.png", "data": "BBBB" } }
        });

        let merged = merge_items(&item1, &item2);
        assert_eq!(merged["json"]["id"], 100);
        assert_eq!(merged["json"]["status"], "approved");
        assert_eq!(merged["binary"]["report"]["fileName"], "report.pdf");
        assert_eq!(merged["binary"]["signature"]["fileName"], "sign.png");
    }
}
