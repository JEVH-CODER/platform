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

  fetch(proxyUrl)
    .then(res => res.json())
    .then(data => {
      const videoSrc = data.m3u8_url;

      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(videoSrc);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoSrc;
      } else {
        alert('Your browser does not support HLS playback.');
      }
    }).catch(err => {
      alert('Failed to load video stream. ' + err);
    });

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
      video.play();
      playBtn.textContent = '⏸️';
    } else {
      video.pause();
      playBtn.textContent = '▶️';
    }
  });

  backBtn.addEventListener('click', () => {
    video.currentTime -= 5;
  });

  forwardBtn.addEventListener('click', () => {
    video.currentTime += 5;
  });

  volumeSlider.addEventListener('input', () => {
    video.volume = volumeSlider.value;
  });

  speedSelect.addEventListener('change', () => {
    video.playbackRate = parseFloat(speedSelect.value);
  });

  video.addEventListener('timeupdate', () => {
    seekSlider.value = video.currentTime;
    updateTime();
  });

  video.addEventListener('loadedmetadata', () => {
    seekSlider.max = video.duration;
    video.loop = true; // Ensure loop is enabled
    updateTime();
  });

  seekSlider.addEventListener('input', () => {
    video.currentTime = seekSlider.value;
  });

  function updateTime() {
    const format = sec => {
      const minutes = Math.floor(sec / 60);
      const seconds = Math.floor(sec % 60).toString().padStart(2, '0');
      return `${minutes}:${seconds}`;
    };
    timeLabel.textContent = `${format(video.currentTime)} / ${format(video.duration)}`;
  }
}
