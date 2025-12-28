from app.database import SessionLocal, Video, Audio
from app.services.processing import process_video, process_audio
from app.services.search import search_service, generate_embedding
from datetime import datetime
import os

def get_db_session():
    return SessionLocal()

def process_video_task(video_id: int):
    """
    Background task to process a video.
    1. Update status to processing
    2. Run CV analysis
    3. Save results to DB
    4. Index for search
    """
    db = get_db_session()
    video = db.query(Video).filter(Video.id == video_id).first()
    
    try:
        if not video:
            return
            
        video.status = "processing"
        db.commit()
        
        # Check if file exists
        if not os.path.exists(video.file_path):
            print(f"Error: File not found: {video.file_path}")
            video.status = "failed - file missing"
            db.commit()
            return

        # 2. Run Analysis
        results = process_video(video.file_path)
        
        # 3. Save to DB
        video.objects_detected = results["objects_detected"]
        video.frame_timestamps = results["frame_timestamps"]
        video.keyframes = results.get("keyframes", [])
        video.summary = results["summary"]
        video.thumbnail_path = results.get("thumbnail_path")
        video.processed_at = results["processed_at"]
        video.status = "completed"
        db.commit()
        
        # 4. Index for search
        # Generate embedding for summary + object labels
        search_text = f"{video.filename} {results['summary']}"
        embedding = generate_embedding(search_text)
        
        search_service.add_item(embedding, {
            "id": video.id,
            "type": "video",
            "filename": video.filename,
            "text": results["summary"]
        })
        
        # 5. Index Detected Objects (Granular Search)
        # Allows direct object searches to get 100% match
        if results.get("objects_detected"):
            unique_objects = set()
            for obj in results["objects_detected"]:
                label = obj.get("label", "").strip().lower()
                if label and label not in unique_objects:
                    unique_objects.add(label)
                    
                    # Embedding for object label
                    obj_emb = generate_embedding(label)
                    
                    search_service.add_item(obj_emb, {
                        "id": f"{video.id}_obj_{label.replace(' ', '_')}", # Unique ID
                        "video_id": video.id,     # Link to parent
                        "type": "video_object",
                        "filename": video.filename,
                        "text": label
                    })
        
    except Exception as e:
        print(f"Error processing video {video_id}: {e}")
        video.status = "failed"
        db.commit()
    finally:
        db.close()

def process_audio_task(audio_id: int):
    """
    Background task to process audio.
    1. Update status to processing
    2. Run Whisper
    3. Save results
    4. Index for search
    """
    db = get_db_session()
    audio = db.query(Audio).filter(Audio.id == audio_id).first()
    
    try:
        if not audio:
            return

        audio.status = "processing"
        db.commit()
        
        # Check if file exists
        if not os.path.exists(audio.file_path):
            print(f"Error: File not found: {audio.file_path}")
            audio.status = "failed - file missing"
            db.commit()
            return

        # 2. Run Analysis
        # Note: process_audio returns dict with transcript
        results = process_audio(audio.file_path)
        
        # 3. Save to DB
        audio.transcript = results["transcript"]
        audio.segments = results["segments"]
        audio.processed_at = results["processed_at"]
        audio.status = "completed"
        db.commit()
        
        # 4. Index for search
        # Generate embedding for transcript
        search_text = f"{audio.filename} {results['transcript']}"
        embedding = generate_embedding(search_text)
        
        search_service.add_item(embedding, {
            "id": audio.id,
            "type": "audio",
            "filename": audio.filename,
            "text": results["transcript"][:200] + "..." # Store snippet
        })

        # 5. Index Segments (Granular Search)
        # Allows searching for specific phrases and getting 100% match
        if results.get("segments"):
            for i, seg in enumerate(results["segments"]):
                seg_text = seg["text"].strip()
                if not seg_text:
                    continue
                    
                # Embedding for segment
                seg_emb = generate_embedding(seg_text)
                
                search_service.add_item(seg_emb, {
                    "id": f"{audio.id}_{i}", # Unique ID for FAISS (string is fine for metadata)
                    "audio_id": audio.id,     # Link to parent
                    "type": "segment",
                    "filename": audio.filename,
                    "text": seg_text
                })
        
    except Exception as e:
        print(f"Error processing audio {audio_id}: {e}")
        audio.status = "failed"
        db.commit()
    finally:
        db.close()
