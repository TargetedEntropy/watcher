// Initialize Socket.io connection
const socket = io();

// DOM elements
const urlInput = document.getElementById('urlInput');
const addVideoBtn = document.getElementById('addVideoBtn');
const videoGrid = document.getElementById('videoGrid');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const userCountElement = document.getElementById('userCount');

// Current video state
let currentVideos = [null, null, null, null];
let playlistHistory = [];
let isPanelExpanded = true;
let currentRoom = 'default';

// WebRTC state
let localStream = null;
let webcamEnabled = false;
let peerConnections = new Map(); // Map of peerId -> RTCPeerConnection
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Extract YouTube video ID from various URL formats
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /^([A-Za-z0-9_-]{11})$/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return null;
}

// Create YouTube embed iframe
function createYouTubeEmbed(videoId) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1`;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    return iframe;
}

// Update video slot
function updateVideoSlot(slotIndex, videoId) {
    const slot = document.querySelector(`.video-slot[data-slot="${slotIndex}"]`);
    if (!slot) return;
    
    // Stop any existing video by removing iframe
    const existingIframe = slot.querySelector('iframe');
    if (existingIframe) {
        // Stop the video by removing src first
        existingIframe.src = '';
        existingIframe.remove();
    }
    
    // Clear all content
    slot.innerHTML = '';
    
    if (videoId) {
        // Add new video
        const iframe = createYouTubeEmbed(videoId);
        slot.appendChild(iframe);
        
        // Add remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = () => removeVideo(slotIndex);
        slot.appendChild(removeBtn);
        
        currentVideos[slotIndex] = videoId;
        
    } else {
        // Show empty slot
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-slot';
        emptyDiv.textContent = `Empty Slot ${slotIndex + 1}`;
        slot.appendChild(emptyDiv);
        
        currentVideos[slotIndex] = null;
    }
}

// Find first empty slot
function findEmptySlot() {
    for (let i = 0; i < currentVideos.length; i++) {
        if (!currentVideos[i]) {
            return i;
        }
    }
    return -1;
}

// Fetch video title from YouTube using oEmbed
async function fetchVideoTitle(videoId) {
    try {
        const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        if (response.ok) {
            const data = await response.json();
            return data.title || `Video: ${videoId}`;
        }
        return `Video: ${videoId}`;
    } catch (error) {
        console.error('Error fetching video title:', error);
        return `Video: ${videoId}`;
    }
}

// Add video to grid
async function addVideo(videoId = null, targetSlot = null, fromHistory = false) {
    // Make sure we don't have an event object
    if (videoId && typeof videoId === 'object' && videoId.target) {
        videoId = null;
    }
    
    let vid = videoId;
    let title = null;
    
    if (!vid) {
        const url = urlInput.value.trim();
        if (!url) {
            alert('Please enter a YouTube URL');
            return;
        }
        
        vid = extractVideoId(url);
        if (!vid) {
            alert('Invalid YouTube URL. Please enter a valid YouTube video URL.');
            return;
        }
    }
    
    // If no target slot specified, find an empty one
    const slotIndex = targetSlot !== null ? targetSlot : findEmptySlot();
    
    // Only show alert if trying to add without a specific target and all slots are full
    if (slotIndex === -1 && targetSlot === null) {
        alert('All slots are full. Please remove a video first or drag onto a specific slot to replace.');
        return;
    }
    
    // Allow replacement if a specific slot is targeted
    if (slotIndex === -1) {
        return;
    }
    
    // Get title if not from history
    if (!fromHistory) {
        title = await fetchVideoTitle(vid);
    }
    
    // Send to server
    socket.emit('add-video', {
        slotIndex: slotIndex,
        videoId: vid,
        title: title,
        replaceFromHistory: fromHistory
    });
    
    // Clear input
    if (!videoId) {
        urlInput.value = '';
    }
}

// Remove video from grid
function removeVideo(slotIndex) {
    socket.emit('remove-video', slotIndex);
}

// ===== WebRTC Functions =====

// Create peer connection for a specific peer
async function createPeerConnection(peerId, isInitiator) {
    const peerConnection = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.set(peerId, peerConnection);

    // Add local stream tracks if webcam is enabled
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Handle incoming tracks from peer
    peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        displayPeerWebcam(peerId, remoteStream);
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-ice-candidate', {
                to: peerId,
                candidate: event.candidate
            });
        }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected' ||
            peerConnection.connectionState === 'failed') {
            closePeerConnection(peerId);
        }
    };

    // If initiator, create and send offer
    if (isInitiator) {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('webrtc-offer', {
                to: peerId,
                offer: offer
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    return peerConnection;
}

// Close and cleanup peer connection
function closePeerConnection(peerId) {
    const peerConnection = peerConnections.get(peerId);
    if (peerConnection) {
        peerConnection.close();
        peerConnections.delete(peerId);
    }
    removePeerWebcam(peerId);
}

// Display peer's webcam feed
function displayPeerWebcam(peerId, stream) {
    const webcamFeeds = document.getElementById('webcamFeeds');

    // Remove existing feed if any
    removePeerWebcam(peerId);

    // Create new feed container
    const feedContainer = document.createElement('div');
    feedContainer.className = 'webcam-feed';
    feedContainer.id = `webcam-${peerId}`;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    const label = document.createElement('div');
    label.className = 'webcam-label';
    label.textContent = `Peer ${peerId.substring(0, 6)}`;

    feedContainer.appendChild(video);
    feedContainer.appendChild(label);
    webcamFeeds.appendChild(feedContainer);
}

// Remove peer's webcam feed
function removePeerWebcam(peerId) {
    const feed = document.getElementById(`webcam-${peerId}`);
    if (feed) {
        feed.remove();
    }
}

// Toggle webcam on/off
async function toggleWebcam() {
    if (!webcamEnabled) {
        await enableWebcam();
    } else {
        disableWebcam();
    }
}

// Enable webcam
async function enableWebcam() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240 },
            audio: true
        });

        webcamEnabled = true;
        updateWebcamUI();

        // Add local stream to existing peer connections
        peerConnections.forEach((pc, peerId) => {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        });

        // Notify other peers
        socket.emit('webcam-status', true);

        // Display local feed
        displayLocalWebcam();

    } catch (error) {
        console.error('Error accessing webcam:', error);
        alert('Could not access webcam. Please check permissions.');
    }
}

// Disable webcam
function disableWebcam() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    webcamEnabled = false;
    updateWebcamUI();

    // Remove local feed
    const localFeed = document.getElementById('webcam-local');
    if (localFeed) {
        localFeed.remove();
    }

    // Notify other peers
    socket.emit('webcam-status', false);

    // Close all peer connections and recreate without video
    peerConnections.forEach((pc, peerId) => {
        pc.close();
    });
    peerConnections.clear();
}

// Display local webcam feed
function displayLocalWebcam() {
    const webcamFeeds = document.getElementById('webcamFeeds');

    // Remove existing local feed if any
    const existingLocal = document.getElementById('webcam-local');
    if (existingLocal) {
        existingLocal.remove();
    }

    const feedContainer = document.createElement('div');
    feedContainer.className = 'webcam-feed';
    feedContainer.id = 'webcam-local';

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // Mute local to prevent feedback
    video.srcObject = localStream;

    const label = document.createElement('div');
    label.className = 'webcam-label';
    label.textContent = 'You';

    feedContainer.appendChild(video);
    feedContainer.appendChild(label);

    // Insert at the beginning
    webcamFeeds.insertBefore(feedContainer, webcamFeeds.firstChild);
}

// Update webcam UI state
function updateWebcamUI() {
    const webcamToggle = document.getElementById('webcamToggle');
    const webcamFeeds = document.getElementById('webcamFeeds');

    if (webcamEnabled) {
        webcamToggle.textContent = 'Disable Webcam';
        webcamToggle.classList.add('active');

        // Remove disabled message
        const disabledMsg = webcamFeeds.querySelector('.webcam-disabled-message');
        if (disabledMsg) {
            disabledMsg.remove();
        }
    } else {
        webcamToggle.textContent = 'Enable Webcam';
        webcamToggle.classList.remove('active');

        // Show disabled message if no feeds
        if (webcamFeeds.children.length === 0) {
            webcamFeeds.innerHTML = '<div class="webcam-disabled-message">Enable your webcam to see other participants</div>';
        }
    }
}

// Show/hide webcam panel based on room
function updateWebcamPanelVisibility() {
    const webcamPanel = document.getElementById('webcamPanel');
    // Webcam is now available in all rooms including default
    webcamPanel.classList.add('visible');
}

// Socket event handlers
socket.on('connect', () => {
    statusIndicator.classList.add('connected');
    statusIndicator.classList.remove('disconnected');
    statusText.textContent = 'Connected';

    // Join room from URL or default
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room') || 'default';
    joinRoom(roomId);
});

socket.on('disconnect', () => {
    statusIndicator.classList.remove('connected');
    statusIndicator.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
});

socket.on('initial-state', (videoSlots) => {
    // Update all slots with current state
    videoSlots.forEach((videoId, index) => {
        updateVideoSlot(index, videoId);
    });
});

socket.on('video-updated', (data) => {
    const { slotIndex, videoId } = data;
    updateVideoSlot(slotIndex, videoId);
});

socket.on('video-removed', (slotIndex) => {
    updateVideoSlot(slotIndex, null);
});

// WebRTC signaling event handlers
socket.on('webrtc-offer', async (data) => {
    const { from, offer } = data;

    // Create peer connection if it doesn't exist
    if (!peerConnections.has(from)) {
        await createPeerConnection(from, false);
    }

    const peerConnection = peerConnections.get(from);

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('webrtc-answer', {
            to: from,
            answer: answer
        });
    } catch (error) {
        console.error('Error handling offer:', error);
    }
});

socket.on('webrtc-answer', async (data) => {
    const { from, answer } = data;
    const peerConnection = peerConnections.get(from);

    if (peerConnection) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }
});

socket.on('webrtc-ice-candidate', async (data) => {
    const { from, candidate } = data;
    const peerConnection = peerConnections.get(from);

    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }
});

socket.on('peer-webcam-status', async (data) => {
    const { peerId, enabled } = data;

    if (enabled && webcamEnabled) {
        // Peer enabled webcam, create connection if we have webcam enabled
        if (!peerConnections.has(peerId)) {
            await createPeerConnection(peerId, true);
        }
    } else if (!enabled) {
        // Peer disabled webcam, close connection
        closePeerConnection(peerId);
    }
});

socket.on('peer-disconnected', (peerId) => {
    // Clean up peer connection when they disconnect
    closePeerConnection(peerId);
});

// Event listeners
addVideoBtn.addEventListener('click', () => addVideo());

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addVideo();
    }
});

// Render playlist history
function renderPlaylistHistory() {
    const historyContainer = document.getElementById('playlistHistory');
    if (!historyContainer) return;

    historyContainer.innerHTML = '';

    if (playlistHistory.length === 0) {
        historyContainer.innerHTML = '<div class="empty-history">No videos in history yet</div>';
        return;
    }

    playlistHistory.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.draggable = true;
        historyItem.dataset.videoId = item.videoId;

        // Create thumbnail
        const thumbnail = document.createElement('img');
        thumbnail.className = 'history-thumbnail';
        thumbnail.src = `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`;
        thumbnail.alt = item.title;

        // Create info container
        const info = document.createElement('div');
        info.className = 'history-info';

        const title = document.createElement('div');
        title.className = 'history-title';
        title.textContent = item.title;

        const time = document.createElement('div');
        time.className = 'history-time';
        const date = new Date(item.timestamp);
        time.textContent = date.toLocaleString();

        info.appendChild(title);
        info.appendChild(time);

        historyItem.appendChild(thumbnail);
        historyItem.appendChild(info);

        // Click to add to empty slot (but not when dragging)
        let isDragging = false;
        let dragImageElement = null;

        historyItem.addEventListener('mousedown', () => {
            isDragging = false;
        });

        historyItem.addEventListener('click', (e) => {
            if (!isDragging) {
                addVideo(item.videoId, null, true);
            }
        });

        // Drag and drop
        historyItem.addEventListener('dragstart', (e) => {
            isDragging = true;
            e.dataTransfer.effectAllowed = 'copy';

            // Use JSON for reliable cross-browser data transfer
            const dragData = JSON.stringify({
                videoId: item.videoId,
                fromHistory: true
            });
            e.dataTransfer.setData('application/json', dragData);
            e.dataTransfer.setData('text/plain', item.videoId); // Fallback for compatibility

            historyItem.classList.add('dragging');

            // Create a drag image with proper cleanup
            dragImageElement = historyItem.cloneNode(true);
            dragImageElement.style.position = 'absolute';
            dragImageElement.style.top = '-1000px';
            dragImageElement.style.opacity = '0.5';
            document.body.appendChild(dragImageElement);
            e.dataTransfer.setDragImage(dragImageElement, e.offsetX, e.offsetY);
        });

        historyItem.addEventListener('dragend', (e) => {
            isDragging = false;
            historyItem.classList.remove('dragging');

            // Clean up drag image to prevent memory leak
            if (dragImageElement && dragImageElement.parentNode) {
                document.body.removeChild(dragImageElement);
                dragImageElement = null;
            }
        });

        historyContainer.appendChild(historyItem);
    });
}

// Setup drag and drop for video slots
function setupSlotDragAndDrop() {
    document.querySelectorAll('.video-slot').forEach(slot => {
        slot.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            slot.classList.add('drag-over');
        });
        
        slot.addEventListener('dragleave', () => {
            slot.classList.remove('drag-over');
        });
        
        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            slot.classList.remove('drag-over');

            const slotIndex = parseInt(slot.dataset.slot);

            // Try JSON format first (new format), then fallback to text/plain
            try {
                const jsonData = e.dataTransfer.getData('application/json');
                if (jsonData) {
                    const dragData = JSON.parse(jsonData);
                    if (dragData.videoId && slotIndex >= 0) {
                        addVideo(dragData.videoId, slotIndex, dragData.fromHistory || false);
                        return;
                    }
                }
            } catch (error) {
                console.error('Error parsing drag data:', error);
            }

            // Fallback to text/plain for backward compatibility
            const videoId = e.dataTransfer.getData('text/plain');
            if (videoId && slotIndex >= 0) {
                addVideo(videoId, slotIndex, false);
            }
        });
    });
}

// Setup panel toggle
function setupPanelToggle() {
    const toggleBtn = document.getElementById('togglePanel');
    const panel = document.querySelector('.playlist-panel');
    const icon = document.querySelector('.toggle-icon');
    
    if (toggleBtn && panel && icon) {
        toggleBtn.addEventListener('click', () => {
            isPanelExpanded = !isPanelExpanded;
            panel.classList.toggle('collapsed', !isPanelExpanded);
            icon.textContent = isPanelExpanded ? '◀' : '▶';
        });
    }
}

// Handle playlist history update
socket.on('playlist-history', (history) => {
    playlistHistory = history;
    renderPlaylistHistory();
});

socket.on('history-updated', (history) => {
    playlistHistory = history;
    renderPlaylistHistory();
});

// Handle user count updates
socket.on('user-count', (count) => {
    if (userCountElement) {
        userCountElement.textContent = `(${count} ${count === 1 ? 'user' : 'users'} connected)`;
    }
});

// Room management functions
function joinRoom(roomId) {
    socket.emit('join-room', roomId, (response) => {
        if (response.success) {
            currentRoom = response.roomId;
            updateRoomDisplay();
        }
    });
}

function createRoom() {
    socket.emit('create-room', (response) => {
        if (response.success) {
            currentRoom = response.roomId;
            updateRoomDisplay();
            updateURL();
        }
    });
}

function updateRoomDisplay() {
    document.getElementById('currentRoom').textContent = currentRoom;
    document.getElementById('modalCurrentRoom').textContent = currentRoom;
    updateWebcamPanelVisibility();
}

function updateURL() {
    if (currentRoom !== 'default') {
        const url = new URL(window.location);
        url.searchParams.set('room', currentRoom);
        window.history.replaceState({}, '', url);
    } else {
        const url = new URL(window.location);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url);
    }
}

function shareRoom() {
    if (currentRoom === 'default') {
        alert('Cannot share the default room');
        return;
    }

    const shareUrl = new URL(window.location.origin);
    shareUrl.searchParams.set('room', currentRoom);

    navigator.clipboard.writeText(shareUrl.toString()).then(() => {
        alert('Room link copied to clipboard!');
    }).catch(() => {
        prompt('Copy this link to share the room:', shareUrl.toString());
    });
}

// Socket events for room management
socket.on('room-created', (data) => {
    currentRoom = data.roomId;
    updateRoomDisplay();
    updateURL();
});

socket.on('room-joined', (data) => {
    currentRoom = data.roomId;
    updateRoomDisplay();
    updateURL();

    // If webcam is enabled in new room, notify others
    if (webcamEnabled) {
        socket.emit('webcam-status', true);
    }
});

// Setup modal functionality
function setupModal() {
    const modal = document.getElementById('roomModal');
    const roomMenuBtn = document.getElementById('roomMenuBtn');
    const closeModal = document.getElementById('closeModal');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const joinRoomInput = document.getElementById('joinRoomInput');
    const shareRoomBtn = document.getElementById('shareRoomBtn');

    // Open modal
    roomMenuBtn?.addEventListener('click', () => {
        modal.style.display = 'block';
        updateRoomDisplay();
    });

    // Close modal
    closeModal?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'block') {
            modal.style.display = 'none';
        }
    });

    // Create room
    createRoomBtn?.addEventListener('click', () => {
        createRoom();
        modal.style.display = 'none';
    });

    // Join room
    joinRoomBtn?.addEventListener('click', () => {
        const roomId = joinRoomInput.value.trim().toUpperCase();
        if (roomId) {
            joinRoom(roomId);
            joinRoomInput.value = '';
            modal.style.display = 'none';
        } else {
            alert('Please enter a room code');
        }
    });

    // Join room on Enter
    joinRoomInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinRoomBtn.click();
        }
    });

    // Share room
    shareRoomBtn?.addEventListener('click', shareRoom);

    // Auto-uppercase room input
    joinRoomInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
}

// Setup webcam controls
function setupWebcamControls() {
    const webcamToggle = document.getElementById('webcamToggle');

    if (webcamToggle) {
        webcamToggle.addEventListener('click', toggleWebcam);
    }
}

// Initialize UI components
document.addEventListener('DOMContentLoaded', () => {
    setupSlotDragAndDrop();
    setupPanelToggle();
    setupModal();
    setupWebcamControls();
});

// Initial connection status
statusIndicator.classList.add('disconnected');
statusText.textContent = 'Connecting...';