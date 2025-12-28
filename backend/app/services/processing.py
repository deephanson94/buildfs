import cv2
import numpy as np
import whisper
import moviepy.editor as mp
import torch
import os
import requests
from PIL import Image
from datetime import datetime

# Global variable for lazy loading
whisper_model = None

# SSD MobileNet V3 COCO (80 Classes) constants
MODEL_URL = "http://download.tensorflow.org/models/object_detection/ssd_mobilenet_v3_large_coco_2020_01_14.tar.gz"
CONFIG_URL = "https://gist.githubusercontent.com/dkurt/54a8e8b51beb3bd3f770b79e56927bd7/raw/2a20064a9d33b893dd95d2567da126d0ecd03e85/ssd_mobilenet_v3_large_coco_2020_01_14.pbtxt"

CLASSES = [
    "person", "bicycle", "car", "motorbike", "aeroplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake",
    "chair", "sofa", "pottedplant", "bed", "diningtable", "toilet", "tvmonitor", "laptop",
    "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
]

def get_mobilenet_files():
    """Download SSD MobileNet V3 files if they don't exist."""
    os.makedirs("models", exist_ok=True)
    
    # Paths for V3
    config_path = "models/ssd_mobilenet_v3_large_coco_2020_01_14.pbtxt"
    weights_path = "models/frozen_inference_graph.pb"
    
    # Download Config (pbtxt)
    if not os.path.exists(config_path):
        print(f"Downloading {config_path}...")
        try:
            r = requests.get(CONFIG_URL)
            r.raise_for_status()
            with open(config_path, "wb") as f:
                f.write(r.content)
        except Exception as e:
            print(f"Error downloading config: {e}")

    # Download Weights (tar.gz -> extract frozen_inference_graph.pb)
    if not os.path.exists(weights_path):
        print(f"Downloading model tarball...")
        import tarfile
        
        tar_path = "models/model.tar.gz"
        try:
            r = requests.get(MODEL_URL, stream=True)
            r.raise_for_status()
            with open(tar_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            print("Extracting model...")
            with tarfile.open(tar_path, "r:gz") as tar:
                # Iterate to find the file, avoiding exact path issues
                found = False
                for member in tar.getmembers():
                    if member.name.endswith("frozen_inference_graph.pb"):
                        f = tar.extractfile(member)
                        if f:
                            with open(weights_path, "wb") as out:
                                out.write(f.read())
                            found = True
                            print(f"Extracted {member.name} to {weights_path}")
                            break
                
                if not found:
                    raise Exception("frozen_inference_graph.pb not found in tarball")
            
            # Clean up tar
            os.remove(tar_path)
            
        except Exception as e:
            print(f"Error downloading/extracting model: {e}")
            
    return config_path, weights_path

def process_video(file_path: str):
    """
    Process video: extract keyframes, detect objects, generate summary.
    Returns dict with analysis results.
    """
    config_path, weights_path = get_mobilenet_files()
    
    # Load Network (TensorFlow)
    try:
        net = cv2.dnn.readNetFromTensorflow(weights_path, config_path)
    except Exception as e:
        print(f"Error loading network: {e}")
        return {"status": "failed", "error": str(e)}
    
    cap = cv2.VideoCapture(file_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    objects_detected = [] # List of {label, confidence}
    frame_timestamps = [] # List of timestamps
    keyframes = []        # List of {timestamp, image_path}
    unique_labels = set()
    thumbnail_path = None
    
    # Sampling strategy: Process 1 frame every second to save CPU
    sample_rate = int(fps) if fps > 0 else 30
    
    # Scene Change Detection using Frame Difference (Motion Detection)
    # Sensitivity: Check if > 5% of pixels changed
    MOTION_PIXEL_THRESHOLD = 0.05 
    CONFIDENCE_THRESHOLD = 0.65
    prev_gray = None

    current_frame = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        if current_frame % sample_rate == 0:
            timestamp = current_frame / fps if fps > 0 else 0
            
            # 1. Prepare Frame for Motion Detection (Grayscale + Blur)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)
            
            is_motion = True # Assume motion for first frame
            
            if prev_gray is not None:
                # Calculate Absolute Difference
                dist = cv2.absdiff(prev_gray, gray)
                
                # Threshold the difference (pixels with change > 25 intensity)
                thresh = cv2.threshold(dist, 25, 255, cv2.THRESH_BINARY)[1]
                
                # Calculate percentage of changed pixels
                total_pixels = thresh.shape[0] * thresh.shape[1]
                changed_pixels = cv2.countNonZero(thresh)
                change_ratio = changed_pixels / total_pixels
                
                # If change is small (< 1%), scene is static
                if change_ratio < MOTION_PIXEL_THRESHOLD:
                    is_motion = False
                    print(f"DEBUG: Static scene at {timestamp:.2f}s (Change: {change_ratio:.4f}). Skipping.")
            
            prev_gray = gray

            # 2. Visual Object Detection (Optimization: Only run if motion detected)
            if is_motion:
                # Prepare blob for SSD MobileNet V3 (Size 320x320 usually works best for V3, or 300x300)
                # MobileNet V3 Large usually takes 320x320 input
                (h, w) = frame.shape[:2]
                blob = cv2.dnn.blobFromImage(frame, 1.0/127.5, (320, 320), (127.5, 127.5, 127.5), swapRB=True, crop=False)
                net.setInput(blob)
                detections = net.forward()

                frame_has_detection = False
                for i in range(detections.shape[2]):
                    confidence = detections[0, 0, i, 2]
                    if confidence > CONFIDENCE_THRESHOLD: # Threshold
                        idx = int(detections[0, 0, i, 1])                        
                        target_idx = idx - 1 if idx > 0 else 0 
                        if target_idx < len(CLASSES):
                            label = CLASSES[target_idx]
                        else:
                            label = f"Class-{idx}"

                        objects_detected.append({
                            "label": label,
                            "confidence": float(confidence),
                            "timestamp": timestamp
                        })
                        unique_labels.add(label)
                        frame_has_detection = True

                        # Draw bounding box
                        box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                        (startX, startY, endX, endY) = box.astype("int")
                        cv2.rectangle(frame, (startX, startY), (endX, endY), (0, 255, 0), 2)
                        y = startY - 15 if startY - 15 > 15 else startY + 15
                        cv2.putText(frame, f"{label}: {confidence:.2f}", (startX, y),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                
                if frame_has_detection:
                    frame_timestamps.append(timestamp)
                    
                    # Generate filename for this specific keyframe
                    # e.g., video_name_frame_12.5.jpg
                    base_name = os.path.basename(file_path).split('.')[0]
                    thumb_dir = os.path.join("data/uploads/thumbnails", base_name)
                    os.makedirs(thumb_dir, exist_ok=True)
                    
                    frame_filename = f"frame_{timestamp:.2f}.jpg"
                    frame_path = os.path.join(thumb_dir, frame_filename)
                    cv2.imwrite(frame_path, frame)
                    
                    # Add to keyframes list
                    # Filter objects relevant to this frame (though in this 1FPS logic, 'detections' IS for this frame)
                    current_frame_objects = []
                    for k in range(detections.shape[2]):
                        conf = detections[0, 0, k, 2]
                        if conf > CONFIDENCE_THRESHOLD:
                            raw_idx = int(detections[0, 0, k, 1])
                            tgt_idx = raw_idx - 1 if raw_idx > 0 else 0
                            
                            if tgt_idx < len(CLASSES):
                                lbl = CLASSES[tgt_idx]
                            else:
                                lbl = f"Class {raw_idx}"
                                
                            # Store dictionary with confidence
                            current_frame_objects.append({
                                "label": lbl,
                                "confidence": float(conf)
                            })

                    # Deduplicate by label, keeping highest confidence
                    unique_objects = {}
                    for obj in current_frame_objects:
                        lbl = obj["label"]
                        if lbl not in unique_objects or obj["confidence"] > unique_objects[lbl]["confidence"]:
                            unique_objects[lbl] = obj

                    keyframes.append({
                        "timestamp": timestamp,
                        "image_path": frame_path,
                        "objects": list(unique_objects.values())
                    })
                    
                    # Set the main thumbnail to the first keyframe found
                    if not thumbnail_path:
                        thumbnail_path = frame_path
                        
                    cv2.imwrite(frame_path, frame)

        current_frame += 1
    
    cap.release()
    
    summary_text = f"Video containing {', '.join(unique_labels)}"
    
    return {
        "status": "completed",
        "objects_detected": objects_detected,
        "frame_timestamps": frame_timestamps,
        "keyframes": keyframes,
        "summary": summary_text,
        "processed_at": datetime.utcnow(),
        "thumbnail_path": thumbnail_path
    }

def process_audio(file_path: str):
    """
    Process audio: transcribe using Whisper.
    Returns dict with transcript and segments.
    """
    global whisper_model
    if whisper_model is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading Whisper model ('tiny') on {device}...", flush=True)
        whisper_model = whisper.load_model("tiny", device=device)
        print("Whisper model loaded.", flush=True)

    # Whisper handles loading and processing
    # if we want more advanced features, we can play with the parameters
    # defaul values:
    # no_speech_threshold=0.6, logprob_threshold=-1.0, compression_ratio_threshold=2.4
    result = whisper_model.transcribe(file_path)
    
    return {
        "status": "completed",
        "transcript": result["text"],
        "segments": result["segments"],
        "processed_at": datetime.utcnow()
    }

