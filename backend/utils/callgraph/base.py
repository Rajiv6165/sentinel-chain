import networkx as nx
from abc import ABC, abstractmethod

class CallGraphBuilder(ABC):
    @abstractmethod
    def build(self, project_dir: str) -> tuple[nx.DiGraph, list[str]]:
        """
        Builds a call graph for a given project directory.
        Returns the graph and a list of entry point node IDs.
        """
        pass
