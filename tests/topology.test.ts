import { describe, it, expect } from "vitest";
import { graphTopology, shortestPath } from "../src/graph/topology";
import { appearanceSettings } from "../src/graph/settings";
import { jsonExport, importAnalysis } from "../src/graph/export";
import { demoAnalysis } from "../src/ui/demo";
import type { KnowledgeGraph } from "../src/types";

const graph = (
  pairs: string[][],
  ids = ["a", "b", "c", "d", "e", "f", "isolated"],
): KnowledgeGraph => ({
  nodes: ids.map((id) => ({ id, label: id, type: "Concept", aliases: [] })),
  edges: pairs.map(([source, target], i) => ({
    id: `e${i}`,
    source,
    target,
    relationship: "connects",
    confidence: 1,
    evidence: "",
    passageId: "",
    page: null,
    section: "",
    kind: "stated",
    explanation: "",
  })),
});

describe("offline graph exploration", () => {
  it("finds stable structural groups without weighting repeated evidence or invalid endpoints", () => {
    const input = graph([
      ["a", "b"],
      ["b", "c"],
      ["c", "a"],
      ["d", "e"],
      ["e", "f"],
      ["f", "d"],
      ["c", "d"],
    ]);
    const original = structuredClone(input);
    const result = graphTopology(input);
    expect(result.communities.map((c) => c.members)).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["isolated"],
    ]);
    const reordered = graphTopology({
      nodes: [...input.nodes].reverse(),
      edges: [
        ...input.edges,
        input.edges[0],
        { ...input.edges[0], source: "b", target: "a" },
        { ...input.edges[0], target: "missing" },
      ].reverse(),
    });
    expect(reordered.communities).toEqual(result.communities);
    expect(result.degree.get("a")).toBe(2);
    expect(result.degree.get("isolated")).toBe(0);
    const remapped = graphTopology({
      nodes: input.nodes.map((n, index) => ({ ...n, id: `restored-${index}` })),
      edges: input.edges.map((e) => ({
        ...e,
        source: `restored-${input.nodes.findIndex((n) => n.id === e.source)}`,
        target: `restored-${input.nodes.findIndex((n) => n.id === e.target)}`,
      })),
    });
    expect(
      remapped.communities.map((c) => ({
        id: c.id,
        label: c.label,
        color: c.color,
      })),
    ).toEqual(
      result.communities.map((c) => ({
        id: c.id,
        label: c.label,
        color: c.color,
      })),
    );
    expect(input).toEqual(original);
    expect(graphTopology(graph([], [])).communities).toEqual([]);
  });
  it("finds the shortest visible route in either direction and reports disconnected concepts", () => {
    const input = graph([
      ["a", "b"],
      ["b", "c"],
      ["c", "d"],
      ["a", "d"],
    ]);
    expect(shortestPath(input, "d", "a")).toEqual({
      nodes: ["d", "a"],
      edges: ["e3"],
    });
    expect(
      shortestPath({ ...input, edges: input.edges.slice(0, 3) }, "d", "a")
        ?.edges,
    ).toEqual(["e2", "e1", "e0"]);
    expect(shortestPath(input, "a", "isolated")).toBeNull();
    expect(shortestPath(input, "a", "unknown")).toBeNull();
    expect(shortestPath(input, "a", "a")).toEqual({ nodes: ["a"], edges: [] });
  });
  it("normalizes legacy and untrusted options and preserves explorer settings through JSON", () => {
    expect(appearanceSettings({ showEdgeLabels: false }).edgeLabelMode).toBe(
      "none",
    );
    const invalid = appearanceSettings({
      colorBy: "<script>" as any,
      edgeLabelMode: "bad" as any,
      hiddenCommunities: [1, "n1"] as any,
      controlsExpanded: "true" as any,
    });
    expect(invalid.colorBy).toBe("individual");
    expect(invalid.edgeLabelMode).toBe("all");
    expect(invalid.hiddenCommunities).toEqual(["n1"]);
    expect(invalid.controlsExpanded).toBe(false);
    const a = demoAnalysis();
    Object.assign(a.settings, {
      nodeShape: "dot",
      colorBy: "community",
      edgeLabelMode: "selection",
      controlsExpanded: true,
      showInferred: false,
    });
    expect(importAnalysis(jsonExport(a)).settings).toMatchObject({
      nodeShape: "dot",
      colorBy: "community",
      edgeLabelMode: "selection",
      controlsExpanded: true,
      showInferred: false,
    });
  });
});
