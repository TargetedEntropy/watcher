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

// Serve static files
app.use(express.static(path.join(__dirname)));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Send current video state to new client
    socket.emit('initial-state', videoSlots);
    
    // Handle video addition
    socket.on('add-video', (data) => {
        const { slotIndex, videoId } = data;
        
        if (slotIndex >= 0 && slotIndex < 4) {
            videoSlots[slotIndex] = videoId;
            
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
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});