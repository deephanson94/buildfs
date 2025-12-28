import React, { useEffect, useRef, useState } from 'react';
import { X, Search, Clock, FileAudio, BarChart2 } from 'lucide-react';
import api from '../api';

// Reusing same optimized player pattern
const AudioPlayer = React.memo(({ src, onTimeUpdate, setAudioRef }) => {
    return (
        <audio
            ref={setAudioRef}
            src={src}
            controls
            className="w-full mt-4"
            onTimeUpdate={onTimeUpdate}
        >
            Your browser does not support the audio element.
        </audio>
    );
}, (prevProps, nextProps) => {
    return prevProps.src === nextProps.src;
});

const AudioModal = ({ audio, onClose, onSearchSimilar, onTextSearch }) => {
    const audioRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [activeSegIdx, setActiveSegIdx] = useState(-1);

    // CRITICAL: Use relative path to hit Nginx (port 8080) for Range support
    const audioSrc = React.useMemo(() => {
        return '/' + audio.file_path;
    }, [audio.file_path]);

    const segments = React.useMemo(() =>
        audio.segments ? audio.segments : [],
        [audio.segments]);

    const handleTimeUpdate = React.useCallback(() => {
        if (audioRef.current) {
            const time = audioRef.current.currentTime;
            setCurrentTime(time);

            // Find active segment
            let activeIdx = -1;
            for (let i = 0; i < segments.length; i++) {
                // Check if time is within segment range
                if (time >= segments[i].start && time <= segments[i].end) {
                    activeIdx = i;
                    break;
                }
                // Fallback: if between segments, maybe highlight the next one or keep previous?
                // Let's stick to strict range for now, or "current or next closest"
            }
            if (activeIdx !== activeSegIdx) {
                setActiveSegIdx(activeIdx);
            }
        }
    }, [segments, activeSegIdx]);

    // Auto-scroll logic
    useEffect(() => {
        if (activeSegIdx !== -1 && scrollContainerRef.current) {
            const activeEl = scrollContainerRef.current.children[activeSegIdx];
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [activeSegIdx]);

    const setAudioRef = React.useCallback((element) => {
        audioRef.current = element;
    }, []);

    const handleJumpToTime = (time) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            audioRef.current.play().catch(() => { });
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden relative shadow-2xl">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>

                <div className="flex-none p-6 border-b border-gray-100 pr-16 bg-gray-50/50">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-3 bg-purple-100 rounded-lg">
                                <FileAudio className="w-6 h-6 text-purple-600" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-xl font-bold text-gray-900 truncate">{audio.filename}</h2>
                                <p className="text-sm text-gray-500 font-mono mt-0.5">
                                    {segments.length} segments • {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} / {Math.floor((audioRef.current?.duration || 0) / 60)}:{Math.floor((audioRef.current?.duration || 0) % 60).toString().padStart(2, '0')}
                                </p>
                            </div>
                        </div>

                        {onSearchSimilar && (
                            <button
                                onClick={onSearchSimilar}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-medium transition-colors border border-purple-200 ml-4 flex-shrink-0"
                            >
                                <Search className="w-4 h-4" />
                                Find Similar Audio
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0">

                    {/* Audio Player Section */}
                    <div className="flex-none p-6 pb-2">
                        <AudioPlayer
                            src={audioSrc}
                            onTimeUpdate={handleTimeUpdate}
                            setAudioRef={setAudioRef}
                        />
                    </div>

                    {/* Transcript Section */}
                    <div className="flex-1 overflow-hidden flex flex-col p-6 pt-2">
                        <div className="mb-3">
                            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                <BarChart2 className="w-4 h-4 text-purple-500" />
                                Transcription & Model Confidence
                            </h3>
                            <p className="text-xs text-gray-400 mt-1 pl-6 italic">Click segment to jump to timestamp</p>
                        </div>

                        <div
                            ref={scrollContainerRef}
                            className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar scroll-smooth"
                        >
                            {segments.map((seg, idx) => {
                                const confidence = seg.avg_logprob ? Math.round(Math.exp(seg.avg_logprob) * 100) : 0;
                                const confidenceColor = confidence > 80 ? 'bg-green-100 text-green-700' : (confidence > 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700');

                                return (
                                    <div
                                        key={idx}
                                        onClick={() => handleJumpToTime(seg.start)}
                                        className={`
                                            p-3 rounded-xl border transition-all cursor-pointer hover:shadow-sm
                                            ${activeSegIdx === idx
                                                ? 'bg-white border-orange-500 ring-2 ring-orange-500 shadow-md'
                                                : 'bg-white border-gray-100 hover:border-gray-300 hover:bg-gray-50'}
                                        `}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Metadata Column */}
                                            <div className="flex flex-col items-center gap-1 min-w-[3.5rem] mt-0.5">
                                                <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded tracking-tighter">
                                                    {Math.floor(seg.start / 60)}:{Math.floor(seg.start % 60).toString().padStart(2, '0')}.{Math.floor((seg.start % 1) * 100).toString().padStart(2, '0')}
                                                </span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${confidenceColor}`} title="AI Confidence Score">
                                                    {confidence}%
                                                </span>
                                            </div>

                                            {/* Text Column */}
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-base leading-relaxed mb-2 ${activeSegIdx === idx ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                                                    {seg.text}
                                                </p>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onTextSearch) onTextSearch(seg.text);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-100 rounded transition-colors"
                                                >
                                                    <Search className="w-3 h-3" />
                                                    Similar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AudioModal;
