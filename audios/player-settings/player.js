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

  // Fix for mobile: ensure video element has some height so it's not "collapsed"
  video.style.height = '40px'; // Enough to initialize audio controls on all devices

  fetch(proxyUrl)
    .then(res => {
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      return res.json();
    })
    .then(data => {
      const videoSrc = data.m3u8_url;

      if (!videoSrc) {
        throw new Error("No video source returned from proxy.");
      }

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
      console.error(err);
      alert('⚠️ Failed to load video stream. Please check your connection or try again.');
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
    video.loop = true;
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
