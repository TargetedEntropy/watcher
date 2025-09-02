# Multi-Video Watcher

A real-time web application that allows multiple users to watch YouTube videos together in a synchronized 2x2 grid layout.

## Features

- **2x2 Video Grid**: Display up to 4 YouTube videos simultaneously
- **Real-time Synchronization**: All connected users see the same videos instantly
- **Simple URL Input**: Add videos using standard YouTube URLs
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

3. Add YouTube videos by:
   - Pasting a YouTube URL in the input field
   - Clicking "Add Video" or pressing Enter
   - The video will appear in the first available slot

4. Remove videos by:
   - Hovering over any video
   - Clicking the "Remove" button that appears

## How It Works

The application uses WebSocket connections (via Socket.io) to maintain synchronized state across all connected clients. When any user adds or removes a video, the change is instantly broadcast to all other users.

### Supported YouTube URL Formats

- Standard: `https://www.youtube.com/watch?v=VIDEO_ID`
- Short: `https://youtu.be/VIDEO_ID`
- Direct ID: `VIDEO_ID`

## Technical Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Real-time Communication**: WebSocket (Socket.io)

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

## Notes

- Videos autoplay muted to comply with browser autoplay policies
- Maximum of 4 videos can be displayed simultaneously
- All users connected to the same server instance share the same video grid

## License

MIT