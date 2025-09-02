// Initialize Socket.io connection
const socket = io();

// DOM elements
const urlInput = document.getElementById('urlInput');
const addVideoBtn = document.getElementById('addVideoBtn');
const videoGrid = document.getElementById('videoGrid');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');

// Current video state
let currentVideos = [null, null, null, null];

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
    
    // Clear existing content
    slot.innerHTML = '';
    
    if (videoId) {
        // Add video
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

// Add video to grid
function addVideo() {
    const url = urlInput.value.trim();
    if (!url) {
        alert('Please enter a YouTube URL');
        return;
    }
    
    const videoId = extractVideoId(url);
    if (!videoId) {
        alert('Invalid YouTube URL. Please enter a valid YouTube video URL.');
        return;
    }
    
    const emptySlot = findEmptySlot();
    if (emptySlot === -1) {
        alert('All slots are full. Please remove a video first.');
        return;
    }
    
    // Send to server
    socket.emit('add-video', {
        slotIndex: emptySlot,
        videoId: videoId
    });
    
    // Clear input
    urlInput.value = '';
}

// Remove video from grid
function removeVideo(slotIndex) {
    socket.emit('remove-video', slotIndex);
}

// Socket event handlers
socket.on('connect', () => {
    statusIndicator.classList.add('connected');
    statusIndicator.classList.remove('disconnected');
    statusText.textContent = 'Connected';
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

// Event listeners
addVideoBtn.addEventListener('click', addVideo);

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addVideo();
    }
});

// Initial connection status
statusIndicator.classList.add('disconnected');
statusText.textContent = 'Connecting...';