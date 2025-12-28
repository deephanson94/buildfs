# Unified Media Search

Full-stack application for searching content within video and audio files using text queries or similarity search.

> **Note**: This repo is tested and runs well in WSL2.

## Tech Stack
- **Backend**: Python, FastAPI, SQLite, SQLAlchemy, Redis, RQ
- **Processing**: OpenCV (MobileNet SSD), OpenAI Whisper, SentenceTransformers, FAISS
- **Frontend**: React, Vite, TailwindCSS
- **Infrastructure**: Docker, Docker Compose

## Features
- **Video Processing**: Keyframe extraction, Object Detection, Summarization.
- **Audio Processing**: Transcription (Whisper).
- **Unified Search**: Search across transcripts and visual contents using vector similarity (FAISS).

## Setup & Running

### Prerequisites
- Docker & Docker Compose

### Run Implementation
1. Clone repository.
2. Run `docker-compose up --build`.
3. Access Frontend at `http://localhost:8080` (or `http://localhost:5173` if running dev).
4. Access API Docs at `http://localhost:8000/docs`.

## Testing

### Backend Tests
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pytest
```
*Note: Tests mock heavy models (Whisper/CV) for speed.*

### Frontend Tests
```bash
cd frontend
npm install
npm test
```

## API Endpoints

### Health
- `GET /health`: Check API and dependency status.

### Processing
- `POST /process/video`: Upload and process a video file.
- `POST /process/audio`: Upload and process an audio file.

### Videos
- `GET /videos`: List all videos.
- `GET /videos/{id}`: Get a specific video.
- `DELETE /videos/{id}`: Delete a video.

### Audio
- `GET /transcriptions`: List all audio transcriptions.
- `GET /audio/{id}`: Get a specific audio file.
- `DELETE /audio/{id}`: Delete an audio file.

### Search
- `GET /search?query=...`: Unified text search across all media.
- `GET /search/similar?id=...&type=...`: Find content similar to a specific item.
