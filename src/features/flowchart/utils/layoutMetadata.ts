import { RecordedEvent, FlowConnection, StickyNoteData } from "../../../types";
import { buildNodes } from "../buildNodes";
import { applyAgentParity } from "./agentParity";

export function extractLayoutMetadata(events: RecordedEvent[]) {
  const metaEvent = events.find(e => e.kind === "layout_metadata");
  return {
    positions: (metaEvent?.data?.positions || {}) as Record<string, { x: number; y: number }>,
    connections: (metaEvent?.data?.connections || []) as FlowConnection[],
    notes: (metaEvent?.data?.notes || []) as StickyNoteData[],
    disabledNodeIds: new Set<string>(metaEvent?.data?.disabledNodeIds || [])
  };
}

export interface GraphNodePayload {
  id: string;
  type: string;
  start: number | null;
  end: number | null;
  /** Index of the event holding this node's configuration (condition
   * expression, switch cases, loop iterations...). Ranges may expand for
   * coverage, so data lookups must use this, never `start`. */
  data_idx: number | null;
  sleep_ms?: number;
}

/**
 * Serialize the executable node graph for the Rust graph engine.
 *
 * CRITICAL invariant: every executable event must be covered by exactly one
 * node range — the graph engine only replays events inside node ranges.
 * `buildNodes` leaves some events uncovered (the mouse_move before a click,
 * button/key releases, the event a synthetic delay node points at), so this
 * function expands the ranges until coverage is complete:
 *   - button_release / key_release attach to the PREVIOUS node
 *   - mouse_move (and anything else) attaches to the NEXT node
 *   - delay/wait nodes carry only their sleep (no event range)
 */
export function buildGraphNodesPayload(events: RecordedEvent[], target_app: any): GraphNodePayload[] {
  const nodes = buildNodes(events, target_app);

  const isDelayKind = (t: string) => t === "delay" || t === "wait";
  const ranged = nodes
    .filter(n => n.start != null && n.end != null && !isDelayKind(n.type))
    .map(n => ({ id: n.id, s: n.start as number, e: n.end as number }));

  // Coverage map: event index -> range index.
  const owner: number[] = new Array(events.length).fill(-1);
  ranged.forEach((r, ri) => { for (let i = r.s; i <= r.e; i++) owner[i] = ri; });

  const attachPrev = (idx: number): boolean => {
    for (let ri = ranged.length - 1; ri >= 0; ri--) {
      if (ranged[ri].e < idx) { ranged[ri].e = idx; owner[idx] = ri; return true; }
    }
    return false;
  };
  const attachNext = (idx: number): boolean => {
    for (let ri = 0; ri < ranged.length; ri++) {
      if (ranged[ri].s > idx) { ranged[ri].s = idx; owner[idx] = ri; return true; }
    }
    return false;
  };

  for (let i = 0; i < events.length; i++) {
    if (events[i].kind === "layout_metadata" || owner[i] !== -1) continue;
    const kind = events[i].kind;
    if (kind === "button_release" || kind === "key_release") {
      if (!attachPrev(i)) attachNext(i);
    } else {
      if (!attachNext(i)) attachPrev(i);
    }
  }

  const rangeById = new Map(ranged.map(r => [r.id, r]));

  return nodes.map(n => {
    const out: GraphNodePayload = { id: n.id, type: n.type, start: null, end: null, data_idx: n.eventIndex ?? n.start ?? null };
    if (isDelayKind(n.type)) {
      // Delay/wait nodes only sleep; they own no events.
      if (n.start != null) {
        const ev = events[n.start];
        if (ev) {
          if (ev.kind === "delay" || ev.kind === "wait") {
            out.sleep_ms = Math.round((Number(ev.data?.seconds) || 1) * 1000);
          } else {
            // Synthetic delay node: its sleep is the gap to the previous event.
            let prev: RecordedEvent | null = null;
            for (let i = n.start - 1; i >= 0; i--) {
              if (events[i].kind !== "layout_metadata") { prev = events[i]; break; }
            }
            const gap = prev ? ev.at_ms - prev.at_ms : 0;
            out.sleep_ms = Math.min(Math.max(gap, 0), 5000);
          }
        }
      }
      return out;
    }
    const r = rangeById.get(n.id);
    if (r) {
      out.start = r.s;
      out.end = r.e;
    } else if (n.start != null && n.end != null) {
      out.start = n.start;
      out.end = n.end;
    }
    return out;
  });
}

/**
 * Make sure the `layout_metadata` event carries an up-to-date `graphNodes`
 * payload. Used as the single choke point before persisting automations so
 * the graph engine always sees ranges consistent with the saved events.
 */
export function withGraphMetadata(events: RecordedEvent[], target_app: any): RecordedEvent[] {
  // The agent node is normalised here — the one place every save goes through —
  // so a flow written against the old palette still executes with the agent
  // runner instead of being attempted as an HTTP call. See `agentParity`.
  const normalised = applyAgentParity(events);
  const graphNodes = buildGraphNodesPayload(normalised, target_app);
  const idx = normalised.findIndex(e => e.kind === "layout_metadata");
  if (idx < 0) {
    return [
      ...normalised,
      {
        kind: "layout_metadata",
        at_ms: 99999999,
        data: { positions: {}, connections: [], notes: [], disabledNodeIds: [], graphNodes },
      } as any,
    ];
  }
  const copy = [...normalised];
  copy[idx] = { ...copy[idx], data: { ...copy[idx].data, graphNodes } };
  return copy;
}

/**
 * Build the events array to persist after a layout/edit change. The event
 * order and timestamps are preserved (the graph engine walks nodes via the
 * serialized `graphNodes` + connections, so no re-flattening is needed and
 * recorded timings stay intact).
 */
export function buildUpdatedMetadataEvents(
  events: RecordedEvent[],
  target_app: any,
  pos: any,
  conns: any,
  noteList: any,
  disabled: Set<string>
): RecordedEvent[] {
  const updatedEvs = [...events];
  const metaData = {
    connections: conns,
    positions: pos,
    notes: noteList,
    disabledNodeIds: Array.from(disabled),
    graphNodes: buildGraphNodesPayload(updatedEvs, target_app),
  };
  const layoutIdx = updatedEvs.findIndex(e => e.kind === "layout_metadata");
  if (layoutIdx >= 0) {
    updatedEvs[layoutIdx] = {
      ...updatedEvs[layoutIdx],
      data: metaData
    };
  } else {
    updatedEvs.push({
      at_ms: 99999999,
      kind: "layout_metadata",
      data: metaData
    });
  }
  return updatedEvs;
}
