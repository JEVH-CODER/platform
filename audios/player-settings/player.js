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

  // Add cache busting and improved error handling
  const timestamp = Date.now();
  const proxyUrl = `https://puedocrecer.com/jwt-proxy/jwt-proxy.php?playback_id=${playbackId}&t=${timestamp}`;

  // Enhanced fetch with retry logic for mobile devices
  async function fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        console.warn(`Fetch attempt ${i + 1} failed:`, error.message);
        
        if (i === maxRetries - 1) {
          throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  // Load video with improved error handling
  fetchWithRetry(proxyUrl)
    .then(data => {
      if (!data || !data.m3u8_url) {
        throw new Error('Invalid response: missing m3u8_url');
      }
      
      const videoSrc = data.m3u8_url;
      console.log('Loading video source:', videoSrc);

      if (Hls.isSupported()) {
        const hls = new Hls({
          // Enhanced HLS configuration for mobile stability
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 600,
          maxBufferSize: 60 * 1000 * 1000,
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 3,
          maxFragLookUpTolerance: 0.25,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: Infinity,
          liveDurationInfinity: false,
          enableSoftwareAES: true,
          manifestLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 1,
          manifestLoadingRetryDelay: 1000,
          levelLoadingTimeOut: 10000,
          levelLoadingMaxRetry: 4,
          levelLoadingRetryDelay: 1000,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 1000
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS Error:', data);
          
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Network error, attempting to recover...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Media error, attempting to recover...');
                hls.recoverMediaError();
                break;
              default:
                console.log('Unrecoverable error, destroying HLS instance');
                hls.destroy();
                showError('Playback error occurred. Please refresh the page.');
                break;
            }
          }
        });
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('HLS manifest parsed successfully');
        });
        
        hls.loadSource(videoSrc);
        hls.attachMedia(video);
        
        // Store hls instance for cleanup
        video.hlsInstance = hls;
        
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoSrc;
      } else {
        throw new Error('Your browser does not support HLS playback.');
      }
    })
    .catch(err => {
      console.error('Failed to load video:', err);
      showError(`Failed to load audio stream. ${err.message}`);
    });

  // Enhanced error display function
  function showError(message) {
    // Create error message element if it doesn't exist
    let errorDiv = document.getElementById('error-message');
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.id = 'error-message';
      errorDiv.style.cssText = `
        background: #fee;
        border: 1px solid #fcc;
        color: #c33;
        padding: 10px;
        border-radius: 6px;
        margin: 10px 0;
        font-size: 14px;
        text-align: center;
      `;
      document.querySelector('.player-container').appendChild(errorDiv);
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

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
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            playBtn.textContent = '⏸️';
          })
          .catch(error => {
            console.error('Play failed:', error);
            showError('Playback failed. Please try again.');
          });
      }
    } else {
      video.pause();
      playBtn.textContent = '▶️';
    }
  });

  backBtn.addEventListener('click', () => {
    if (video.duration) {
      video.currentTime = Math.max(0, video.currentTime - 5);
    }
  });

  forwardBtn.addEventListener('click', () => {
    if (video.duration) {
      video.currentTime = Math.min(video.duration, video.currentTime + 5);
    }
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
    if (video.duration) {
      seekSlider.max = video.duration;
      video.loop = true; // Ensure loop is enabled
      updateTime();
    }
  });

  video.addEventListener('ended', () => {
    if (video.loop) {
      video.currentTime = 0;
      video.play().catch(error => {
        console.error('Loop play failed:', error);
      });
    }
  });

  // Enhanced error handling for video events
  video.addEventListener('error', (e) => {
    console.error('Video error:', e);
    const error = video.error;
    if (error) {
      let errorMessage = 'Video playback error: ';
      switch (error.code) {
        case error.MEDIA_ERR_ABORTED:
          errorMessage += 'Playback aborted';
          break;
        case error.MEDIA_ERR_NETWORK:
          errorMessage += 'Network error';
          break;
        case error.MEDIA_ERR_DECODE:
          errorMessage += 'Decode error';
          break;
        case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage += 'Source not supported';
          break;
        default:
          errorMessage += 'Unknown error';
          break;
      }
      showError(errorMessage);
    }
  });

  seekSlider.addEventListener('input', () => {
    if (video.duration) {
      video.currentTime = seekSlider.value;
    }
  });

  function updateTime() {
    const format = sec => {
      if (!sec || !isFinite(sec)) return '0:00';
      const minutes = Math.floor(sec / 60);
      const seconds = Math.floor(sec % 60).toString().padStart(2, '0');
      return `${minutes}:${seconds}`;
    };
    
    const currentTime = video.currentTime || 0;
    const duration = video.duration || 0;
    timeLabel.textContent = `${format(currentTime)} / ${format(duration)}`;
  }

  // Cleanup function for page unload
  window.addEventListener('beforeunload', () => {
    if (video.hlsInstance) {
      video.hlsInstance.destroy();
    }
  });

  // Force container height after load
  document.addEventListener('DOMContentLoaded', () => {
    document.body.style.height = '100px';
    document.body.style.maxHeight = '100px';
    document.body.style.overflow = 'hidden';
  });
}
