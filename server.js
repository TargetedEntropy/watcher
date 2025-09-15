const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Store current video state
let videoSlots = [null, null, null, null];

// Store playlist history (max 50 items)
let playlistHistory = [];
const MAX_HISTORY_SIZE = 50;

// Track connected users count
let connectedUsers = 0;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Increment connected users count
    connectedUsers++;

    // Send current video state and history to new client
    socket.emit('initial-state', videoSlots);
    socket.emit('playlist-history', playlistHistory);

    // Send user count to all clients
    io.emit('user-count', connectedUsers);
    
    // Handle video addition
    socket.on('add-video', (data) => {
        const { slotIndex, videoId, title, replaceFromHistory } = data;
        
        if (slotIndex >= 0 && slotIndex < 4 && videoId) {
            videoSlots[slotIndex] = videoId;
            
            // Add to history if it's a new video (not from history)
            if (!replaceFromHistory) {
                const historyItem = {
                    videoId,
                    title: title || videoId,
                    timestamp: new Date().toISOString(),
                    id: Date.now() + Math.random() // Simple unique ID
                };
                
                // Check if video already exists in history
                const existingIndex = playlistHistory.findIndex(item => item.videoId === videoId);
                if (existingIndex === -1) {
                    // Add to beginning of history
                    playlistHistory.unshift(historyItem);
                    
                    // Limit history size
                    if (playlistHistory.length > MAX_HISTORY_SIZE) {
                        playlistHistory = playlistHistory.slice(0, MAX_HISTORY_SIZE);
                    }
                    
                    // Broadcast updated history to all clients
                    io.emit('history-updated', playlistHistory);
                }
            }
            
            // Broadcast to all clients including sender
            io.emit('video-updated', {
                slotIndex,
                videoId
            });
            
            console.log(`Video added to slot ${slotIndex}: ${videoId}`);
        }
    });
    
    // Handle video removal
    socket.on('remove-video', (slotIndex) => {
        if (slotIndex >= 0 && slotIndex < 4) {
            videoSlots[slotIndex] = null;
            
            // Broadcast to all clients including sender
            io.emit('video-removed', slotIndex);
            
            console.log(`Video removed from slot ${slotIndex}`);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        // Decrement connected users count
        connectedUsers--;

        // Send updated user count to all remaining clients
        io.emit('user-count', connectedUsers);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});