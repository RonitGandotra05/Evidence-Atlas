import type { KnowledgeGraph } from "../types";

export const communityPalette = [
  "#4e79a7",
  "#e4913a",
  "#d76c7a",
  "#65afa6",
  "#76a755",
  "#af85c0",
  "#c18969",
  "#5fadc8",
  "#b3ac4c",
  "#a28faa",
];

export interface Community {
  id: string;
  label: string;
  members: string[];
  color: string;
}

// Local modularity optimization on the simple undirected topology. Parallel
// evidence and opposite-direction predicates must not inflate importance.
// Stable ordering and strict positive gains make this reproducible offline.
export function graphTopology(graph: KnowledgeGraph) {
  const labels = new Map(
    graph.nodes.map((n) => [n.id, n.label.normalize("NFKC").toLowerCase()]),
  );
  const order = (a: string, b: string) =>
    labels.get(a)!.localeCompare(labels.get(b)!) || a.localeCompare(b);
  const ids = graph.nodes.map((n) => n.id).sort(order);
  const neighbors = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const edge of graph.edges) {
    if (
      edge.source === edge.target ||
      !neighbors.has(edge.source) ||
      !neighbors.has(edge.target)
    )
      continue;
    neighbors.get(edge.source)!.add(edge.target);
    neighbors.get(edge.target)!.add(edge.source);
  }
  const degree = new Map(ids.map((id) => [id, neighbors.get(id)!.size]));
  const total = [...degree.values()].reduce((sum, d) => sum + d, 0);
  const membership = new Map(ids.map((id) => [id, id]));
  const weights = new Map(degree);
  if (total)
    for (let pass = 0; pass < 30; pass++) {
      let moved = false;
      for (const id of ids) {
        const d = degree.get(id)!;
        if (!d) continue;
        const current = membership.get(id)!;
        const counts = new Map<string, number>();
        for (const other of neighbors.get(id)!) {
          const group = membership.get(other)!;
          counts.set(group, (counts.get(group) || 0) + 1);
        }
        weights.set(current, weights.get(current)! - d);
        let best = current;
        let score =
          (counts.get(current) || 0) -
          (d * (weights.get(current) || 0)) / total;
        for (const group of [...counts.keys()].sort(order)) {
          const candidate =
            counts.get(group)! - (d * (weights.get(group) || 0)) / total;
          if (candidate > score + 1e-10) {
            best = group;
            score = candidate;
          }
        }
        membership.set(id, best);
        weights.set(best, (weights.get(best) || 0) + d);
        moved ||= best !== current;
      }
      if (!moved) break;
    }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const key = membership.get(id)!;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(id);
  }
  const displayLabels = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const communities: Community[] = [...groups.values()]
    .sort((a, b) => b.length - a.length || order(a[0], b[0]))
    .map((members, index) => {
      const hubs = [...members].sort(
        (a, b) => degree.get(b)! - degree.get(a)! || order(a, b),
      );
      const id = labels.get(members[0])!;
      for (const member of members) membership.set(member, id);
      return {
        id,
        members,
        label: hubs
          .slice(0, 2)
          .map((hub) => displayLabels.get(hub))
          .join(" / "),
        color: communityPalette[index % communityPalette.length],
      };
    });
  return {
    degree,
    membership,
    communities,
    maxDegree: Math.max(1, ...degree.values()),
  };
}

// Fewest connections, ignoring direction. Call with the currently visible
// subgraph so hidden evidence can never silently become part of a route.
export function shortestPath(graph: KnowledgeGraph, from: string, to: string) {
  const adjacency = new Map(
    graph.nodes.map((n) => [n.id, [] as { node: string; edge: string }[]]),
  );
  if (!adjacency.has(from) || !adjacency.has(to)) return null;
  for (const e of graph.edges) {
    if (!adjacency.has(e.source) || !adjacency.has(e.target)) continue;
    adjacency.get(e.source)!.push({ node: e.target, edge: e.id });
    adjacency.get(e.target)!.push({ node: e.source, edge: e.id });
  }
  const previous = new Map<string, { node: string; edge: string }>();
  const seen = new Set([from]),
    queue = [from];
  for (let index = 0; index < queue.length && !seen.has(to); index++) {
    const current = queue[index];
    for (const next of adjacency.get(current)!) {
      if (seen.has(next.node)) continue;
      seen.add(next.node);
      previous.set(next.node, { node: current, edge: next.edge });
      queue.push(next.node);
    }
  }
  if (!seen.has(to)) return null;
  const nodes = [to],
    edges: string[] = [];
  while (nodes[0] !== from) {
    const step = previous.get(nodes[0])!;
    nodes.unshift(step.node);
    edges.unshift(step.edge);
  }
  return { nodes, edges };
}
