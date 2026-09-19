import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExpressionPreviewResponse } from "../types";

interface UseRustExpressionEvaluatorProps {
  expression: string;
  itemData: unknown;
  debounceMs?: number;
}

export function useRustExpressionEvaluator({
  expression,
  itemData,
  debounceMs = 250,
}: UseRustExpressionEvaluatorProps) {
  const [evaluation, setEvaluation] = useState<ExpressionPreviewResponse | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Only evaluate if string contains {{ ... }}
    if (!expression || !expression.includes("{{")) {
      setEvaluation(null);
      setIsEvaluating(false);
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setIsEvaluating(true);

    timerRef.current = window.setTimeout(async () => {
      try {
        const res = await invoke<ExpressionPreviewResponse>("evaluate_expression_preview", {
          expression,
          context: {
            item: itemData ?? null,
            variables: {},
            node_outputs: {},
            credential: null,
          },
        });
        setEvaluation(res);
      } catch (err) {
        setEvaluation({
          result: null,
          is_valid: false,
          error: String(err),
        });
      } finally {
        setIsEvaluating(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [expression, itemData, debounceMs]);

  return {
    evaluation,
    isEvaluating,
    hasExpression: !!expression && expression.includes("{{"),
  };
}
