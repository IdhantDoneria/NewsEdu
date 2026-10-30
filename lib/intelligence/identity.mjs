/**
 * Stable story identity. Stub: replaced by the clustering stream.
 *
 * reconcileClusterIds(newClusters, prevClusters): returns newClusters where a
 * cluster that shares >= 50% of its article ids with a previous cluster
 * inherits that cluster's id (the displaced id is kept in `aliases`).
 * matchFollowedCluster(follow, clusters): find the current cluster for a stored
 * follow `{ clusterId, articleIds }`; null when none.
 */
export function reconcileClusterIds(newClusters, _prevClusters = []) {
  return newClusters;
}

export function matchFollowedCluster(follow, clusters) {
  return clusters.find((c) => c.id === follow?.clusterId) || null;
}
