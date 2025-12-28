# Unified Search - Frontend

React-based frontend for the Unified Media Search application.

## Tech Stack
- **Framework**: React 19 + Vite
- **Styling**: TailwindCSS
- **Icons**: Lucide React
- **HTTP Client**: Axios

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

The app runs at `http://localhost:5173` by default.

## Testing

```bash
# Run tests
npm test
```

## Building

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── Dashboard.jsx    # Main layout with search bar
│   ├── MediaList.jsx    # Media library grid
│   ├── SearchResults.jsx# Search results display
│   ├── Upload.jsx       # File upload modal
│   ├── VideoModal.jsx   # Video detail modal
│   └── AudioModal.jsx   # Audio detail modal
├── App.jsx              # App entry point
├── api.js               # Axios instance
└── main.jsx             # React root
```
