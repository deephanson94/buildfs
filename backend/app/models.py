from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class VideoBase(BaseModel):
    filename: str

class VideoCreate(VideoBase):
    pass

class VideoResponse(VideoBase):
    id: int
    created_at: datetime
    processed_at: Optional[datetime] = None
    status: str
    objects_detected: List[dict] = []
    keyframes: List[dict] = []
    summary: Optional[str] = None
    thumbnail_path: Optional[str] = None
    file_path: str

    class Config:
        from_attributes = True

class AudioBase(BaseModel):
    filename: str

class AudioCreate(AudioBase):
    pass

class AudioResponse(AudioBase):
    id: int
    created_at: datetime
    processed_at: Optional[datetime] = None
    status: str
    transcript: Optional[str] = None
    segments: List[dict] = []
    file_path: str

    class Config:
        from_attributes = True

class SearchResult(BaseModel):
    id: int
    type: str  # 'video' or 'audio'
    filename: str
    score: float
    preview_text: Optional[str] = None  # Transcript snippet or object summary
    timestamp: Optional[float] = None   # Relevant timestamp
