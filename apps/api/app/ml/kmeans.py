"""K-Means isn't a sklearn object (this deployment's scikit-learn build has
sklearn.cluster blocked by a system policy on the training machine), so
there's no .predict() to load. This module is the shared nearest-centroid
logic used identically by scripts/export_models.py at training time and by
the API at serving time, so the two never drift apart.
"""
import numpy as np


def nearest_cluster(point: list[float], centers: list[list[float]], mu: list[float], sigma: list[float]) -> int:
    x = (np.array(point) - np.array(mu)) / np.array(sigma)
    c = np.array(centers)
    dists = ((c - x) ** 2).sum(axis=1)
    return int(dists.argmin())
