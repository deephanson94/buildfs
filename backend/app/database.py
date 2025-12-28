from sqlalchemy import create_engine, Column, Integer, String, Float, JSON, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

# Create database directory if it doesn't exist
os.makedirs("data", exist_ok=True)

SQLALCHEMY_DATABASE_URL = "sqlite:///./data/app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)
    status = Column(String, default="pending")  # pending, processing, completed, failed
    
    # Analysis results
    objects_detected = Column(JSON, default=list)  # List of {label, confidence}
    frame_timestamps = Column(JSON, default=list)  # List of timestamps where objects were found
    keyframes = Column(JSON, default=list)         # List of {timestamp, image_path}
    summary = Column(Text, nullable=True)
    
    # File paths
    file_path = Column(String)
    thumbnail_path = Column(String, nullable=True)

class Audio(Base):
    __tablename__ = "audios"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)
    status = Column(String, default="pending")
    
    # Analysis results
    transcript = Column(Text, nullable=True)
    segments = Column(JSON, default=list)  # List of {start, end, text, confidence}
    
    # File paths
    file_path = Column(String)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
