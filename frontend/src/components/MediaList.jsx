import React, { useEffect, useState } from 'react';
import api from '../api';
import { FileVideo, FileAudio, Clock, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';

const MediaList = (props) => {
    const [videos, setVideos] = useState([]);
    const [audios, setAudios] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let timeoutId;
        let isMounted = true;

        const fetchData = async () => {
            try {
                const [vidRes, audRes] = await Promise.all([
                    api.get('/videos'),
                    api.get('/transcriptions')
                ]);

                if (!isMounted) return;

                const newVideos = vidRes.data;
                const newTrans = audRes.data;

                setVideos(newVideos);
                setAudios(newTrans);

                // Smart Polling: Only schedule next fetch if there are active tasks
                const hasActiveTasks = [...newVideos, ...newTrans].some(item =>
                    item.status === 'processing' || item.status === 'pending'
                );

                if (hasActiveTasks) {
                    timeoutId = setTimeout(fetchData, 3000); // Poll every 3s if active
                }

            } catch (err) {
                console.error("Failed to fetch media", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData(); // Initial fetch

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, []);

    const handleDelete = async (id, type) => {
        if (!window.confirm("Are you sure you want to delete this file? This action cannot be undone.")) {
            return;
        }

        try {
            if (type === 'video') {
                await api.delete(`/videos/${id}`);
                setVideos(prev => prev.filter(v => v.id !== id));
            } else {
                await api.delete(`/audio/${id}`);
                setAudios(prev => prev.filter(a => a.id !== id));
            }
        } catch (err) {
            console.error("Delete failed", err);
            alert("Failed to delete item: " + (err.response?.data?.detail || "Unknown error"));
        }
    };

    const StatusBadge = ({ status }) => {
        const styles = {
            pending: "bg-yellow-100 text-yellow-800",
            processing: "bg-blue-100 text-blue-800",
            completed: "bg-green-100 text-green-800",
            failed: "bg-red-100 text-red-800",
        };
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.pending} capitalize`}>
                {status}
            </span>
        );
    };



    const handleCardClick = (item) => {
        if (item.status === 'completed' && props.onItemClick) {
            props.onItemClick(item);
        }
    };

    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'video' | 'audio'

    if (loading) return <div className="p-8 text-center text-gray-500">Loading library...</div>;

    const filteredItems = [
        ...videos.map(v => ({ ...v, type: 'video' })),
        ...audios.map(a => ({ ...a, type: 'audio' }))
    ].filter(item => activeTab === 'all' || item.type === activeTab)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Media Library</h2>

                {/* Tabs */}
                <div className="flex p-1 bg-gray-100 rounded-lg self-start sm:self-auto">
                    {['all', 'video', 'audio'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`
                                px-4 py-1.5 text-sm font-medium rounded-md transition-all capitalize
                                ${activeTab === tab
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}
                            `}
                        >
                            {tab === 'all' ? 'All Media' : tab + 's'}
                        </button>
                    ))}
                </div>
            </div>





            <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
                {/* Masonry Layout */}
                {filteredItems.map(item => (
                    <div
                        key={`${item.type}-${item.id}`}
                        onClick={() => handleCardClick(item)}
                        className={`break-inside-avoid bg-white rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 overflow-hidden group relative ${(item.type === 'video' || item.type === 'audio') && item.status === 'completed' ? 'cursor-pointer' : ''}`}
                    >

                        {/* Delete Button (Visible on hover) */}
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.type); }}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/90 text-gray-400 hover:text-red-600 hover:bg-red-50 shadow-sm border border-gray-200 opacity-0 group-hover:opacity-100 transition-all z-10"
                            title="Delete"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>

                        {/* Header */}
                        <div className="p-5 border-b border-gray-50 bg-gray-50/30">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 min-w-0 mr-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        {item.type === 'video' ?
                                            <FileVideo className="w-4 h-4 text-blue-500" /> :
                                            <FileAudio className="w-4 h-4 text-purple-500" />
                                        }
                                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{item.type}</span>
                                    </div>
                                    <h4 className="font-bold text-gray-900 truncate text-lg group-hover:text-brand-600 transition-colors" title={item.filename}>
                                        {item.filename}
                                    </h4>
                                </div>
                                <StatusBadge status={item.status} />
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-5">
                            {item.type === 'video' && item.thumbnail_path && (
                                <div className="mb-4 relative rounded-xl overflow-hidden border border-gray-100 aspect-video bg-black/5 group-hover:shadow-inner transition-shadow">
                                    <img
                                        src={api.defaults.baseURL + '/' + item.thumbnail_path}
                                        alt={`Thumbnail for ${item.filename}`}
                                        className="w-full h-full object-contain transform transition-transform duration-700 group-hover:scale-105"
                                    />
                                </div>
                            )}

                            {item.type === 'video' && item.summary && (
                                <div className="mb-4 text-sm text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">
                                    {item.summary}
                                </div>
                            )}

                            {item.type === 'video' && item.keyframes && item.keyframes.length > 0 && (
                                <div className="mb-4">
                                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Keyframes ({item.keyframes.length})</h5>
                                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                        {item.keyframes.map((kf, idx) => (
                                            <div key={idx} className="flex-shrink-0 w-32 h-20 relative rounded-lg overflow-hidden border border-gray-200 bg-gray-100 group/kf cursor-pointer hover:ring-2 hover:ring-brand-500 transition-all">
                                                <img
                                                    src={api.defaults.baseURL + '/' + kf.image_path}
                                                    alt={`Frame at ${kf.timestamp}s`}
                                                    className="w-full h-full object-cover"
                                                />
                                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                                                    <span className="text-white text-[10px] font-mono pl-1">{kf.timestamp.toFixed(1)}s</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {item.type === 'audio' && item.transcript && (
                                <div className="mb-4 bg-gray-50 p-4 rounded-xl text-sm text-gray-700 max-h-60 overflow-y-auto custom-scrollbar border border-gray-100">
                                    {item.segments && item.segments.length > 0 ? (
                                        <div className="space-y-3">
                                            {item.segments.map((seg, idx) => {
                                                return (
                                                    <div key={idx} className="flex gap-3 items-start group/segment hover:bg-white p-2 rounded-lg transition-colors">
                                                        <div className="flex flex-col items-center gap-1 min-w-[3.5rem]">
                                                            <span className="text-[10px] font-mono text-brand-500 bg-brand-50 px-1.5 py-0.5 rounded opacity-80 tracking-tighter">
                                                                {Math.floor(seg.start / 60)}:{Math.floor(seg.start % 60).toString().padStart(2, '0')}.{Math.floor((seg.start % 1) * 100).toString().padStart(2, '0')}
                                                            </span>
                                                        </div>
                                                        <span className="leading-relaxed">{seg.text}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <p className="italic text-gray-500">"{item.transcript}"</p>
                                    )}
                                </div>
                            )}

                            {item.status === 'completed' && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (props.onSimilaritySearch) props.onSimilaritySearch(item.id, item.type);
                                    }}
                                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 hover:text-brand-700 transition-colors flex items-center justify-center gap-2 group/btn"
                                >
                                    <Clock className="w-4 h-4 group-hover/btn:animate-spin-slow" />
                                    Find Similar Content
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MediaList;
