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
const MAX_CHAT_HISTORY = 100;

// Default room configuration
function createRoom(roomId) {
    return {
        id: roomId,
        videoSlots: [null, null, null, null],
        playlistHistory: [],
        chatHistory: [],
        connectedUsers: 0,
        webcamUsers: new Set(), // Track users with webcam enabled
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
        socket.emit('chat-history', room.chatHistory);
        io.to(roomId).emit('user-count', room.connectedUsers);

        // Add system message for user join
        const joinMessage = {
            id: Date.now() + Math.random(),
            type: 'system',
            message: `${socket.username || 'User ' + socket.id.substring(0, 6)} joined the room`,
            timestamp: new Date().toISOString()
        };
        room.chatHistory.push(joinMessage);
        if (room.chatHistory.length > MAX_CHAT_HISTORY) {
            room.chatHistory = room.chatHistory.slice(-MAX_CHAT_HISTORY);
        }
        io.to(roomId).emit('user-joined-chat', joinMessage);

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
        socket.emit('chat-history', room.chatHistory);
        io.to(roomId).emit('user-count', room.connectedUsers);

        // Add system message for user join
        const joinMessage = {
            id: Date.now() + Math.random(),
            type: 'system',
            message: `${socket.username || 'User ' + socket.id.substring(0, 6)} joined the room`,
            timestamp: new Date().toISOString()
        };
        room.chatHistory.push(joinMessage);
        if (room.chatHistory.length > MAX_CHAT_HISTORY) {
            room.chatHistory = room.chatHistory.slice(-MAX_CHAT_HISTORY);
        }
        io.to(roomId).emit('user-joined-chat', joinMessage);

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
        socket.emit('chat-history', defaultRoom.chatHistory);
        io.to('default').emit('user-count', defaultRoom.connectedUsers);

        // Add system message for user join
        const joinMessage = {
            id: Date.now() + Math.random(),
            type: 'system',
            message: `${socket.username || 'User ' + socket.id.substring(0, 6)} joined the room`,
            timestamp: new Date().toISOString()
        };
        defaultRoom.chatHistory.push(joinMessage);
        if (defaultRoom.chatHistory.length > MAX_CHAT_HISTORY) {
            defaultRoom.chatHistory = defaultRoom.chatHistory.slice(-MAX_CHAT_HISTORY);
        }
        io.to('default').emit('user-joined-chat', joinMessage);
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
        const room = getRoom(socket.roomId);

        if (enabled) {
            // Add user to webcam users set
            room.webcamUsers.add(socket.id);

            // Send list of existing webcam users to this user
            const existingWebcamUsers = Array.from(room.webcamUsers).filter(id => id !== socket.id);
            socket.emit('existing-webcam-users', existingWebcamUsers);

            // Broadcast to others that this user enabled webcam
            socket.to(socket.roomId).emit('peer-webcam-status', {
                peerId: socket.id,
                enabled: true
            });
        } else {
            // Remove user from webcam users set
            room.webcamUsers.delete(socket.id);

            // Broadcast to others that this user disabled webcam
            socket.to(socket.roomId).emit('peer-webcam-status', {
                peerId: socket.id,
                enabled: false
            });
        }
    });

    // Handle username setting
    socket.on('set-username', (username) => {
        if (username && username.trim()) {
            socket.username = username.trim();
            console.log(`User ${socket.id} set username to: ${socket.username}`);
        }
    });

    // Handle chat messages
    socket.on('send-message', (data) => {
        const room = getRoom(socket.roomId);

        if (!room || !data.message || !data.message.trim()) {
            return;
        }

        const messageObject = {
            id: Date.now() + Math.random(),
            type: 'user',
            message: data.message.trim(),
            timestamp: new Date().toISOString(),
            username: socket.username || `User ${socket.id.substring(0, 6)}`,
            socketId: socket.id
        };

        // Add to room's chat history
        room.chatHistory.push(messageObject);

        // Limit chat history size (FIFO)
        if (room.chatHistory.length > MAX_CHAT_HISTORY) {
            room.chatHistory = room.chatHistory.slice(-MAX_CHAT_HISTORY);
        }

        // Broadcast to all users in the room
        io.to(socket.roomId).emit('receive-message', messageObject);

        console.log(`Message in room ${socket.roomId} from ${messageObject.username}: ${data.message.substring(0, 50)}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        // Notify room that this peer disconnected (for webcam cleanup)
        if (socket.roomId) {
            socket.to(socket.roomId).emit('peer-disconnected', socket.id);

            const room = rooms.get(socket.roomId);
            if (room) {
                // Remove from webcam users if present
                room.webcamUsers.delete(socket.id);

                // Add system message for user leave
                const leaveMessage = {
                    id: Date.now() + Math.random(),
                    type: 'system',
                    message: `${socket.username || 'User ' + socket.id.substring(0, 6)} left the room`,
                    timestamp: new Date().toISOString()
                };
                room.chatHistory.push(leaveMessage);
                if (room.chatHistory.length > MAX_CHAT_HISTORY) {
                    room.chatHistory = room.chatHistory.slice(-MAX_CHAT_HISTORY);
                }
                io.to(socket.roomId).emit('user-left-chat', leaveMessage);

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