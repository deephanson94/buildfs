import React from 'react';
import { Play, FileAudio } from 'lucide-react';

const SearchResults = ({ results, query, onResultClick }) => {
    if (!results) return null;

    if (results.length === 0 && query) {
        return (
            <div className="text-center text-gray-500 py-20">
                <p className="text-xl">No results found for "{query}"</p>
                <p className="text-sm mt-2">Try different keywords or check spelling.</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Search Results for "{query}"
            </h2>
            <div className="space-y-6">
                {results.map((result) => (
                    <div
                        key={`${result.type}-${result.id}-${result.score}`}
                        onClick={() => onResultClick && onResultClick(result)}
                        className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow cursor-pointer hover:border-brand-200"
                    >
                        <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-lg ${result.type === 'video' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                {result.type === 'video' ? <Play className="w-6 h-6" /> : <FileAudio className="w-6 h-6" />}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">
                                            {result.filename}
                                        </h3>
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 mt-1 capitalize">
                                            {result.type}
                                        </span>
                                    </div>
                                    <span className="text-sm font-medium text-green-600">
                                        {Math.round(result.score * 100)}% Match
                                    </span>
                                </div>
                                {result.preview_text && (
                                    <p className="mt-2 text-gray-600 text-sm leading-relaxed">
                                        "...{result.preview_text}..."
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SearchResults;
