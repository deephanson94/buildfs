import React, { useState } from 'react';
import { Upload as UploadIcon, FileVideo, FileAudio, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../api';

const Upload = ({ onClose }) => {
    const [files, setFiles] = useState([]);
    const [type, setType] = useState('video'); // video | audio
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState(null); // success | error | partial
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState(0);

    const handleFileChange = (e) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
            setStatus(null);
            setMessage('');
            setProgress(0);
        }
    };

    const handleUpload = async () => {
        if (files.length === 0) return;

        setUploading(true);
        setStatus(null);
        setProgress(0);

        let successCount = 0;
        let failCount = 0;
        const total = files.length;

        const endpoint = type === 'video' ? '/process/video' : '/process/audio';

        for (let i = 0; i < total; i++) {
            const formData = new FormData();
            formData.append('file', files[i]);

            try {
                await api.post(endpoint, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                successCount++;
            } catch (error) {
                console.error(`Failed to upload ${files[i].name}`, error);
                failCount++;
            }

            setProgress(Math.round(((i + 1) / total) * 100));
        }

        setUploading(false);
        setFiles([]);

        if (failCount === 0) {
            setStatus('success');
            setMessage(`Successfully uploaded ${successCount} ${type}(s). Processing started.`);
            // Optional: Auto-close on success after a delay?
        } else if (successCount > 0) {
            setStatus('partial');
            setMessage(`Uploaded ${successCount} files. Failed to upload ${failCount} files.`);
        } else {
            setStatus('error');
            setMessage('Upload failed. Please try again.');
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-auto overflow-hidden transform transition-all">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <div className="p-2 bg-brand-100 rounded-lg text-brand-600">
                        <UploadIcon className="w-6 h-6" />
                    </div>
                    Upload Media
                </h2>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-500 hover:bg-gray-100 p-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                    <span className="sr-only">Close</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="p-8">
                <div className="mb-8">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Media Type</label>
                    <div className="flex gap-4">
                        <button
                            onClick={() => setType('video')}
                            className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 border-2 transition-all duration-200 ${type === 'video'
                                ? 'bg-brand-50 border-brand-500 text-brand-700 shadow-sm'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            <FileVideo className="w-5 h-5" />
                            <span className="font-medium">Video</span>
                        </button>
                        <button
                            onClick={() => setType('audio')}
                            className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 border-2 transition-all duration-200 ${type === 'audio'
                                ? 'bg-brand-50 border-brand-500 text-brand-700 shadow-sm'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            <FileAudio className="w-5 h-5" />
                            <span className="font-medium">Audio</span>
                        </button>
                    </div>
                </div>

                <div className="mb-8">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Select Files</label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-brand-500 hover:bg-brand-50/30 transition-all duration-300 group cursor-pointer relative">
                        <input
                            id="file-upload"
                            name="file-upload"
                            type="file"
                            multiple
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            accept={type === 'video' ? 'video/*' : 'audio/*'}
                            onChange={handleFileChange}
                        />
                        <div className="space-y-2 text-center pointer-events-none">
                            {files.length > 0 ? (
                                <div className="text-gray-900 font-medium space-y-2">
                                    <div className="p-3 bg-brand-100 w-16 h-16 rounded-full mx-auto flex items-center justify-center text-brand-600 mb-3">
                                        <CheckCircle className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        {files.map((f, idx) => (
                                            <div key={idx} className="text-sm truncate max-w-xs mx-auto text-gray-700">{f.name}</div>
                                        ))}
                                    </div>
                                    <div className="text-xs text-brand-600 font-bold bg-brand-50 inline-block px-3 py-1 rounded-full">{files.length} file(s) selected</div>
                                </div>
                            ) : (
                                <>
                                    <UploadIcon className="mx-auto h-12 w-12 text-gray-400 group-hover:text-brand-500 transition-colors" />
                                    <div className="text-sm text-gray-600">
                                        <span className="font-medium text-brand-600 hover:text-brand-500">Click to upload</span>
                                        <span className="pl-1">or drag and drop</span>
                                    </div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                                        {type === 'video' ? 'MP4, MOV' : 'MP3, WAV'}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleUpload}
                    disabled={files.length === 0 || uploading}
                    className={`w-full py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white transition-all transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 ${(!files.length || uploading)
                        ? 'bg-gray-400 cursor-not-allowed opacity-70 shadow-none'
                        : 'bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 shadow-brand-500/30'
                        }`}
                >
                    {uploading ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Uploading... {progress}%
                        </span>
                    ) : 'Start Processing'}
                </button>

                {status && (
                    <div className={`mt-6 p-4 rounded-xl border ${status === 'success' ? 'bg-green-50 border-green-100' : status === 'partial' ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'}`}>
                        <div className="flex">
                            <div className="flex-shrink-0">
                                {status === 'success' ? (
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                ) : status === 'partial' ? (
                                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                                ) : (
                                    <AlertCircle className="h-5 w-5 text-red-500" />
                                )}
                            </div>
                            <div className="ml-3">
                                <p className={`text-sm font-medium ${status === 'success' ? 'text-green-800' : status === 'partial' ? 'text-yellow-800' : 'text-red-800'}`}>
                                    {message}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Upload;
