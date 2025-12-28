import os
import redis
from rq import Worker, Queue, Connection
from app.database import Base, engine

# Preload models by importing tasks (which imports processing services)
import app.tasks

listen = ['default']

redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')

def main():
    # Ensure DB tables exist (worker might start before API)
    # Removing this to prevent race condition. API logic handles creation.
    # Base.metadata.create_all(bind=engine)
    
    conn = redis.from_url(redis_url)
    with Connection(conn):
        worker = Worker(list(map(Queue, listen)))
        worker.work()

if __name__ == '__main__':
    main()
