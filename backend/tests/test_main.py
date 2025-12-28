import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import sys
import os
import numpy as np

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.services.processing import process_video, process_audio
from app.services.search import SearchService, generate_embedding

client = TestClient(app)

# Mock models and dependencies
@pytest.fixture(autouse=True)
def mock_dependencies(tmp_path):
    # Patch heavy models
    with patch('app.services.processing.whisper_model') as mock_whisper_instance, \
         patch('app.services.processing.cv2') as mock_cv2, \
         patch('app.services.search.embedding_model') as mock_bert_instance, \
         patch('app.services.search.faiss') as mock_faiss:
        
        # Mock Whisper transcribe method
        mock_whisper_instance.transcribe.return_value = {
            "text": "Hello world", 
            "segments": []
        }
        
        # Mock OpenCV Net
        mock_net_instance = MagicMock()
        # Shape: [1, 1, 1, 7]
        mock_detection = np.zeros((1, 1, 1, 7), dtype=np.float32)
        mock_detection[0, 0, 0, 1] = 1.0 # Class 1 (person)
        mock_detection[0, 0, 0, 2] = 0.9 # Confidence
        
        # When forward is called, return this numpy array
        mock_net_instance.forward.return_value = mock_detection
        
        # Setup cv2 mock
        # Code uses readNetFromTensorflow
        mock_cv2.dnn.readNetFromTensorflow.return_value = mock_net_instance
        
        mock_cv2.VideoCapture.return_value.isOpened.side_effect = [True, False]
        # read() returns (ret, frame)
        mock_cv2.VideoCapture.return_value.read.return_value = (True, np.zeros((300, 300, 3), dtype=np.uint8))
        mock_cv2.VideoCapture.return_value.get.return_value = 30.0

        # Mock SentenceTransformer encode method
        mock_bert_instance.encode.return_value = np.zeros(384)
        
        # Setup FAISS mock
        # IndexFlatIP is a class, so return value of the class call is the index instance
        mock_index_instance = MagicMock()
        mock_faiss.IndexFlatIP.return_value = mock_index_instance
        # Default behavior for index
        mock_index_instance.ntotal = 0
        mock_index_instance.search.return_value = (np.array([[]]), np.array([[]]))
        
        yield

@pytest.fixture(scope="module")
def test_db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    # Import models explicitly to ensure they are registered with Base.metadata
    from app.database import Base, get_db
    import app.models as _models  # noqa
    from app.database import Video, Audio
    
    # Use in-memory SQLite for testing with StaticPool to share data across connections
    SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Debug: Check if tables were created
    from sqlalchemy import inspect
    inspector = inspect(engine)
    print(f"DEBUG: Created tables: {inspector.get_table_names()}")
    
    def override_get_db():
        try:
            db = TestingSessionLocal()
            yield db
        finally:
            db.close()
            
    app.dependency_overrides[get_db] = override_get_db
    yield TestingSessionLocal()
    
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(autouse=True)
def mock_search_files(tmp_path):
    # Patch the file paths in search service to use a temp dir
    with patch('app.services.search.INDEX_FILE', str(tmp_path / "index.bin")), \
         patch('app.services.search.METADATA_FILE', str(tmp_path / "meta.pkl")), \
         patch('app.main.UPLOAD_DIR', str(tmp_path / "uploads")):
             
        os.makedirs(str(tmp_path / "uploads"), exist_ok=True)
        yield

def test_health_check(test_db):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_video_processing_logic(test_db):
    """Test video processing logic with mocked OpenCV."""
    # We patch requests to avoid downloading models
    # We also patch file system operations to avoid permission errors with 'data/' dir
    with patch('app.services.processing.requests.get') as mock_get, \
         patch('app.services.processing.os.makedirs') as mock_makedirs, \
         patch('app.services.processing.cv2.imwrite') as mock_imwrite, \
         patch('app.services.processing.os.path.join', side_effect=os.path.join) as mock_join:
        
        mock_get.return_value.content = b""
        with patch('builtins.open', MagicMock()):
            result = process_video("dummy.mp4")
            
            assert result["status"] == "completed"
            assert "objects_detected" in result
            assert len(result["objects_detected"]) > 0
            assert result["objects_detected"][0]["label"] == "person"

def test_audio_processing_logic(test_db):
    """Test audio processing logic with mocked Whisper."""
    result = process_audio("dummy.mp3")
    assert result["status"] == "completed"
    assert result["transcript"] == "Hello world"

def test_search_functionality(test_db):
    """Test separate search service logic."""
    search = SearchService()
    # Reset index safely
    if hasattr(search.index, 'reset'):
        search.index.reset()
    search.metadata = []
    
    # Mock FAISS index behavior
    # ntotal should reflect added item
    # search should return indices and scores
    search.index.ntotal = 1
    # search returns (distances, indices)
    # distance 1.0 (exact match for cosine sim), index 0
    search.index.search.return_value = (np.array([[1.0]], dtype=np.float32), np.array([[0]], dtype=np.int64))
    
    embedding = np.zeros(384).tolist()
    meta = {"id": 1, "type": "video", "filename": "test.mp4", "text": "test"}
    
    search.add_item(embedding, meta)
    
    # Search with same embedding
    results = search.search(embedding)
    assert len(results) > 0
    assert results[0]["metadata"]["filename"] == "test.mp4"

def test_api_upload_video(test_db):
    """Test video upload endpoint."""
    # Mock Redis queue enqueue
    with patch('app.main.q.enqueue') as mock_enqueue:
        # Create dummy file
        files = {'file': ('test.mp4', b'dummy content', 'video/mp4')}
        response = client.post("/process/video", files=files)
        
        assert response.status_code == 200
        json_resp = response.json()
        assert json_resp["filename"] == "test.mp4"
        assert json_resp["status"] == "pending"
        
        # Verify task was enqueued
        mock_enqueue.assert_called_once()

def test_api_search(test_db):
    """Test search endpoint."""
    with patch('app.services.search.search_service.search') as mock_search:
        mock_search.return_value = [
            {"metadata": {"id": 1, "type": "video", "filename": "res.mp4", "text": "got it"}, "score": 0.5}
        ]
        
        response = client.get("/search?query=something")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["filename"] == "res.mp4"

def test_api_get_audio(test_db):
    """Test get audio list endpoint."""
    response = client.get("/transcriptions")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
