from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
import uuid
from redis import Redis
from rq import Queue

from app.database import get_db, engine, Base, Video, Audio
from app.models import VideoResponse, AudioResponse, SearchResult
from app.tasks import process_video_task, process_audio_task
from app.services.search import search_service, generate_embedding

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Unified Search API")

# Helper to ensure directories exist
UPLOAD_DIR = "data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Redis Queue
redis_conn = Redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379'))
q = Queue(connection=redis_conn)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files and thumbnails
app.mount("/data", StaticFiles(directory="data"), name="data")

@app.get("/health", tags=["Health"])
def health_check(response: Response, db: Session = Depends(get_db)):
    """
    Check the health of the API and its dependencies.
    Returns 200 if all dependencies are healthy, 503 otherwise.
    """
    health_results = {
        "database": "unhealthy",
        "redis": "unhealthy",
        "search_service": "unhealthy"
    }
    
    # 1. Database Check
    try:
        db.execute(text("SELECT 1"))
        health_results["database"] = "healthy"
    except Exception as e:
        health_results["database"] = f"unhealthy: {str(e)}"

    # 2. Redis Check
    try:
        if redis_conn.ping():
            health_results["redis"] = "healthy"
    except Exception as e:
        health_results["redis"] = f"unhealthy: {str(e)}"

    # 3. Search Service Check
    if search_service.is_loaded:
        health_results["search_service"] = "healthy"
    else:
        health_results["search_service"] = "unhealthy: index/metadata not loaded"

    # Overall Status
    is_healthy = all(v == "healthy" for v in health_results.values())
    
    if not is_healthy:
        response.status_code = 503
        return {"status": "unhealthy", "components": health_results}
        
    return {"status": "healthy", "components": health_results}

@app.post("/process/video", response_model=VideoResponse, tags=["Processing"], summary="Upload and process video")
def upload_video(file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_id = str(uuid.uuid4())
    ext = file.filename.split('.')[-1]
    file_path = f"{UPLOAD_DIR}/{file_id}.{ext}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    db_video = Video(filename=file.filename, file_path=file_path)
    db.add(db_video)
    db.commit()
    db.refresh(db_video)
    
    # Enqueue task
    q.enqueue(process_video_task, db_video.id)
    
    return db_video

@app.post("/process/audio", response_model=AudioResponse, tags=["Processing"], summary="Upload and process audio")
def upload_audio(file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_id = str(uuid.uuid4())
    ext = file.filename.split('.')[-1]
    file_path = f"{UPLOAD_DIR}/{file_id}.{ext}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    db_audio = Audio(filename=file.filename, file_path=file_path)
    db.add(db_audio)
    db.commit()
    db.refresh(db_audio)
    
    # Enqueue task
    q.enqueue(process_audio_task, db_audio.id)
    
    return db_audio

@app.get("/videos", response_model=List[VideoResponse], tags=["Videos"], summary="List all videos")
def get_videos(db: Session = Depends(get_db)):
    return db.query(Video).all()

@app.get("/transcriptions", response_model=List[AudioResponse], tags=["Audio"], summary="Retrieves all transcriptions from the database")
def get_audios(db: Session = Depends(get_db)):
    return db.query(Audio).all()

@app.get("/videos/{video_id}", response_model=VideoResponse, tags=["Videos"], summary="Get a specific video")
def get_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video

@app.get("/audio/{audio_id}", response_model=AudioResponse, tags=["Audio"], summary="Get a specific audio file")
def get_audio(audio_id: int, db: Session = Depends(get_db)):
    audio = db.query(Audio).filter(Audio.id == audio_id).first()
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
    return audio

@app.get("/search", response_model=List[SearchResult], tags=["Search"], summary="Unified search")
def search(query: str, type: Optional[str] = None):
    """
    Unified search.
    Generates embedding for query and searches FAISS index.
    Filters by type if provided.
    """
    query_embedding = generate_embedding(query)
    results = search_service.search(query_embedding, k=10)
    
    # Process results with segment mapping and deduplication
    dedup_map = {}  # key: (type, id), value: (score, SearchResult)
    
    for res in results:
        meta = res["metadata"]
        res_type = meta["type"]
        
        # Handle Type Filtering
        if type and res_type != type:
            # Allow segments if searching for 'audio'
            if not (type == "audio" and res_type == "segment"):
                # Allow video_objects if searching for 'video'
                if not (type == "video" and res_type == "video_object"):
                    continue

        display_type = res_type
        display_id = meta["id"]
        
        # Mapping Logic: Segment -> Audio, video_object -> Video
        if res_type == "segment":
            display_type = "audio"
            display_id = meta.get("audio_id") # Map to parent audio ID
        elif res_type == "video_object":
            display_type = "video"
            display_id = meta.get("video_id") # Map to parent video ID
        
        result = SearchResult(
            id=display_id,
            type=display_type,
            filename=meta["filename"],
            score=res["score"],
            preview_text=meta["text"][:200]
        )
        
        # Deduplication: keep highest score per (type, id)
        key = (display_type, display_id)
        if key not in dedup_map or res["score"] > dedup_map[key][0]:
            dedup_map[key] = (res["score"], result)
    
    # Extract deduplicated results
    final_response = [result for (score, result) in dedup_map.values()]
    return final_response

@app.get("/search/similar", response_model=List[SearchResult], tags=["Search"], summary="Find similar content")
def search_similar(id: int, type: str, type_filter: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Find content similar to a specific video/audio item.
    Uses the stored text/summary of the source item as the query.
    """
    query_text = ""
    if type == "video":
        item = db.query(Video).filter(Video.id == id).first()
        if item and item.summary:
            # Match the indexing format: "{filename} {summary}"
            query_text = f"{item.filename} {item.summary}"
    elif type == "audio":
        item = db.query(Audio).filter(Audio.id == id).first()
        if item and item.transcript:
            # Match the indexing format: "{filename} {transcript}"
            query_text = f"{item.filename} {item.transcript}"
            
    if not query_text:
        raise HTTPException(status_code=404, detail="Source item not found or has no content to search with")
        
    # Generate embedding for the source content
    query_embedding = generate_embedding(query_text)
    
    # Search
    results = search_service.search(query_embedding, k=10)
    
    # Process results with segment mapping and deduplication
    dedup_map = {}  # key: (type, id), value: (score, SearchResult)
    
    for res in results:
        meta = res["metadata"]
        res_type = meta["type"]
        
        # Handle Type Filtering
        if type_filter and res_type != type_filter:
            # Allow segments if searching for 'audio'
            if not (type_filter == "audio" and res_type == "segment"):
                # Allow video_objects if searching for 'video'
                if not (type_filter == "video" and res_type == "video_object"):
                    continue

        display_type = res_type
        display_id = meta["id"]
        
        # Mapping Logic: Segment -> Audio, video_object -> Video
        if res_type == "segment":
            display_type = "audio"
            display_id = meta.get("audio_id") # Map to parent audio ID
        elif res_type == "video_object":
            display_type = "video"
            display_id = meta.get("video_id") # Map to parent video ID
        
        result = SearchResult(
            id=display_id,
            type=display_type,
            filename=meta["filename"],
            score=res["score"],
            preview_text=meta["text"][:200]
        )
        
        # Deduplication: keep highest score per (type, id)
        key = (display_type, display_id)
        if key not in dedup_map or res["score"] > dedup_map[key][0]:
            dedup_map[key] = (res["score"], result)
    
    # Extract deduplicated results
    final_response = [result for (score, result) in dedup_map.values()]
    return final_response

@app.delete("/videos/{video_id}", tags=["Videos"], summary="Delete a video")
def delete_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
        
    # Delete keyframes folder if exists
    # video.file_path is like data/uploads/xyz.mp4 or data/uploads/filename.mp4
    # Thumbnails are in data/uploads/thumbnails/<filename_without_ext>
    if video.file_path:
        base_name = os.path.basename(video.file_path).split('.')[0]
        thumb_dir = os.path.join("data/uploads/thumbnails", base_name)
        if os.path.exists(thumb_dir):
            shutil.rmtree(thumb_dir)
            
    # Delete file
    if os.path.exists(video.file_path):
        os.remove(video.file_path)
    
    # Delete thumbnail if exists (main thumbnail)
    if video.thumbnail_path and os.path.exists(video.thumbnail_path):
        os.remove(video.thumbnail_path)
        
    # Remove from Search Service
    search_service.delete_item(video.id, "video")
        
    # Delete from DB
    db.delete(video)
    db.commit()
    
    return {"status": "deleted"}

@app.delete("/audio/{audio_id}", tags=["Audio"], summary="Delete an audio file")
def delete_audio(audio_id: int, db: Session = Depends(get_db)):
    audio = db.query(Audio).filter(Audio.id == audio_id).first()
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
        
    # Delete file
    if os.path.exists(audio.file_path):
        os.remove(audio.file_path)
        
    # Remove from Search Service
    search_service.delete_item(audio.id, "audio")
        
    # Delete from DB
    db.delete(audio)
    db.commit()
    
    return {"status": "deleted"}
