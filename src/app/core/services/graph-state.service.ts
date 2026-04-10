import { Injectable, signal, computed, inject } from '@angular/core';
import {
  type SimpleNode,
  type Edge,
  NgDiagramModelService,
  NgDiagramViewportService,
  NgDiagramService,
} from 'ng-diagram';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import {
  type ProcessedPlayer,
  type ExpansionCategory,
  type GraphNodeData,
  type GraphEdgeData,
  ALL_CATEGORIES,
} from '../models';
import {
  AUTO_THRESHOLD_TARGET,
  FORCE_SIMULATION_TICKS,
  ZOOM_PADDING,
  ZOOM_PADDING_INITIAL,
} from '../constants';
import { SimilarityService } from './similarity.service';
import { DataLoaderService } from './data-loader.service';

interface SimNode extends SimulationNodeDatum {
  id: string;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  similarityScore: number;
}

/** Undirected edge ID — always sorts node IDs so A→B and B→A produce the same key. */
function edgeKey(idA: string, idB: string, category: ExpansionCategory): string {
  const [first, second] = idA < idB ? [idA, idB] : [idB, idA];
  return `${first}--${second}--${category}`;
}

const NODE_SIZE = 75;

function asData<T>(value: T): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class GraphStateService {
  private readonly similarity = inject(SimilarityService);
  private readonly dataLoader = inject(DataLoaderService);

  private modelService!: NgDiagramModelService;
  private viewportService!: NgDiagramViewportService;
  private diagramService!: NgDiagramService;

  readonly rootPlayer = signal<ProcessedPlayer | null>(null);
  readonly graphNodes = signal<Map<string, GraphNodeData>>(new Map());
  readonly graphEdges = signal<GraphEdgeData[]>([]);
  readonly thresholds = signal<Record<ExpansionCategory, number>>({ att: 0.4, pas: 0.4, def: 0.4 });
  readonly minMinutes = signal(0);
  readonly selectedNodeIds = signal<string[]>([]);
  readonly selectedEdge = signal<GraphEdgeData | null>(null);

  initMinMinutes(): void {
    const players = this.dataLoader.players();
    if (players.length === 0) return;
    const maxMinutes = Math.max(...players.map(p => p.minutesPlayed));
    this.minMinutes.set(Math.min(1000, Math.round(maxMinutes / 2)));
  }

  readonly selectedPlayers = computed(() => {
    const ids = this.selectedNodeIds();
    const nodes = this.graphNodes();
    return ids
      .map(id => nodes.get(id)?.player)
      .filter((p): p is ProcessedPlayer => !!p);
  });

  initializeDiagram(
    modelService: NgDiagramModelService,
    viewportService: NgDiagramViewportService,
    diagramService: NgDiagramService,
  ): void {
    this.modelService = modelService;
    this.viewportService = viewportService;
    this.diagramService = diagramService;
  }

  setRootPlayer(player: ProcessedPlayer): void {
    this.clearCanvas();

    // Compute auto-threshold per dimension
    const autoThresholds = this.computeAutoThresholds(player);
    this.thresholds.set(autoThresholds);

    this.rootPlayer.set(player);

    const nodeData: GraphNodeData = {
      player,
      isRoot: true,
      expandedCategories: new Set(),
    };

    const nodesMap = new Map<string, GraphNodeData>();
    nodesMap.set(player.id, nodeData);
    this.graphNodes.set(nodesMap);

    this.modelService.addNodes([{
      id: player.id,
      position: { x: 0, y: 0 },
      size: { width: NODE_SIZE, height: NODE_SIZE },
      autoSize: false,
      type: 'player',
      data: asData(nodeData),
    }]);

    setTimeout(() => {
      this.viewportService.zoomToFit({ padding: ZOOM_PADDING_INITIAL });
    }, 100);
  }

  private computeAutoThresholds(player: ProcessedPlayer): Record<ExpansionCategory, number> {
    const allPlayers = this.dataLoader.players();
    const candidatePool = allPlayers.filter(p =>
      p.id !== player.id && p.primaryGroup === player.primaryGroup
    );

    const result = {} as Record<ExpansionCategory, number>;

    for (const category of ALL_CATEGORIES) {
      const scores = candidatePool
        .map(p => this.similarity.computeSimilarity(player, p, category))
        .filter(s => s > 0)
        .sort((a, b) => b - a);

      let threshold = 0.99;
      if (scores.length >= AUTO_THRESHOLD_TARGET) {
        threshold = scores[AUTO_THRESHOLD_TARGET - 1];
      } else if (scores.length > 0) {
        threshold = scores[scores.length - 1];
      }

      result[category] = Math.max(0.20, Math.min(0.99, Math.floor(threshold * 100) / 100));
    }

    return result;
  }

  async expandCategory(playerId: string, category: ExpansionCategory): Promise<void> {
    const nodesMap = new Map(this.graphNodes());
    const sourceNodeData = nodesMap.get(playerId);
    if (!sourceNodeData) return;

    // Toggle: if already expanded, collapse
    if (sourceNodeData.expandedCategories.has(category)) {
      this.collapseCategory(playerId, category);
      return;
    }

    const root = this.rootPlayer();
    if (!root) return;

    const targetPlayer = sourceNodeData.player;
    const allPlayers = this.dataLoader.players();
    const candidatePool = allPlayers.filter(p =>
      p.id !== targetPlayer.id && p.primaryGroup === targetPlayer.primaryGroup
    );

    const results = this.similarity.findAboveThreshold(
      targetPlayer, category, candidatePool, this.thresholds()[category]
    );

    sourceNodeData.expandedCategories.add(category);
    nodesMap.set(playerId, { ...sourceNodeData });

    if (results.length === 0) {
      this.graphNodes.set(nodesMap);
      this.modelService.updateNodes([{
        id: playerId,
        data: asData({ ...sourceNodeData }),
      }]);
      return;
    }

    const newNodes: SimpleNode<Record<string, unknown>>[] = [];
    const newEdges: Edge<Record<string, unknown>>[] = [];
    const currentEdges = [...this.graphEdges()];
    const existingEdgeIds = new Set(currentEdges.map(
      e => edgeKey(e.sourcePlayerId, e.targetPlayerId, e.category)
    ));

    for (const result of results) {
      const edgeId = edgeKey(playerId, result.player.id, category);
      if (existingEdgeIds.has(edgeId)) continue;

      const edgeData: GraphEdgeData = {
        sourcePlayerId: playerId,
        targetPlayerId: result.player.id,
        category,
        similarityScore: result.score,
      };
      newEdges.push({
        id: edgeId,
        source: playerId,
        target: result.player.id,
        type: 'similarity',
        sourcePort: 'center',
        targetPort: 'center',
        data: asData(edgeData),
      });
      currentEdges.push(edgeData);
      existingEdgeIds.add(edgeId);

      if (!nodesMap.has(result.player.id)) {
        const newNodeData: GraphNodeData = {
          player: result.player,
          isRoot: false,
          expandedCategories: new Set(),
        };
        nodesMap.set(result.player.id, newNodeData);

        newNodes.push({
          id: result.player.id,
          position: {
            x: (Math.random() - 0.5) * 200,
            y: (Math.random() - 0.5) * 200,
          },
          size: { width: NODE_SIZE, height: NODE_SIZE },
          autoSize: false,
          type: 'player',
          data: asData(newNodeData),
        });
      }
    }

    this.graphNodes.set(nodesMap);
    this.graphEdges.set(currentEdges);

    // Compute layout positions before adding to the model
    const positions = this.computeForceLayout();

    for (const node of newNodes) {
      const pos = positions.get(node.id);
      if (pos) node.position = pos;
    }

    const existingUpdates = this.modelService.nodes()
      .map(n => ({ id: n.id, position: positions.get(n.id) ?? n.position }));

    // Step 1: add and position nodes so they are measured
    await this.diagramService.transaction(
      () => {
        this.modelService.addNodes(newNodes);
        this.modelService.updateNodes(existingUpdates);
      },
      { waitForMeasurements: true },
    );

    // Step 2: add edges now that all nodes are measured and positioned
    await this.diagramService.transaction(
      () => {
        this.modelService.addEdges(newEdges);
      },
      { waitForMeasurements: true },
    );

    this.viewportService.zoomToFit({ padding: ZOOM_PADDING });
  }

  private async collapseCategory(playerId: string, category: ExpansionCategory): Promise<void> {
    const nodesMap = new Map(this.graphNodes());
    const sourceNodeData = nodesMap.get(playerId);
    if (!sourceNodeData) return;

    sourceNodeData.expandedCategories.delete(category);
    nodesMap.set(playerId, { ...sourceNodeData });

    // Remove the direct edges being collapsed
    const remainingEdges = this.graphEdges().filter(
      e => !(e.sourcePlayerId === playerId && e.category === category)
    );

    const edgeIdsToRemove: string[] = [];
    const rootId = this.rootPlayer()?.id;

    for (const e of this.graphEdges()) {
      if (e.sourcePlayerId === playerId && e.category === category) {
        edgeIdsToRemove.push(edgeKey(e.sourcePlayerId, e.targetPlayerId, e.category));
      }
    }

    // Find all nodes reachable from root via remaining edges (undirected BFS)
    const reachable = new Set<string>();
    if (rootId) {
      const adjacency = new Map<string, string[]>();
      for (const e of remainingEdges) {
        let src = adjacency.get(e.sourcePlayerId);
        if (!src) { src = []; adjacency.set(e.sourcePlayerId, src); }
        src.push(e.targetPlayerId);
        let tgt = adjacency.get(e.targetPlayerId);
        if (!tgt) { tgt = []; adjacency.set(e.targetPlayerId, tgt); }
        tgt.push(e.sourcePlayerId);
      }

      reachable.add(rootId);
      const queue = [rootId];
      while (queue.length > 0) {
        const current = queue.pop()!;
        for (const neighbor of adjacency.get(current) ?? []) {
          if (!reachable.has(neighbor)) {
            reachable.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }

    // Remove all unreachable nodes and their edges
    const nodeIdsToRemove = new Set<string>();
    for (const [id] of nodesMap) {
      if (!reachable.has(id)) {
        nodeIdsToRemove.add(id);
        nodesMap.delete(id);
      }
    }

    const finalEdges = remainingEdges.filter(e =>
      !nodeIdsToRemove.has(e.sourcePlayerId) && !nodeIdsToRemove.has(e.targetPlayerId)
    );
    for (const e of remainingEdges) {
      if (nodeIdsToRemove.has(e.sourcePlayerId) || nodeIdsToRemove.has(e.targetPlayerId)) {
        edgeIdsToRemove.push(edgeKey(e.sourcePlayerId, e.targetPlayerId, e.category));
      }
    }

    this.graphNodes.set(nodesMap);
    this.graphEdges.set(finalEdges);

    const nodeIdsArr = [...nodeIdsToRemove];
    await this.diagramService.transaction(
      () => {
        if (edgeIdsToRemove.length > 0) this.modelService.deleteEdges(edgeIdsToRemove);
        if (nodeIdsArr.length > 0) this.modelService.deleteNodes(nodeIdsArr);
      },
      { waitForMeasurements: true },
    );

    if (nodesMap.size > 1) {
      const positions = this.computeForceLayout();
      const updates = this.modelService.nodes()
        .map(n => ({ id: n.id, position: positions.get(n.id) ?? n.position }));
      await this.diagramService.transaction(
        () => {
          this.modelService.updateNodes(updates);
        },
        { waitForMeasurements: true },
      );
      this.viewportService.zoomToFit({ padding: ZOOM_PADDING });
    }
  }

  applyMinMinutesFilter(): void {
    if (!this.modelService) return;
    const min = this.minMinutes();
    const rootId = this.rootPlayer()?.id;
    const nodesMap = new Map(this.graphNodes());

    const nodeIdsToRemove = new Set<string>();
    for (const [id, data] of nodesMap) {
      if (id === rootId) continue;
      if (data.player.minutesPlayed < min) {
        nodeIdsToRemove.add(id);
        nodesMap.delete(id);
      }
    }

    if (nodeIdsToRemove.size === 0) return;

    const edgeIdsToRemove = this.graphEdges()
      .filter(e => nodeIdsToRemove.has(e.sourcePlayerId) || nodeIdsToRemove.has(e.targetPlayerId))
      .map(e => edgeKey(e.sourcePlayerId, e.targetPlayerId, e.category));

    const remainingEdges = this.graphEdges()
      .filter(e => !nodeIdsToRemove.has(e.sourcePlayerId) && !nodeIdsToRemove.has(e.targetPlayerId));

    this.graphNodes.set(nodesMap);
    this.graphEdges.set(remainingEdges);

    this.diagramService.transaction(() => {
      if (edgeIdsToRemove.length > 0) this.modelService.deleteEdges(edgeIdsToRemove);
      if (nodeIdsToRemove.size > 0) this.modelService.deleteNodes([...nodeIdsToRemove]);
    });

    if (nodesMap.size > 1) {
      setTimeout(() => {
        this.viewportService.zoomToFit({ padding: ZOOM_PADDING });
      }, 50);
    }
  }

  selectEdge(edge: GraphEdgeData): void {
    this.selectedNodeIds.set([]);
    this.selectedEdge.set(edge);
  }

  async rebuildDiagram(): Promise<void> {
    const root = this.rootPlayer();
    if (!root) return;

    // Capture which nodes had which categories expanded
    const expansions = new Map<string, Set<ExpansionCategory>>();
    for (const [id, data] of this.graphNodes()) {
      if (data.expandedCategories.size > 0) {
        expansions.set(id, new Set(data.expandedCategories));
      }
    }

    // Collect old model IDs for removal
    const oldNodeIds = this.modelService.nodes().map(n => n.id);
    const oldEdgeIds = this.modelService.edges().map(e => e.id);

    // Build the new graph state from scratch
    const allPlayers = this.dataLoader.players();
    const currentThresholds = this.thresholds();

    const nodesMap = new Map<string, GraphNodeData>();
    const allEdges: GraphEdgeData[] = [];
    const newModelNodes: SimpleNode<Record<string, unknown>>[] = [];
    const newModelEdges: Edge<Record<string, unknown>>[] = [];
    const existingEdgeIds = new Set<string>();

    // Add root node
    const rootNodeData: GraphNodeData = {
      player: root,
      isRoot: true,
      expandedCategories: new Set(expansions.get(root.id) ?? []),
    };
    nodesMap.set(root.id, rootNodeData);

    // Helper to expand a node's categories
    const expandNode = (playerId: string, categories: Set<ExpansionCategory>) => {
      const sourceData = nodesMap.get(playerId);
      if (!sourceData) return;

      for (const category of categories) {
        const targetPlayer = sourceData.player;
        const candidatePool = allPlayers.filter(p =>
          p.id !== targetPlayer.id && p.primaryGroup === targetPlayer.primaryGroup
        );

        const results = this.similarity.findAboveThreshold(
          targetPlayer, category, candidatePool, currentThresholds[category]
        );

        for (const result of results) {
          const edgeId = edgeKey(playerId, result.player.id, category);
          if (existingEdgeIds.has(edgeId)) continue;

          const edgeData: GraphEdgeData = {
            sourcePlayerId: playerId,
            targetPlayerId: result.player.id,
            category,
            similarityScore: result.score,
          };
          newModelEdges.push({
            id: edgeId,
            source: playerId,
            target: result.player.id,
            type: 'similarity',
            sourcePort: 'center',
            targetPort: 'center',
            data: asData(edgeData),
          });
          allEdges.push(edgeData);
          existingEdgeIds.add(edgeId);

          if (!nodesMap.has(result.player.id)) {
            const newNodeData: GraphNodeData = {
              player: result.player,
              isRoot: false,
              expandedCategories: new Set(expansions.get(result.player.id) ?? []),
            };
            nodesMap.set(result.player.id, newNodeData);
          }
        }
      }
    };

    // Expand root categories first
    if (rootNodeData.expandedCategories.size > 0) {
      expandNode(root.id, rootNodeData.expandedCategories);
    }

    // Expand child node categories (only if the node ended up in the graph)
    for (const [playerId, cats] of expansions) {
      if (playerId === root.id) continue;
      if (nodesMap.has(playerId) && cats.size > 0) {
        expandNode(playerId, cats);
      }
    }

    // Remove expansion categories for nodes that didn't make it into the graph
    for (const [id, data] of nodesMap) {
      if (data.expandedCategories.size > 0 && !data.isRoot) {
        // Keep only categories that actually produced edges
        const actualCategories = new Set(
          allEdges.filter(e => e.sourcePlayerId === id).map(e => e.category)
        );
        data.expandedCategories = actualCategories;
      }
    }

    // Build model nodes with positions from force layout
    this.graphNodes.set(nodesMap);
    this.graphEdges.set(allEdges);

    const positions = this.computeForceLayout();

    // Separate nodes into: ones to add (new), ones to update (existed before), ones to remove (gone)
    const oldNodeIdSet = new Set(oldNodeIds);
    const newNodeIdSet = new Set(nodesMap.keys());

    const nodesToAdd: SimpleNode<Record<string, unknown>>[] = [];
    const nodesToUpdate: { id: string; position: { x: number; y: number }; size: { width: number; height: number }; data: Record<string, unknown> }[] = [];
    const nodeIdsToRemove = oldNodeIds.filter(id => !newNodeIdSet.has(id));

    for (const [id, data] of nodesMap) {
      const pos = positions.get(id) ?? { x: 0, y: 0 };

      if (oldNodeIdSet.has(id)) {
        nodesToUpdate.push({
          id,
          position: pos,
          size: { width: NODE_SIZE, height: NODE_SIZE },
          data: asData(data),
        });
      } else {
        nodesToAdd.push({
          id,
          position: pos,
          size: { width: NODE_SIZE, height: NODE_SIZE },
          autoSize: false,
          type: 'player',
          data: asData(data),
        });
      }
    }

    // Separate edges into: add (new), update (existed before), remove (gone)
    const oldEdgeIdSet = new Set(oldEdgeIds);
    const newEdgeIdSet = new Set(newModelEdges.map(e => e.id));
    const edgeIdsToRemove = oldEdgeIds.filter(id => !newEdgeIdSet.has(id));
    const edgesToAdd = newModelEdges.filter(e => !oldEdgeIdSet.has(e.id));
    const edgesToUpdate = newModelEdges
      .filter(e => oldEdgeIdSet.has(e.id))
      .map(e => ({ id: e.id, data: e.data }));

    this.selectedNodeIds.set([]);
    this.selectedEdge.set(null);

    // Step 1: remove old items and add/update nodes
    await this.diagramService.transaction(
      () => {
        this.modelService.deleteEdges(edgeIdsToRemove);
        this.modelService.deleteNodes(nodeIdsToRemove);
        this.modelService.addNodes(nodesToAdd);
        this.modelService.updateNodes(nodesToUpdate);
      },
      { waitForMeasurements: true },
    );

    // Step 2: add/update edges now that nodes are measured
    await this.diagramService.transaction(
      () => {
        this.modelService.addEdges(edgesToAdd);
        this.modelService.updateEdges(edgesToUpdate);
      },
      { waitForMeasurements: true },
    );

    this.viewportService.zoomToFit({ padding: ZOOM_PADDING });
  }

  clearCanvas(): void {
    this.rootPlayer.set(null);
    this.graphNodes.set(new Map());
    this.graphEdges.set([]);
    this.selectedNodeIds.set([]);
    this.selectedEdge.set(null);

    if (this.modelService) {
      const currentNodes = this.modelService.nodes();
      const currentEdges = this.modelService.edges();
      if (currentNodes.length > 0 || currentEdges.length > 0) {
        this.diagramService.transaction(() => {
          this.modelService.deleteEdges(currentEdges.map(e => e.id));
          this.modelService.deleteNodes(currentNodes.map(n => n.id));
        });
      }
    }
  }

  private computeForceLayout(): Map<string, { x: number; y: number }> {
    const nodesMap = this.graphNodes();
    const edges = this.graphEdges();
    const rootId = this.rootPlayer()?.id;

    const nodeRadius = NODE_SIZE / 2 + 16;
    const nodeRadii = new Map<string, number>();
    for (const [id] of nodesMap) {
      nodeRadii.set(id, nodeRadius);
    }

    // Build adjacency for neighbor counting and initial placement
    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
      let src = adjacency.get(e.sourcePlayerId);
      if (!src) { src = []; adjacency.set(e.sourcePlayerId, src); }
      src.push(e.targetPlayerId);
      let tgt = adjacency.get(e.targetPlayerId);
      if (!tgt) { tgt = []; adjacency.set(e.targetPlayerId, tgt); }
      tgt.push(e.sourcePlayerId);
    }

    const neighborCount = new Map<string, number>();
    for (const [id] of nodesMap) {
      neighborCount.set(id, adjacency.get(id)?.length ?? 0);
    }

    // Collect known positions so new nodes can be seeded near their parent
    const modelNodes = this.modelService.nodes();
    const modelNodeMap = new Map(modelNodes.map(n => [n.id, n]));
    const knownPositions = new Map<string, { x: number; y: number }>();
    for (const n of modelNodes) {
      knownPositions.set(n.id, n.position);
    }

    const simNodes: SimNode[] = [];
    for (const [id] of nodesMap) {
      const existing = modelNodeMap.get(id);
      let x: number, y: number;

      if (existing) {
        x = existing.position.x;
        y = existing.position.y;
      } else {
        // Seed new nodes near a connected neighbor that already has a position.
        // This prevents nodes from landing in random spots and crossing edges.
        const neighbors = adjacency.get(id) ?? [];
        const parentId = neighbors.find(nId => knownPositions.has(nId));
        if (parentId) {
          const parentPos = knownPositions.get(parentId)!;
          const angle = Math.random() * Math.PI * 2;
          const dist = nodeRadius * 2.5;
          x = parentPos.x + dist * Math.cos(angle);
          y = parentPos.y + dist * Math.sin(angle);
        } else {
          x = (Math.random() - 0.5) * 300;
          y = (Math.random() - 0.5) * 300;
        }
        knownPositions.set(id, { x, y });
      }

      const node: SimNode = { id, x, y };
      if (id === rootId) {
        node.fx = 0;
        node.fy = 0;
      }
      simNodes.push(node);
    }

    const simLinks: SimLink[] = edges.map(e => ({
      source: e.sourcePlayerId,
      target: e.targetPlayerId,
      similarityScore: e.similarityScore,
    }));

    const COLLISION_PADDING = 20;

    const simulation = forceSimulation<SimNode>(simNodes)
      .force('link', forceLink<SimNode, SimLink>(simLinks)
        .id(d => d.id)
        .distance(d => {
          const sourceId = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
          const targetId = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
          const sourceRadius = nodeRadii.get(sourceId) ?? 50;
          const targetRadius = nodeRadii.get(targetId) ?? 50;
          const minDist = sourceRadius + targetRadius + COLLISION_PADDING;
          const sourceNeighbors = neighborCount.get(sourceId) ?? 1;
          const targetNeighbors = neighborCount.get(targetId) ?? 1;
          const hubSpread = Math.max(sourceNeighbors, targetNeighbors) * 12;
          const similarityFactor = 1.5 - d.similarityScore * 1.4;
          return (minDist + hubSpread) * similarityFactor;
        })
        .strength(0.8))
      .force('charge', forceManyBody<SimNode>().strength(
        d => -(nodeRadii.get(d.id) ?? 50) * 25
      ))
      .force('center', forceCenter(0, 0).strength(0.05))
      .force('collide', forceCollide<SimNode>(d => (nodeRadii.get(d.id) ?? 55) + 5).strength(1));

    simulation.stop();
    for (let i = 0; i < FORCE_SIMULATION_TICKS; i++) {
      simulation.tick();
    }

    const positions = new Map<string, { x: number; y: number }>();
    for (const sn of simNodes) {
      positions.set(sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 });
    }
    return positions;
  }
}
