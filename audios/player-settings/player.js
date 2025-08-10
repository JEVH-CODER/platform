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

  // Enhanced cache busting specifically for Xiaomi devices
  const isXiaomi = /xiaomi|redmi|mi\s/i.test(navigator.userAgent);
  const cacheBuster = Date.now() + Math.random().toString(36).substr(2, 9);
  const proxyUrl = `https://puedocrecer.com/jwt-proxy/jwt-proxy.php?playback_id=${playbackId}&cb=${cacheBuster}`;

  // Xiaomi-specific fetch with enhanced headers
  const fetchOptions = {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Requested-With': 'XMLHttpRequest'
    }
  };

  // Add extra cache busting for Xiaomi
  if (isXiaomi) {
    fetchOptions.headers['X-Cache-Buster'] = cacheBuster;
    fetchOptions.headers['X-Xiaomi-Fix'] = 'true';
  }

  fetch(proxyUrl, fetchOptions)
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return res.json();
    })
    .then(data => {
      if (!data || !data.m3u8_url) {
        throw new Error('Invalid response: missing m3u8_url');
      }
      
      const videoSrc = data.m3u8_url;
      console.log('Loading video source:', videoSrc);

      if (Hls.isSupported()) {
        const hls = new Hls({
          // Basic configuration for stability
          enableWorker: true,
          maxBufferLength: 30,
          maxBufferSize: 60 * 1000 * 1000,
          manifestLoadingTimeOut: 10000,
          levelLoadingTimeOut: 10000,
          fragLoadingTimeOut: 20000
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
    .catch(err => {
      console.error('Failed to load video:', err);
      
      // Xiaomi-specific retry with different URL
      if (isXiaomi && !window.xiaomiRetryAttempted) {
        console.log('Xiaomi device detected, attempting retry...');
        window.xiaomiRetryAttempted = true;
        
        // Wait a moment then retry with different cache buster
        setTimeout(() => {
          const retryUrl = `https://puedocrecer.com/jwt-proxy/jwt-proxy.php?playback_id=${playbackId}&retry=${Date.now()}`;
          fetch(retryUrl, fetchOptions)
            .then(res => res.json())
            .then(data => {
              if (data && data.m3u8_url) {
                loadHLSVideo(data.m3u8_url);
              } else {
                showError('Failed to load audio stream after retry. Please refresh the page.');
              }
            })
            .catch(retryErr => {
              showError('Failed to load audio stream. Please clear browser cache and refresh.');
            });
        }, 1000);
      } else {
        showError(`Failed to load audio stream. ${err.message}`);
      }
    });

  // Separate function to load HLS video (for retry logic)
  function loadHLSVideo(videoSrc) {

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

  // Remove the iframe height override functions since we're using CSS approach
}
