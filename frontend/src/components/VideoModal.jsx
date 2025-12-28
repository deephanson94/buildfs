import React, { useEffect, useRef, useState } from 'react';
import { X, Search, Clock, Target } from 'lucide-react';
import api from '../api';

// Memoized Video Player Component
// Rely on default shallow comparison. 
// IMPORTANT: onTimeUpdate must be stable to prevent re-renders.
const VideoPlayer = React.memo(({ src, onTimeUpdate, setVideoRef }) => {
    return (
        <video
            ref={setVideoRef}
            src={src}
            controls
            className="w-full h-full object-contain"
            onTimeUpdate={onTimeUpdate}
        >
            Your browser does not support the video tag.
        </video>
    );
});

const VideoModal = ({ video, onClose, onObjectSearch, onSearchSimilar }) => {
    const videoRef = useRef(null);
    const scrollContainerRef = useRef(null);

    // UI State
    const [currentTime, setCurrentTime] = useState(0);
    const [activeKeyframeIdx, setActiveKeyframeIdx] = useState(-1);

    // CRITICAL: Use relative path to hit Nginx (port 8080) which supports Range requests for seeking.
    const videoSrc = React.useMemo(() => {
        // video.file_path is like "data/uploads/..."
        const src = '/' + video.file_path;
        return src;
    }, [video.file_path]);

    // Memoize keyframes
    const keyframes = React.useMemo(() =>
        video.keyframes ? [...video.keyframes].sort((a, b) => a.timestamp - b.timestamp) : [],
        [video.keyframes]);

    // Stable callback for time updates
    const handleTimeUpdate = React.useCallback(() => {
        if (videoRef.current) {
            const time = videoRef.current.currentTime;
            setCurrentTime(time);

            // Calculate Active Keyframe (Efficiently)
            let activeIdx = -1;
            for (let i = 0; i < keyframes.length; i++) {
                if (keyframes[i].timestamp <= time) {
                    activeIdx = i;
                } else {
                    break;
                }
            }

            // Functional update to avoid dependency on activeKeyframeIdx
            // This keeps the callback stable and prevents VideoPlayer re-renders
            setActiveKeyframeIdx(prev => {
                if (prev !== activeIdx) {
                    return activeIdx;
                }
                return prev;
            });
        }
    }, [keyframes]); // Stable as long as keyframes is stable

    // Auto-scroll logic happens on activeKeyframeIdx change
    useEffect(() => {
        if (activeKeyframeIdx !== -1 && scrollContainerRef.current) {
            const activeEl = scrollContainerRef.current.children[activeKeyframeIdx];
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [activeKeyframeIdx]);

    const setVideoRef = React.useCallback((element) => {
        videoRef.current = element;
    }, []);

    const handleJumpToTime = (time, idx) => {
        if (videoRef.current) {
            const v = videoRef.current;
            const t = parseFloat(time);
            if (!isNaN(t) && isFinite(t)) {
                v.currentTime = t;
                // Force play to ensure it doesn't get stuck in paused buffering state
                v.play().catch(() => { }); // Auto-play on jump

                // CRITICAL: Immediately update UI for instant feedback, 
                // don't wait for timeupdate event which can be delayed or imprecise
                if (idx !== undefined) {
                    setActiveKeyframeIdx(idx);
                }
            }
        }
    };

    const handleKeyframeSearch = (kf) => {
        // Construct a query from the objects detected in this frame
        let query = "";
        if (kf.objects && kf.objects.length > 0) {
            // Extract labels from objects (which might be strings or dicts)
            query = kf.objects.map(obj => typeof obj === 'string' ? obj : obj.label).join(" ");
        } else {
            query = video.filename.split('.')[0];
        }

        if (onObjectSearch) {
            onObjectSearch(query);
        }
    };

    // Layout: Side-by-Side (Video Left, Keyframes Right)
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden relative shadow-2xl">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>

                <div className="flex-none p-6 border-b border-gray-100 pr-16 flex justify-between items-start">
                    <div className="min-w-0 flex-1 mr-4">
                        <h2 className="text-2xl font-bold text-gray-900 truncate">{video.filename}</h2>
                        {video.summary && <p className="text-gray-500 mt-1">{video.summary}</p>}
                    </div>

                    {onSearchSimilar && (
                        <button
                            onClick={onSearchSimilar}
                            className="flex items-center gap-2 px-4 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg font-medium transition-colors border border-brand-200"
                        >
                            <Target className="w-4 h-4" />
                            Find Similar Video
                        </button>
                    )}
                </div>

                <div className="flex-1 flex min-h-0 overflow-hidden">

                    {/* LEFT: Video Player (Flex Grow) */}
                    <div className="flex-[2] flex flex-col gap-4 p-6 bg-black/5 justify-center">
                        <div className="w-full bg-black rounded-xl overflow-hidden shadow-lg relative aspect-video flex-shrink-0">
                            <VideoPlayer
                                src={videoSrc}
                                onTimeUpdate={handleTimeUpdate}
                                setVideoRef={setVideoRef}
                            />
                        </div>

                        <div className="flex items-center justify-between text-sm text-gray-600 px-2 flex-none">
                            <span className="flex items-center gap-1 font-mono">
                                <Clock className="w-4 h-4" />
                                {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}
                            </span>
                        </div>
                    </div>

                    {/* RIGHT: Keyframes (Vertical Scroll, Fixed Width or Flex-1) */}
                    <div className="flex-1 flex flex-col min-w-[320px] max-w-md border-l border-gray-100 bg-white">
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex-none">
                            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                <Target className="w-4 h-4 text-brand-500" />
                                Key Events ({keyframes.length})
                            </h3>
                            <p className="text-xs text-gray-400 mt-1 pl-6 italic">Click item to jump to timestamp</p>
                        </div>

                        <div
                            ref={scrollContainerRef}
                            className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar scroll-smooth"
                        >
                            {keyframes.length === 0 ? (
                                <p className="text-gray-400 text-center py-10">No keyframes detected.</p>
                            ) : (
                                keyframes.map((kf, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => handleJumpToTime(kf.timestamp, idx)}
                                        className={`
                                            flex gap-3 p-3 rounded-lg border transition-all cursor-pointer group hover:shadow-md
                                            ${activeKeyframeIdx === idx
                                                ? 'bg-white border-orange-500 ring-2 ring-orange-500 shadow-md'
                                                : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
                                        `}
                                    >
                                        {/* Thumbnail */}
                                        <div className="w-24 h-16 bg-gray-200 rounded-md overflow-hidden flex-shrink-0 relative">
                                            <img
                                                src={api.defaults.baseURL + '/' + kf.image_path}
                                                alt={`Frame ${idx}`}
                                                className="w-full h-full object-cover"
                                            />
                                            <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-1 font-mono">
                                                {kf.timestamp.toFixed(1)}s
                                            </span>
                                        </div>

                                        {/* Details */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                            <div className="flex flex-wrap gap-1">
                                                {kf.objects && kf.objects.length > 0 ? (
                                                    kf.objects.map((obj, i) => {
                                                        // Handle both new {label, confidence} and legacy string formats
                                                        const label = typeof obj === 'string' ? obj : obj.label;
                                                        const confidence = typeof obj === 'string' ? null : Math.round(obj.confidence * 100);

                                                        return (
                                                            <span key={i} className="text-[10px] uppercase font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 truncate max-w-full" title={confidence ? `Confidence: ${confidence}%` : ''}>
                                                                {label} {confidence && <span className="text-gray-400 font-normal ml-0.5">{confidence}%</span>}
                                                            </span>
                                                        );
                                                    })
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">Motion</span>
                                                )}
                                            </div>

                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleKeyframeSearch(kf); }}
                                                className="self-start mt-1 text-[10px] flex items-center gap-1 text-brand-600 hover:text-brand-800 font-medium px-1.5 py-0.5 rounded bg-white border border-brand-100 hover:bg-brand-50 transition-colors"
                                            >
                                                <Search className="w-3 h-3" />
                                                Similar
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VideoModal;
