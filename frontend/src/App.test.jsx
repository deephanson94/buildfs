import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import React from 'react';

// Mock API
vi.mock('./api', () => ({
    default: {
        get: vi.fn(() => Promise.resolve({ data: [] })),
        post: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { baseURL: 'http://localhost' }
    }
}));

describe('App/Dashboard Component', () => {
    it('renders the dashboard layout', () => {
        render(<App />);
        expect(screen.getByText(/UnifiedSearch/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Search library/i)).toBeInTheDocument();
        // Check for Upload button
        expect(screen.getByRole('button', { name: /Upload Media/i })).toBeInTheDocument();
    });

    it('opens upload modal when upload button is clicked', () => {
        render(<App />);
        const uploadBtn = screen.getByRole('button', { name: /Upload Media/i });
        fireEvent.click(uploadBtn);
        // "Select Files" is text inside the modal
        expect(screen.getByText(/Select Files/i)).toBeInTheDocument();
    });

    it('renders media list by default', async () => {
        render(<App />);
        // Wait for loading to finish and content to appear
        await waitFor(() => {
            expect(screen.getByText(/Media Library/i)).toBeInTheDocument();
        });
        expect(screen.getByText(/Videos/i)).toBeInTheDocument();
        expect(screen.getByText(/Audio Transcriptions/i)).toBeInTheDocument();
    });
});
