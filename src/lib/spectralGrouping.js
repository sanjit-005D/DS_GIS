const EPS = 1e-9

function l2norm(vec) {
  let sum = 0
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i]
  return Math.sqrt(sum)
}

function dot(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function mulXtXv(X, v) {
  const n = X.length
  const m = v.length
  const xv = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let s = 0
    const row = X[i]
    for (let j = 0; j < m; j++) s += row[j] * v[j]
    xv[i] = s
  }
  const out = new Array(m).fill(0)
  for (let j = 0; j < m; j++) {
    let s = 0
    for (let i = 0; i < n; i++) s += X[i][j] * xv[i]
    out[j] = s / Math.max(1, n - 1)
  }
  return out
}

function standardizeMatrix(matrix) {
  const n = matrix.length
  if (!n) return { X: [], means: [], stds: [] }
  const m = matrix[0].length
  const means = new Array(m).fill(0)
  const stds = new Array(m).fill(1)

  for (let j = 0; j < m; j++) {
    let s = 0
    for (let i = 0; i < n; i++) s += matrix[i][j]
    means[j] = s / n
  }

  for (let j = 0; j < m; j++) {
    let s = 0
    for (let i = 0; i < n; i++) {
      const d = matrix[i][j] - means[j]
      s += d * d
    }
    stds[j] = Math.sqrt(s / Math.max(1, n - 1))
    if (!Number.isFinite(stds[j]) || stds[j] < EPS) stds[j] = 1
  }

  const X = new Array(n)
  for (let i = 0; i < n; i++) {
    const row = new Array(m)
    for (let j = 0; j < m; j++) row[j] = (matrix[i][j] - means[j]) / stds[j]
    X[i] = row
  }

  return { X, means, stds }
}

function topPCs(X, numComponents = 2, maxIter = 120) {
  const n = X.length
  const m = n ? X[0].length : 0
  const k = Math.max(1, Math.min(Number(numComponents) || 2, m))
  const components = []
  const eigenvalues = []

  for (let c = 0; c < k; c++) {
    let v = new Array(m).fill(0).map((_, idx) => 1 / (idx + 1))
    let norm = l2norm(v)
    if (norm < EPS) v[0] = 1
    else for (let j = 0; j < m; j++) v[j] /= norm

    for (let it = 0; it < maxIter; it++) {
      let w = mulXtXv(X, v)

      for (let p = 0; p < components.length; p++) {
        const u = components[p]
        const proj = dot(w, u)
        for (let j = 0; j < m; j++) w[j] -= proj * u[j]
      }

      norm = l2norm(w)
      if (norm < EPS) break
      for (let j = 0; j < m; j++) v[j] = w[j] / norm
    }

    const Av = mulXtXv(X, v)
    const lambda = Math.max(0, dot(v, Av))
    components.push(v.slice())
    eigenvalues.push(lambda)
  }

  return { components, eigenvalues }
}

function projectScores(X, components) {
  const n = X.length
  const k = components.length
  const scores = new Array(n)
  for (let i = 0; i < n; i++) {
    const row = X[i]
    const s = new Array(k).fill(0)
    for (let c = 0; c < k; c++) {
      s[c] = dot(row, components[c])
    }
    scores[i] = s
  }
  return scores
}

function pointDistance(a, b, metric = 'euclidean') {
  if (metric === 'manhattan') {
    let d = 0
    for (let i = 0; i < a.length; i++) d += Math.abs((a[i] || 0) - (b[i] || 0))
    return d
  }
  let d = 0
  for (let i = 0; i < a.length; i++) {
    const dv = (a[i] || 0) - (b[i] || 0)
    d += dv * dv
  }
  return Math.sqrt(d)
}

function averageLinkDistance(points, membersA, membersB) {
  let sum = 0
  let count = 0
  for (let i = 0; i < membersA.length; i++) {
    const ai = membersA[i]
    for (let j = 0; j < membersB.length; j++) {
      const bj = membersB[j]
      sum += pointDistance(points[ai], points[bj], 'euclidean')
      count += 1
    }
  }
  return count ? (sum / count) : 0
}

function buildHierarchicalDendrogram(ids, points, maxLeaves = 64) {
  const n = Array.isArray(points) ? points.length : 0
  if (!n || !Array.isArray(ids) || ids.length !== n) return { ids: [], merges: [] }

  const capped = Math.max(8, Math.min(Number(maxLeaves) || 64, n))
  const step = Math.max(1, Math.ceil(n / capped))
  const keepIdx = []
  for (let i = 0; i < n; i += step) keepIdx.push(i)
  if (keepIdx[keepIdx.length - 1] !== n - 1) keepIdx.push(n - 1)

  const localIds = keepIdx.map(i => String(ids[i]))
  const localPoints = keepIdx.map(i => points[i])
  const k = localPoints.length
  if (k <= 1) return { ids: localIds, merges: [] }

  let nextId = k
  const merges = []
  let active = new Array(k).fill(0).map((_, idx) => ({ id: idx, members: [idx], size: 1 }))

  while (active.length > 1) {
    let bestI = 0
    let bestJ = 1
    let bestD = Infinity
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const d = averageLinkDistance(localPoints, active[i].members, active[j].members)
        if (d < bestD) {
          bestD = d
          bestI = i
          bestJ = j
        }
      }
    }

    const left = active[bestI]
    const right = active[bestJ]
    const merged = {
      id: nextId,
      members: left.members.concat(right.members),
      size: left.size + right.size
    }
    merges.push({ id: nextId, left: left.id, right: right.id, height: Number.isFinite(bestD) ? bestD : 0, size: merged.size })
    nextId += 1

    const next = []
    for (let i = 0; i < active.length; i++) {
      if (i !== bestI && i !== bestJ) next.push(active[i])
    }
    next.push(merged)
    active = next
  }

  return { ids: localIds, merges }
}

function initCentroids(points, kk, init = 'spread', seed = 42) {
  const n = points.length
  if (!n) return []
  const rng = makeRng(seed)
  if (init === 'kmeans++') {
    const chosen = [Math.max(0, Math.min(n - 1, Math.floor(rng() * n)))]
    while (chosen.length < kk) {
      let bestIdx = -1
      let bestScore = -Infinity
      for (let i = 0; i < n; i++) {
        if (chosen.includes(i)) continue
        let minDist = Infinity
        for (const cidx of chosen) {
          const d = pointDistance(points[i], points[cidx], 'euclidean')
          if (d < minDist) minDist = d
        }
        if (minDist > bestScore) {
          bestScore = minDist
          bestIdx = i
        }
      }
      if (bestIdx < 0) break
      chosen.push(bestIdx)
    }
    return chosen.map(idx => points[idx].slice())
  }

  const centroids = []
  const step = Math.max(1, Math.floor(n / kk))
  for (let i = 0; i < kk; i++) {
    const offset = Math.floor(rng() * Math.max(1, step))
    const idx = Math.min(n - 1, i * step + offset)
    centroids.push(points[idx].slice())
  }
  return centroids
}

function kmeans(points, k = 3, maxIter = 40, options = {}) {
  const n = points.length
  if (!n) return { labels: [], centroids: [] }
  const dim = points[0].length
  const kk = Math.max(2, Math.min(k, n))
  const metric = options.distance === 'manhattan' ? 'manhattan' : 'euclidean'
  const init = options.init === 'kmeans++' ? 'kmeans++' : 'spread'
  const seed = Number(options.seed) || 42

  const centroids = initCentroids(points, kk, init, seed)

  const labels = new Array(n).fill(0)
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false

    for (let i = 0; i < n; i++) {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < kk; c++) {
        const d = pointDistance(points[i], centroids[c], metric)
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
      if (labels[i] !== best) {
        labels[i] = best
        changed = true
      }
    }

    const sums = new Array(kk).fill(0).map(() => new Array(dim).fill(0))
    const counts = new Array(kk).fill(0)
    for (let i = 0; i < n; i++) {
      const c = labels[i]
      counts[c] += 1
      for (let j = 0; j < dim; j++) sums[c][j] += points[i][j]
    }

    for (let c = 0; c < kk; c++) {
      if (counts[c] === 0) continue
      for (let j = 0; j < dim; j++) centroids[c][j] = sums[c][j] / counts[c]
    }

    if (!changed) break
  }

  let compactness = 0
  for (let i = 0; i < n; i++) {
    const c = labels[i] ?? 0
    const d = pointDistance(points[i], centroids[c], metric)
    compactness += d * d
  }

  return { labels, centroids, compactness }
}

export function computePCAGrouping({ ids, matrix, components = 2, groups = 3, seed = 42 }) {
  if (!Array.isArray(ids) || !Array.isArray(matrix) || ids.length !== matrix.length || ids.length === 0) {
    return { groupAssignments: {}, explainedVariance: [], groups: [], scatterPoints: [] }
  }

  const { X } = standardizeMatrix(matrix)
  const compCount = Math.max(2, Math.min(Number(components) || 2, X[0]?.length || 2))
  const { components: pcs, eigenvalues } = topPCs(X, compCount)
  const scores = projectScores(X, pcs)

  const totalEigen = eigenvalues.reduce((a, b) => a + b, 0) || 1
  const explainedVariance = eigenvalues.map(v => (v / totalEigen) * 100)

  const dims = Math.min(2, scores[0]?.length || 1)
  const points = scores.map(s => s.slice(0, dims))
  const { labels, compactness } = kmeans(points, Math.max(2, Number(groups) || 3), 40, { seed, init: 'spread', distance: 'euclidean' })

  const groupAssignments = {}
  const counts = {}
  for (let i = 0; i < ids.length; i++) {
    const gid = labels[i] ?? 0
    const sid = String(ids[i])
    groupAssignments[sid] = gid
    counts[gid] = (counts[gid] || 0) + 1
  }

  const groupsSummary = Object.keys(counts)
    .map(k => Number(k))
    .sort((a, b) => a - b)
    .map(gid => ({ id: gid, count: counts[gid] }))

  return {
    groupAssignments,
    explainedVariance,
    groups: groupsSummary,
    scoreDims: dims,
    compactness,
    scatterPoints: ids.map((sid, i) => ({
      id: String(sid),
      x: Number(points[i]?.[0]) || 0,
      y: Number(points[i]?.[1]) || 0
    }))
  }
}

export function computeClusteringGrouping({ ids, matrix, groups = 3, distance = 'euclidean', init = 'spread', seed = 42 }) {
  if (!Array.isArray(ids) || !Array.isArray(matrix) || ids.length !== matrix.length || ids.length === 0) {
    return { groupAssignments: {}, explainedVariance: [], groups: [], compactness: null, dendrogram: { ids: [], merges: [] } }
  }

  const { X } = standardizeMatrix(matrix)
  const dims = X[0]?.length || 0
  if (!dims) return { groupAssignments: {}, explainedVariance: [], groups: [], compactness: null, dendrogram: { ids: [], merges: [] } }

  const { labels, compactness } = kmeans(X, Math.max(2, Number(groups) || 3), 40, { distance, init, seed })
  const groupAssignments = {}
  const counts = {}
  for (let i = 0; i < ids.length; i++) {
    const gid = labels[i] ?? 0
    const sid = String(ids[i])
    groupAssignments[sid] = gid
    counts[gid] = (counts[gid] || 0) + 1
  }

  const groupsSummary = Object.keys(counts)
    .map(k => Number(k))
    .sort((a, b) => a - b)
    .map(gid => ({ id: gid, count: counts[gid] }))

  return {
    groupAssignments,
    explainedVariance: [],
    groups: groupsSummary,
    scoreDims: dims,
    compactness,
    dendrogram: buildHierarchicalDendrogram(ids, X)
  }
}

function makeRng(seed = 42) {
  let s = (Number(seed) || 42) >>> 0
  return () => {
    s = (1664525 * s + 1013904223) >>> 0
    return s / 4294967296
  }
}

function pickRandomFeature(rng, m) {
  if (m <= 1) return 0
  return Math.max(0, Math.min(m - 1, Math.floor(rng() * m)))
}

function median(values) {
  if (!values.length) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? 0.5 * (sorted[mid - 1] + sorted[mid]) : sorted[mid]
}

function buildForestEmbedding(X, trees = 32, depth = 4, seed = 42) {
  const n = X.length
  const m = X[0]?.length || 0
  if (!n || !m) return []
  const tt = Math.max(8, Math.min(128, Number(trees) || 32))
  const dd = Math.max(2, Math.min(8, Number(depth) || 4))
  const rng = makeRng(seed)

  const embedding = new Array(n)
  for (let i = 0; i < n; i++) embedding[i] = new Array(tt).fill(0)

  for (let t = 0; t < tt; t++) {
    const splitFeature = new Array(dd)
    const splitThreshold = new Array(dd)
    for (let d = 0; d < dd; d++) {
      const f = pickRandomFeature(rng, m)
      splitFeature[d] = f
      const colVals = new Array(n)
      for (let i = 0; i < n; i++) colVals[i] = Number(X[i][f]) || 0
      const jitter = (rng() - 0.5) * 0.03
      splitThreshold[d] = median(colVals) + jitter
    }

    for (let i = 0; i < n; i++) {
      let leaf = 0
      for (let d = 0; d < dd; d++) {
        const f = splitFeature[d]
        const thr = splitThreshold[d]
        const v = Number(X[i][f]) || 0
        leaf = (leaf << 1) | (v >= thr ? 1 : 0)
      }
      embedding[i][t] = leaf / Math.max(1, (1 << dd) - 1)
    }
  }

  return embedding
}

export function computeRFGrouping({ ids, matrix, groups = 3, trees = 32, depth = 4, seed = 42 }) {
  if (!Array.isArray(ids) || !Array.isArray(matrix) || ids.length !== matrix.length || ids.length === 0) {
    return { groupAssignments: {}, explainedVariance: [], groups: [], compactness: null, dendrogram: { ids: [], merges: [] } }
  }

  const { X } = standardizeMatrix(matrix)
  const emb = buildForestEmbedding(X, trees, depth, seed)
  if (!emb.length) return { groupAssignments: {}, explainedVariance: [], groups: [], compactness: null, dendrogram: { ids: [], merges: [] } }

  const { X: embStd } = standardizeMatrix(emb)
  const { labels, compactness } = kmeans(embStd, Math.max(2, Number(groups) || 3), 40, { distance: 'euclidean', init: 'kmeans++', seed })

  const groupAssignments = {}
  const counts = {}
  for (let i = 0; i < ids.length; i++) {
    const gid = labels[i] ?? 0
    const sid = String(ids[i])
    groupAssignments[sid] = gid
    counts[gid] = (counts[gid] || 0) + 1
  }

  const groupsSummary = Object.keys(counts)
    .map(k => Number(k))
    .sort((a, b) => a - b)
    .map(gid => ({ id: gid, count: counts[gid] }))

  return {
    groupAssignments,
    explainedVariance: [],
    groups: groupsSummary,
    compactness,
    scoreDims: embStd[0]?.length || 0,
    dendrogram: buildHierarchicalDendrogram(ids, embStd)
  }
}

export function compareGroupingMethods({ ids, matrix, groups = 3, pcaComponents = 2, clusteringDistance = 'euclidean', clusteringInit = 'spread', rfTrees = 32, rfDepth = 4, seed = 42 }) {
  if (!Array.isArray(ids) || !Array.isArray(matrix) || ids.length !== matrix.length || ids.length === 0) {
    return { bestMethod: null, methods: [] }
  }

  const pca = computePCAGrouping({ ids, matrix, components: pcaComponents, groups, seed })
  const clustering = computeClusteringGrouping({ ids, matrix, groups, distance: clusteringDistance, init: clusteringInit, seed })
  const rf = computeRFGrouping({ ids, matrix, groups, trees: rfTrees, depth: rfDepth, seed })

  const pcaScore = Number.isFinite(pca.compactness) ? pca.compactness : Infinity
  const clusteringScore = Number.isFinite(clustering.compactness) ? clustering.compactness : Infinity
  const rfScore = Number.isFinite(rf.compactness) ? rf.compactness : Infinity

  const methods = [
    {
      id: 'pca',
      label: 'PCA',
      compactness: pca.compactness ?? null,
      groupCount: pca.groups?.length || 0,
      explainedVariance: pca.explainedVariance || [],
      score: Number.isFinite(pcaScore) ? pcaScore : null
    },
    {
      id: 'clustering',
      label: 'Clustering',
      compactness: clustering.compactness ?? null,
      groupCount: clustering.groups?.length || 0,
      score: Number.isFinite(clusteringScore) ? clusteringScore : null
    },
    {
      id: 'rf',
      label: 'Random Forest',
      compactness: rf.compactness ?? null,
      groupCount: rf.groups?.length || 0,
      score: Number.isFinite(rfScore) ? rfScore : null
    }
  ]

  const ranked = methods
    .filter(m => Number.isFinite(m.score))
    .sort((a, b) => a.score - b.score)

  return {
    bestMethod: ranked[0]?.id || null,
    methods,
    results: { pca, clustering, rf }
  }
}
