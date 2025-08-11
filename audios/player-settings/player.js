function initializePlayer(playbackId) {
  const video = document.getElementById('video');
  const playBtn = document.getElementById('play');
  const backBtn = document.getElementById('back');
  const forwardBtn = document.getElementById('forward');
  const volumeSlider = document.getElementById('volume');
  const volumeIcon = document.getElementById('volume-icon');
  const speedSelect = document.getElementById('speed');
  const seekSlider = document.getElementById('seek');
  const timeLabel = document.getElementById('time');

  const proxyUrl = `https://puedocrecer.com/jwt-proxy/jwt-proxy.php?playback_id=${playbackId}`;

  // Enhanced error handling and retry logic for VPN/cache issues
  async function loadVideoWithRetry(retries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Loading video - attempt ${attempt}/${retries}`);
        
        // Add cache busting parameter and timeout to handle VPN issues
        const cacheBuster = Date.now();
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), 10000); // 10 second timeout
        
        const response = await fetch(`${proxyUrl}&_cb=${cacheBuster}`, {
          signal: timeoutController.signal,
          cache: 'no-cache', // Force fresh request
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.m3u8_url) {
          throw new Error('No m3u8_url in response');
        }
        
        const videoSrc = data.m3u8_url;
        console.log('Successfully loaded video source');
        
        // Initialize HLS with error recovery
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: false, // Disable worker to avoid VPN issues
            maxRetries: 3,
            retryDelay: 1000,
            maxRetryDelay: 3000,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 10,
            // Enhanced error recovery
            xhrSetup: function(xhr, url) {
              xhr.timeout = 8000; // 8 second timeout for segments
            }
          });
          
          hls.on(Hls.Events.ERROR, function (event, data) {
            console.warn('HLS Error:', data);
            if (data.fatal) {
              switch(data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.log('Network error, trying to recover...');
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.log('Media error, trying to recover...');
                  hls.recoverMediaError();
                  break;
                default:
                  console.log('Fatal error, destroying HLS instance');
                  hls.destroy();
                  // Try to reload after a short delay
                  setTimeout(() => {
                    if (attempt < retries) {
                      loadVideoWithRetry(retries, delay * 2);
                    }
                  }, 2000);
                  break;
              }
            }
          });
          
          hls.loadSource(videoSrc);
          hls.attachMedia(video);
          
          // Store hls instance for cleanup
          video._hlsInstance = hls;
          
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoSrc;
        } else {
          throw new Error('Browser does not support HLS playback');
        }
        
        return; // Success, exit retry loop
        
      } catch (err) {
        console.warn(`Attempt ${attempt} failed:`, err.message);
        
        if (attempt === retries) {
          // All retries exhausted
          let errorMessage = 'Failed to load video stream.';
          
          if (err.name === 'AbortError') {
            errorMessage += ' Request timed out. Please check your connection.';
          } else if (err.message.includes('fetch')) {
            errorMessage += ' Network error. Try clearing your browser cache or disabling VPN temporarily.';
          } else {
            errorMessage += ` ${err.message}`;
          }
          
          alert(errorMessage);
          return;
        }
        
        // Wait before next attempt with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }

  // Start loading with retry logic
  loadVideoWithRetry();

  // Volume slider toggle functionality
  volumeIcon.addEventListener('click', () => {
    volumeSlider.classList.toggle('expanded');
  });

  // Close volume slider when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.volume-container')) {
      volumeSlider.classList.remove('expanded');
    }
  });

  playBtn.addEventListener('click', () => {
    if (video.paused) {
      video.play().catch(err => {
        console.warn('Play failed:', err);
        // Try to reload the video source if play fails
        if (video._hlsInstance) {
          video._hlsInstance.startLoad();
        }
      });
      playBtn.textContent = '⏸️';
    } else {
      video.pause();
      playBtn.textContent = '▶️';
    }
  });

  backBtn.addEventListener('click', () => {
    video.currentTime = Math.max(0, video.currentTime - 5);
  });

  forwardBtn.addEventListener('click', () => {
    video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
  });

  volumeSlider.addEventListener('input', () => {
    video.volume = volumeSlider.value;
  });

  speedSelect.addEventListener('change', () => {
    video.playbackRate = parseFloat(speedSelect.value);
  });

  video.addEventListener('timeupdate', () => {
    if (video.duration) {
      seekSlider.value = video.currentTime;
      updateTime();
    }
  });

  video.addEventListener('loadedmetadata', () => {
    seekSlider.max = video.duration;
    video.loop = true; // Ensure loop is enabled
    updateTime();
  });

  // Add error event listener for video element
  video.addEventListener('error', (e) => {
    console.error('Video error:', e);
    // Try to reload video source on error
    setTimeout(() => {
      loadVideoWithRetry(2, 2000); // Retry with fewer attempts
    }, 1000);
  });

  // Handle network state changes (useful for mobile/VPN scenarios)
  video.addEventListener('waiting', () => {
    console.log('Video is waiting for data...');
  });

  video.addEventListener('canplay', () => {
    console.log('Video can start playing');
  });

  seekSlider.addEventListener('input', () => {
    if (video.duration) {
      video.currentTime = Math.min(seekSlider.value, video.duration);
    }
  });

  function updateTime() {
    const format = sec => {
      if (isNaN(sec) || !isFinite(sec)) return '0:00';
      const minutes = Math.floor(sec / 60);
      const seconds = Math.floor(sec % 60).toString().padStart(2, '0');
      return `${minutes}:${seconds}`;
    };
    
    const currentTime = video.currentTime || 0;
    const duration = video.duration || 0;
    
    timeLabel.textContent = `${format(currentTime)} / ${format(duration)}`;
  }

  // Cleanup function to prevent memory leaks
  window.addEventListener('beforeunload', () => {
    if (video._hlsInstance) {
      video._hlsInstance.destroy();
    }
  });

  // Initial time display
  updateTime();
}
