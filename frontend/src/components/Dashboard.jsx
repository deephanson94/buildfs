import React, { useState } from 'react';
import { Search, Upload as UploadIcon, X } from 'lucide-react';
import api from '../api';
import MediaList from './MediaList';
import SearchResults from './SearchResults';
import Upload from './Upload';
import VideoModal from './VideoModal';
import AudioModal from './AudioModal';

const Dashboard = () => {
    // View State
    const [view, setView] = useState('browse'); // 'browse' | 'search'

    // Search State
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Modal State (Lifted from MediaList)
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [selectedAudio, setSelectedAudio] = useState(null);

    const handleItemClick = async (item) => {
        // If coming from SearchResults, item is a SearchResult object (partial data)
        // We need to fetch the full object to display in the modal
        let fullItem = item;

        // Simple heuristic: if it lacks 'status' or has 'score', it's likely a partial search result
        if (item.score !== undefined || !item.status) {
            try {
                const endpoint = item.type === 'video' ? `/videos/${item.id}` : `/audio/${item.id}`;
                const response = await api.get(endpoint);
                fullItem = { ...response.data, type: item.type }; // Ensure type is present
            } catch (error) {
                console.error("Failed to fetch full item details:", error);
                alert("Could not load item details.");
                return;
            }
        }

        if (fullItem.type === 'video') {
            setSelectedVideo(fullItem);
        } else if (fullItem.type === 'audio') {
            setSelectedAudio(fullItem);
        }
    };

    // Upload Modal State
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0); // Used to trigger MediaList refresh

    const handleSearch = async (e) => {
        e.preventDefault();
        performSearch(query);
    };

    const performSearch = async (searchQuery) => {
        if (!searchQuery?.trim()) {
            setView('browse');
            return;
        }

        // Update state to match what we are searching
        setQuery(searchQuery);
        setIsSearching(true);
        setView('search');

        try {
            const response = await api.get(`/search?query=${encodeURIComponent(searchQuery)}`);
            setSearchResults(response.data);
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            setIsSearching(false);
        }
    };

    const performSimilaritySearch = async (id, type) => {
        setIsSearching(true);
        setView('search');
        // Set a descriptive query for the UI
        setQuery(`Similar to ${type} #${id}...`);

        try {
            const response = await api.get(`/search/similar?id=${id}&type=${type}`);
            setSearchResults(response.data);
            // Fetch item details to get filename for better query display
            // Use single item endpoints for efficiency
            const itemRes = await api.get(type === 'video' ? `/videos/${id}` : `/audio/${id}`);
            const item = itemRes.data;
            if (item) {
                setQuery(`Similar to "${item.filename}"`);
            }
        } catch (error) {
            console.error("Similarity search failed:", error);
            setSearchResults([]);
            alert("Failed to find similar content.");
        } finally {
            setIsSearching(false);
        }
    };

    const clearSearch = () => {
        setQuery('');
        setSearchResults([]);
        setView('browse');
    };

    const handleUploadClose = () => {
        setIsUploadModalOpen(false);
        // Increment key to trigger re-render of MediaList
        setRefreshKey(prev => prev + 1);
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-brand-100 selection:text-brand-900">
            {/* Header / Navbar */}
            <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between py-4 md:h-20 gap-4">

                        {/* Top Component: Logo & Upload (Mobile) / Logo (Desktop) */}
                        <div className="flex justify-between items-center">
                            {/* Logo */}
                            <div className="flex items-center cursor-pointer group" onClick={clearSearch}>
                                <div className="w-10 h-10 bg-gradient-to-br from-brand-600 to-brand-800 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-brand-500/20 transition-transform duration-200 group-hover:scale-105">
                                    <Search className="h-6 w-6" />
                                </div>
                                <span className="ml-3 font-bold text-2xl tracking-tight text-gray-900 group-hover:text-brand-700 transition-colors">
                                    UnifiedSearch
                                </span>
                            </div>

                            {/* Mobile Upload Button (Visible only on small screens) */}
                            <div className="md:hidden">
                                <button
                                    onClick={() => setIsUploadModalOpen(true)}
                                    className="p-2 bg-brand-600 text-white rounded-full shadow-md hover:bg-brand-700 focus:outline-none"
                                >
                                    <UploadIcon className="h-6 w-6" />
                                </button>
                            </div>
                        </div>

                        {/* Search Bar - Full width on mobile, centered max-w-xl on desktop */}
                        <div className="w-full md:flex-1 md:max-w-2xl md:px-8">
                            <form onSubmit={handleSearch} className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-5 w-5 text-gray-400 group-focus-within:text-brand-500 transition-colors" />
                                </div>
                                <input
                                    type="text"
                                    className="block w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl leading-5 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 sm:text-sm transition-all shadow-sm"
                                    placeholder="Search videos & audio..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                />
                                {query && (
                                    <button
                                        type="button"
                                        onClick={clearSearch}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                    >
                                        <div className="p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
                                            <X className="h-4 w-4" />
                                        </div>
                                    </button>
                                )}
                            </form>
                        </div>

                        {/* Desktop Upload Button (Hidden on mobile) */}
                        <div className="hidden md:flex items-center">
                            <button
                                onClick={() => setIsUploadModalOpen(true)}
                                className="inline-flex items-center justify-center px-6 py-2.5 border border-transparent text-sm font-semibold rounded-full shadow-md text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-all hover:-translate-y-0.5"
                            >
                                <UploadIcon className="-ml-1 mr-2 h-5 w-5" />
                                Upload Media
                            </button>
                        </div>
                    </div>
                </div>
            </nav>


            {/* Modals (Lifted Loop) */}
            {selectedVideo && (
                <VideoModal
                    video={selectedVideo}
                    onClose={() => setSelectedVideo(null)}
                    onObjectSearch={(query) => {
                        setSelectedVideo(null);
                        performSearch(query);
                    }}
                    onSearchSimilar={() => {
                        setSelectedVideo(null);
                        performSimilaritySearch(selectedVideo.id, 'video');
                    }}
                />
            )}

            {selectedAudio && (
                <AudioModal
                    audio={selectedAudio}
                    onClose={() => setSelectedAudio(null)}
                    onTextSearch={(query) => {
                        setSelectedAudio(null);
                        performSearch(query);
                    }}
                    onSearchSimilar={() => {
                        setSelectedAudio(null);
                        performSimilaritySearch(selectedAudio.id, 'audio');
                    }}
                />
            )}

            {/* Main Content */}
            <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                {view === 'browse' ? (
                    <MediaList
                        key={refreshKey}
                        onSearch={performSearch}
                        onSimilaritySearch={performSimilaritySearch}
                        onItemClick={handleItemClick}
                    />
                ) : (
                    <SearchResults
                        results={searchResults}
                        query={query}
                        onResultClick={handleItemClick}
                    />
                )}
            </main>

            {/* Upload Modal */}
            {isUploadModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        {/* Background overlay */}
                        <div
                            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
                            aria-hidden="true"
                            onClick={handleUploadClose}
                        ></div>

                        {/* Modal styling centering trick */}
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-xl sm:w-full">
                            <Upload onClose={handleUploadClose} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
