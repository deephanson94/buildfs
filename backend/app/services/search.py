import faiss
import numpy as np
import os
import pickle
import torch
from sentence_transformers import SentenceTransformer
from typing import List, Dict


# Dimension for all-MiniLM-L6-v2
EMBEDDING_DIM = 384
INDEX_FILE = "data/faiss_index.bin"
METADATA_FILE = "data/faiss_metadata.pkl"


# Initialize global models
device = "cuda" if torch.cuda.is_available() else "cpu"
# Lazy load or load on import? Load on import for simplicity as before
embedding_model = SentenceTransformer('all-MiniLM-L6-v2', device=device)

def generate_embedding(text: str):
    """Generate vector embedding for text."""
    if not text:
        return np.zeros(EMBEDDING_DIM).tolist()
    
    # Encode returns numpy array
    # Normalize embeddings for Cosine Similarity with IndexFlatIP
    embedding = embedding_model.encode(text, normalize_embeddings=True)
    return embedding.tolist()

class SearchService:
    def __init__(self):
        # Use Inner Product (Cosine Similarity for normalized vectors)
        self.index = faiss.IndexFlatIP(EMBEDDING_DIM)
        self.metadata = [] # List of dicts matching index IDs
        self.is_loaded = False
        self.last_load_time = 0
        self._load_index()


    def search(self, embedding: List[float], k: int = 5):
        """
        Search for similar items.
        Returns list of (metadata, score) tuples.
        """
        # Check if index on disk has changed
        if os.path.exists(INDEX_FILE):
            mtime = os.path.getmtime(INDEX_FILE)
            if mtime > self.last_load_time:
                self._load_index()

        # Threshold for Cosine Similarity (0 to 1). 
        # 0.5 implies "somewhat relevant". 1.0 is exact match.
        SEARCH_THRESHOLD = 0.5
        
        if self.index.ntotal == 0:
            return []
            
        vector = np.array([embedding], dtype=np.float32)
        # Faiss IP returns distances (scores) in descending order (highest first)
        sys_scores, indices = self.index.search(vector, k)
        results = []

        for i, idx in enumerate(indices[0]):
            if idx != -1 and idx < len(self.metadata):
                score = float(sys_scores[0][i])
                
                # Filter out irrelevant results (Higher score = Better match)
                if score < SEARCH_THRESHOLD:
                    continue
                    
                results.append({
                    "metadata": self.metadata[idx],
                    "score": score
                })
        
        return results

    def _load_index(self):
        if os.path.exists(INDEX_FILE) and os.path.exists(METADATA_FILE):
            try:
                # Update last load time
                current_mtime = os.path.getmtime(INDEX_FILE)
                self.index = faiss.read_index(INDEX_FILE)
                with open(METADATA_FILE, "rb") as f:
                    self.metadata = pickle.load(f)
                self.is_loaded = True
                self.last_load_time = current_mtime
                print(f"Loaded index with {self.index.ntotal} items.")
            except Exception as e:
                print(f"Error loading index: {e}, starting fresh.")
        else:
            print("No existing index found, starting fresh.")

    def _save_index(self):
        os.makedirs("data", exist_ok=True)
        faiss.write_index(self.index, INDEX_FILE)
        with open(METADATA_FILE, "wb") as f:
            pickle.dump(self.metadata, f)
        # Update timestamp after save
        if os.path.exists(INDEX_FILE):
            self.last_load_time = os.path.getmtime(INDEX_FILE)

    def add_item(self, embedding: List[float], meta: Dict):
        """
        Add an item to the index.
        meta: dict containing {'id': db_id, 'type': 'video'|'audio', 'text': summary/transcript}
        """
        # Ensure we have the latest index from disk before adding
        # This fixes the issue where forked workers have a stale in-memory index
        self._load_index()
        
        vector = np.array([embedding], dtype=np.float32)
        self.index.add(vector)
        self.metadata.append(meta)
        self._save_index()

    def delete_item(self, id: str, type: str):
        """
        Remove an item from the index and metadata.
        """
        # Ensure we have the latest index from disk before deleting
        self._load_index()
        
        # Find index in metadata
        idx_to_remove = -1
        for i, meta in enumerate(self.metadata):
            if str(meta["id"]) == str(id) and meta["type"] == type:
                idx_to_remove = i
                break
        
        if idx_to_remove != -1:
            try:
                # Remove from FAISS index
                # IndexFlat supports remove_ids with sequential IDs
                ids_to_remove = np.array([idx_to_remove], dtype=np.int64)
                self.index.remove_ids(ids_to_remove)
                
                # Remove from metadata
                self.metadata.pop(idx_to_remove)
                
                # Save updates
                self._save_index()
                print(f"Deleted item {id} ({type}) from index.")
                return True
            except Exception as e:
                print(f"Error deleting from index: {e}")
                return False
        else:
            print(f"Item {id} ({type}) not found in index.")
            return False


# Singleton instance
search_service = SearchService()
