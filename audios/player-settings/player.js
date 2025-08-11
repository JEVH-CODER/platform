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
  async function loadVideoWithRetry(retries = 5, delay = 2000) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Loading video - attempt ${attempt}/${retries}`);
        
        // Progressive timeout increase for VPN instability
        const timeout = Math.min(15000, 5000 + (attempt * 2000));
        const cacheBuster = Date.now() + Math.random();
        
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), timeout);
        
        // Try multiple connection strategies
        const fetchOptions = {
          signal: timeoutController.signal,
          cache: 'no-store',
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            'User-Agent': navigator.userAgent
          }
        };
        
        const response = await fetch(`${proxyUrl}&_cb=${cacheBuster}&_retry=${attempt}`, fetchOptions);
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const responseText = await response.text();
        let data;
        
        try {
          data = JSON.parse(responseText);
        } catch (parseErr) {
          throw new Error('Invalid JSON response from server');
        }
        
        if (!data.m3u8_url) {
          throw new Error('No m3u8_url in response');
        }
        
        const videoSrc = data.m3u8_url;
        console.log('Successfully loaded video source');
        
        // Initialize HLS with aggressive retry settings
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: false,
            maxRetries: 5,
            retryDelay: 2000,
            maxRetryDelay: 8000,
            maxMaxRetryDelay: 8000,
            liveSyncDurationCount: 2,
            liveMaxLatencyDurationCount: 5,
            manifestLoadingTimeOut: 15000,
            manifestLoadingMaxRetry: 3,
            levelLoadingTimeOut: 15000,
            levelLoadingMaxRetry: 3,
            fragLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 4,
            xhrSetup: function(xhr, url) {
              xhr.timeout = 20000;
              xhr.withCredentials = false;
            }
          });
          
          let hlsErrorCount = 0;
          const maxHlsErrors = 5;
          
          hls.on(Hls.Events.ERROR, function (event, data) {
            console.warn('HLS Error:', data);
            hlsErrorCount++;
            
            if (data.fatal) {
              switch(data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.log(`Network error ${hlsErrorCount}/${maxHlsErrors}, trying to recover...`);
                  if (hlsErrorCount < maxHlsErrors) {
                    setTimeout(() => {
                      hls.startLoad();
                    }, 1000);
                  } else {
                    console.log('Max HLS network errors reached, full retry...');
                    hls.destroy();
                    setTimeout(() => loadVideoWithRetry(Math.max(1, retries - attempt), delay), 3000);
                  }
                  break;
                  
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.log(`Media error ${hlsErrorCount}/${maxHlsErrors}, trying to recover...`);
                  if (hlsErrorCount < maxHlsErrors) {
                    setTimeout(() => {
                      hls.recoverMediaError();
                    }, 1000);
                  } else {
                    console.log('Max HLS media errors reached, full retry...');
                    hls.destroy();
                    setTimeout(() => loadVideoWithRetry(Math.max(1, retries - attempt), delay), 3000);
                  }
                  break;
                  
                default:
                  console.log('Fatal HLS error, destroying instance');
                  hls.destroy();
                  if (attempt < retries) {
                    setTimeout(() => loadVideoWithRetry(Math.max(1, retries - attempt), delay), 2000);
                  }
                  break;
              }
            }
          });
          
          // Success events
          hls.on(Hls.Events.MANIFEST_LOADED, function() {
            console.log('HLS manifest loaded successfully');
            hlsErrorCount = 0; // Reset error count on success
          });
          
          hls.loadSource(videoSrc);
          hls.attachMedia(video);
          video._hlsInstance = hls;
          
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoSrc;
        } else {
          throw new Error('Browser does not support HLS playback');
        }
        
        return; // Success, exit retry loop
        
      } catch (err) {
        lastError = err;
        console.warn(`Attempt ${attempt}/${retries} failed:`, err.message);
        
        if (attempt === retries) {
          // All retries exhausted - show user-friendly message
          let errorMessage;
          
          if (err.name === 'AbortError') {
            errorMessage = 'Connection timed out. This might be due to a slow connection or VPN issues. Please try again.';
          } else if (err.message.includes('fetch') || err.message.includes('Network')) {
            errorMessage = 'Network connection failed. If using a VPN, try connecting to a different server or temporarily disable it.';
          } else if (err.message.includes('HTTP')) {
            errorMessage = 'Server error. Please try again in a few moments.';
          } else {
            errorMessage = 'Unable to load audio. Please check your internet connection and try again.';
          }
          
          // Show less technical error message
          alert(errorMessage);
          
          // Try one last attempt with different strategy
          console.log('Attempting final fallback load...');
          setTimeout(() => {
            loadVideoFallback();
          }, 5000);
          return;
        }
        
        // Progressive delay increase
        const waitTime = delay * Math.pow(1.5, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // Fallback loading strategy
  async function loadVideoFallback() {
    try {
      console.log('Attempting fallback loading strategy...');
      
      // Simple direct approach without fancy options
      const response = await fetch(proxyUrl + '&_fallback=1');
      const data = await response.json();
      
      if (data.m3u8_url) {
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: false });
          hls.loadSource(data.m3u8_url);
          hls.attachMedia(video);
          video._hlsInstance = hls;
        } else {
          video.src = data.m3u8_url;
        }
      }
    } catch (fallbackErr) {
      console.error('Fallback also failed:', fallbackErr);
      // Silent failure for fallback
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
