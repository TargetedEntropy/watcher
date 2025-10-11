# Multi-Video Watcher

A real-time web application that allows multiple users to watch YouTube videos together in a synchronized 2x2 grid layout with room support, playlist history, and drag-and-drop functionality.

## Features

- **2x2 Video Grid**: Display up to 4 YouTube videos simultaneously
- **Multi-Room Support**: Create private rooms with shareable codes or join the default public room
- **Real-time Synchronization**: All users in the same room see identical videos instantly
- **Playlist History**: Automatically tracks all videos added to the room (up to 50)
- **Drag & Drop**: Drag videos from history panel directly onto any video slot
- **Live User Count**: See how many people are watching in your room
- **Simple URL Input**: Add videos using standard YouTube URLs, short links, or video IDs
- **Easy Video Management**: Remove videos with a simple hover button
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Live Connection Status**: Visual indicator shows connection state

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd watcher
```

2. Install dependencies:
```bash
npm install
```

## Usage

1. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. **Room Management**:
   - Click the gear icon (⚙️) in the header to open room management
   - **Create a new room**: Generate a unique 6-character room code
   - **Join a room**: Enter a room code to join an existing session
   - **Share room**: Copy the URL to share with others
   - By default, you'll join the "default" public room

4. **Adding Videos**:
   - Paste a YouTube URL in the input field
   - Click "Add Video" or press Enter
   - The video appears in the first available slot
   - Videos are automatically added to playlist history

5. **Using Playlist History**:
   - **Click** any history item to add it to the first empty slot
   - **Drag** any history item onto a video slot to replace that video
   - History is shared across all users in the room
   - Toggle panel visibility with the arrow button

6. **Removing Videos**:
   - Hover over any video slot
   - Click the "Remove" button that appears

## How It Works

The application uses WebSocket connections (via Socket.io) to maintain synchronized state across all connected clients. When any user adds or removes a video, the change is instantly broadcast to all other users in the same room.

### Room System
- Each room maintains its own independent state (videos, history, user count)
- Room codes are 6-character alphanumeric identifiers (e.g., ABC123)
- Empty rooms are automatically cleaned up (except the default room)
- Rooms persist as long as at least one user is connected

### Supported YouTube URL Formats

- Standard: `https://www.youtube.com/watch?v=VIDEO_ID`
- Short: `https://youtu.be/VIDEO_ID`
- Direct ID: `VIDEO_ID`

## Technical Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Real-time Communication**: WebSocket (Socket.io)

## Socket.io Events

### Client → Server
- `create-room`: Create a new room with generated code
- `join-room`: Join an existing room by code
- `add-video`: Add video to specific slot with metadata
- `remove-video`: Remove video from slot

### Server → Client
- `room-created`: Confirm room creation and provide room ID
- `room-joined`: Confirm successful room join
- `initial-state`: Send current video state to new connections
- `video-updated`: Broadcast video addition to room
- `video-removed`: Broadcast video removal from room
- `playlist-history`: Send playlist history for current room
- `history-updated`: Broadcast playlist history update
- `user-count`: Update connected user count

## Configuration

The server runs on port 3000 by default. To use a different port, set the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## Browser Compatibility

Works on all modern browsers that support:
- WebSocket connections
- YouTube iframe embeds
- CSS Grid layout
- Drag and Drop API

## Notes

- Videos autoplay muted to comply with browser autoplay policies
- Maximum of 4 videos can be displayed simultaneously
- Playlist history limited to 50 most recent videos per room
- All users in the same room share the same video grid and history
- Drag and drop works from history panel to any video slot

## License

MIT
