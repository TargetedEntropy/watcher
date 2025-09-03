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
let playlistHistory = [];
let isPanelExpanded = true;

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
    
    const slotIndex = targetSlot !== null ? targetSlot : findEmptySlot();
    if (slotIndex === -1) {
        alert('All slots are full. Please remove a video first.');
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
        
        // Click to add to empty slot
        historyItem.addEventListener('click', () => {
            addVideo(item.videoId, null, true);
        });
        
        // Drag and drop
        historyItem.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('videoId', item.videoId);
            e.dataTransfer.setData('fromHistory', 'true');
            historyItem.classList.add('dragging');
        });
        
        historyItem.addEventListener('dragend', () => {
            historyItem.classList.remove('dragging');
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
            slot.classList.remove('drag-over');
            
            const videoId = e.dataTransfer.getData('videoId');
            const fromHistory = e.dataTransfer.getData('fromHistory') === 'true';
            const slotIndex = parseInt(slot.dataset.slot);
            
            if (videoId && slotIndex >= 0) {
                addVideo(videoId, slotIndex, fromHistory);
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

// Initialize UI components
document.addEventListener('DOMContentLoaded', () => {
    setupSlotDragAndDrop();
    setupPanelToggle();
});

// Initial connection status
statusIndicator.classList.add('disconnected');
statusText.textContent = 'Connecting...';