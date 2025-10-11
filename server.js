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

// Store rooms data - each room has its own state
let rooms = new Map();
const MAX_HISTORY_SIZE = 50;

// Default room configuration
function createRoom(roomId) {
    return {
        id: roomId,
        videoSlots: [null, null, null, null],
        playlistHistory: [],
        connectedUsers: 0,
        createdAt: new Date().toISOString()
    };
}

// Get or create room
function getRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, createRoom(roomId));
    }
    return rooms.get(roomId);
}

// Generate random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Serve static files
app.use(express.static(path.join(__dirname)));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Handle room creation
    socket.on('create-room', (callback) => {
        const roomId = generateRoomId();
        const room = getRoom(roomId);
        socket.join(roomId);
        socket.roomId = roomId;
        room.connectedUsers++;

        console.log(`Room created: ${roomId}`);

        // Send room info and initial state
        socket.emit('room-created', { roomId });
        socket.emit('initial-state', room.videoSlots);
        socket.emit('playlist-history', room.playlistHistory);
        io.to(roomId).emit('user-count', room.connectedUsers);

        if (callback) callback({ success: true, roomId });
    });

    // Handle room joining
    socket.on('join-room', (roomId, callback) => {
        if (!roomId) roomId = 'default';

        const room = getRoom(roomId);
        socket.join(roomId);
        socket.roomId = roomId;
        room.connectedUsers++;

        console.log(`Client ${socket.id} joined room: ${roomId}`);

        // Send room info and initial state
        socket.emit('room-joined', { roomId });
        socket.emit('initial-state', room.videoSlots);
        socket.emit('playlist-history', room.playlistHistory);
        io.to(roomId).emit('user-count', room.connectedUsers);

        if (callback) callback({ success: true, roomId });
    });

    // Auto-join default room if no room specified
    if (!socket.roomId) {
        const defaultRoom = getRoom('default');
        socket.join('default');
        socket.roomId = 'default';
        defaultRoom.connectedUsers++;

        socket.emit('room-joined', { roomId: 'default' });
        socket.emit('initial-state', defaultRoom.videoSlots);
        socket.emit('playlist-history', defaultRoom.playlistHistory);
        io.to('default').emit('user-count', defaultRoom.connectedUsers);
    }
    
    // Handle video addition
    socket.on('add-video', (data) => {
        const { slotIndex, videoId, title, replaceFromHistory } = data;
        const room = getRoom(socket.roomId);

        if (slotIndex >= 0 && slotIndex < 4 && videoId && room) {
            room.videoSlots[slotIndex] = videoId;

            // Add to history if it's a new video (not from history)
            if (!replaceFromHistory) {
                const historyItem = {
                    videoId,
                    title: title || videoId,
                    timestamp: new Date().toISOString(),
                    id: Date.now() + Math.random() // Simple unique ID
                };

                // Check if video already exists in history (case-insensitive)
                const existingIndex = room.playlistHistory.findIndex(
                    item => item.videoId.toLowerCase() === videoId.toLowerCase()
                );
                if (existingIndex === -1) {
                    // Add to beginning of history
                    room.playlistHistory.unshift(historyItem);

                    // Limit history size
                    if (room.playlistHistory.length > MAX_HISTORY_SIZE) {
                        room.playlistHistory = room.playlistHistory.slice(0, MAX_HISTORY_SIZE);
                    }

                    // Broadcast updated history to room clients
                    io.to(socket.roomId).emit('history-updated', room.playlistHistory);
                }
            }

            // Broadcast to room clients including sender
            io.to(socket.roomId).emit('video-updated', {
                slotIndex,
                videoId
            });

            console.log(`Video added to slot ${slotIndex} in room ${socket.roomId}: ${videoId}`);
        }
    });
    
    // Handle video removal
    socket.on('remove-video', (slotIndex) => {
        const room = getRoom(socket.roomId);

        if (slotIndex >= 0 && slotIndex < 4 && room) {
            room.videoSlots[slotIndex] = null;

            // Broadcast to room clients including sender
            io.to(socket.roomId).emit('video-removed', slotIndex);

            console.log(`Video removed from slot ${slotIndex} in room ${socket.roomId}`);
        }
    });

    // WebRTC signaling events for webcam support
    socket.on('webrtc-offer', (data) => {
        // Forward offer to specific peer
        socket.to(data.to).emit('webrtc-offer', {
            from: socket.id,
            offer: data.offer
        });
    });

    socket.on('webrtc-answer', (data) => {
        // Forward answer to specific peer
        socket.to(data.to).emit('webrtc-answer', {
            from: socket.id,
            answer: data.answer
        });
    });

    socket.on('webrtc-ice-candidate', (data) => {
        // Forward ICE candidate to specific peer
        socket.to(data.to).emit('webrtc-ice-candidate', {
            from: socket.id,
            candidate: data.candidate
        });
    });

    socket.on('webcam-status', (enabled) => {
        // Broadcast webcam status to room
        socket.to(socket.roomId).emit('peer-webcam-status', {
            peerId: socket.id,
            enabled: enabled
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        // Notify room that this peer disconnected (for webcam cleanup)
        if (socket.roomId) {
            socket.to(socket.roomId).emit('peer-disconnected', socket.id);

            const room = rooms.get(socket.roomId);
            if (room) {
                // Prevent negative user count
                room.connectedUsers = Math.max(0, room.connectedUsers - 1);

                // Send updated user count to remaining room clients
                io.to(socket.roomId).emit('user-count', room.connectedUsers);

                // Clean up empty rooms (except default) with delay to prevent race conditions
                if (room.connectedUsers === 0 && socket.roomId !== 'default') {
                    const roomIdToCleanup = socket.roomId;
                    setTimeout(() => {
                        const roomCheck = rooms.get(roomIdToCleanup);
                        if (roomCheck && roomCheck.connectedUsers === 0) {
                            rooms.delete(roomIdToCleanup);
                            console.log(`Room ${roomIdToCleanup} deleted (empty)`);
                        }
                    }, 5000);
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});