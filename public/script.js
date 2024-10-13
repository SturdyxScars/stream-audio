
const socket = io();  // Connect to the server via Socket.IO

const senderBtn = document.getElementById('senderBtn');
const receiverBtn = document.getElementById('receiverBtn');
const senderControls = document.getElementById('sender-controls');
const receiverControls = document.getElementById('receiver-controls');
const audioFileInput = document.getElementById('audioFile');
const playButton = document.getElementById('playBtn');
const stopButton = document.getElementById('stopBtn');
const audioPlayer = document.getElementById('audioPlayer');
const receiverPlayer = document.getElementById('receiverPlayer');

let audioFile;
let isSender = false;
let audioDataChunks = []; // To store received audio chunks
let mediaSource;
let sourceBuffer;

// Handle user selecting sender or receiver
senderBtn.addEventListener('click', () => {
  isSender = true;
  senderControls.style.display = 'block';
  document.getElementById('role-selection').style.display = 'none';
});

receiverBtn.addEventListener('click', () => {
  isSender = false;
  receiverControls.style.display = 'block';
  document.getElementById('role-selection').style.display = 'none';

  // Initialize MediaSource for the receiver
  mediaSource = new MediaSource();
  receiverPlayer.src = URL.createObjectURL(mediaSource);

  // Add source buffer when media source is ready
  mediaSource.addEventListener('sourceopen', () => {
    sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
    console.log('SourceBuffer created and ready for audio data.');

    // Handle errors and log buffer updates for better monitoring
    sourceBuffer.addEventListener('error', (e) => {
      console.error('SourceBuffer error:', e);
    });

    sourceBuffer.addEventListener('updateend', () => {
      console.log('SourceBuffer updated, available range:', 
                  sourceBuffer.buffered.start(0), '-', sourceBuffer.buffered.end(0));
    });
  });
});

// Handle sender's audio file selection
audioFileInput.addEventListener('change', (event) => {
  audioFile = event.target.files[0];
  console.log('Audio file selected:', audioFile);
});

// Handle play button click for sender
playButton.addEventListener('click', () => {
  if (audioFile && isSender) {
    const reader = new FileReader();

    reader.onload = function(event) {
      const audioData = event.target.result;

      // Stream audio in smaller chunks
      let offset = 0;
      const CHUNK_SIZE = 4000;  // Smaller chunk size for smoother streaming
      const INTERVAL = 50;      // Adjusted interval to avoid overloading

      function sendChunk() {
        if (offset < audioData.byteLength) {
          const chunk = audioData.slice(offset, offset + CHUNK_SIZE);
          socket.emit('audio-stream', { data: chunk });  // Send chunk to receiver
          offset += CHUNK_SIZE;
          console.log('Sent chunk, offset:', offset);

          setTimeout(sendChunk, INTERVAL); // Send the next chunk after a delay
        } else {
          console.log('All chunks sent.');
        }
      }

      // Start sending chunks in intervals
      sendChunk();

      // Play locally on sender
      audioPlayer.src = URL.createObjectURL(audioFile);
      audioPlayer.play();

      socket.emit('control', { action: 'play' });  // Inform receiver to play
    };

    reader.readAsArrayBuffer(audioFile);  // Read audio file as ArrayBuffer
  }
});

// Handle stop button click for sender
stopButton.addEventListener('click', () => {
  if (isSender) {
    audioPlayer.pause();  // Stop local playback
    socket.emit('control', { action: 'stop' });  // Inform receiver to stop
  }
});

// Handle incoming audio stream on the receiver side
socket.on('audio-stream', (data) => {
  const chunk = new Uint8Array(data.data);
  console.log('source buffer', sourceBuffer);

  if (sourceBuffer && !sourceBuffer.updating) {
    try {
      sourceBuffer.appendBuffer(chunk);  // Append chunk to source buffer
      console.log('Received and appended chunk');
    } catch (error) {
      console.error('Error appending chunk:', error);
      // Handle buffer overflow by waiting and retrying
      setTimeout(() => {
        sourceBuffer.appendBuffer(chunk);  // Retry appending after a short delay
      }, 100);  // Wait 100ms before retrying
    }
  } else {
    console.log('SourceBuffer is updating, skipping chunk');
  }
});
let isPlaying = false;  // Flag to track if chunk was played completely
// Start playback only when enough audio is buffered
function startPlaybackWhenBuffered() {
  const MIN_BUFFER_TIME = 1.5;  // Duration of each buffered chunk in seconds

  let playbackStartTime = 0;
  const checkBufferAndPlay = setInterval(() => {
    if (receiverPlayer.buffered.length > 0) {
      const bufferedEnd = receiverPlayer.buffered.end(0);  // Get the buffered end time
      if (!isPlaying && bufferedEnd >= MIN_BUFFER_TIME) {
        console.log('Starting playback of new chunk.');
        receiverPlayer.play();  // Start playback
        playbackStartTime = receiverPlayer.currentTime;  // Track the current time

        isPlaying = true;  // Set flag to true since playback started
      }  
      // Check if the chunk is fully played
      const playedTime = receiverPlayer.currentTime - playbackStartTime;
      if (isPlaying && playedTime >= MIN_BUFFER_TIME+0.5) {
        console.log('Chunk played completely.');
        isPlaying = false;  // Reset flag to play the next chunk  
        // Clear the interval when done, or load/play the next chunk if available
        if (bufferedEnd < MIN_BUFFER_TIME) {
          console.log('No more buffered chunks, waiting for the next one.');
          clearInterval(checkBufferAndPlay);  // Stop checking
        }
      }
    }
  }, 100);  // Check every 100ms
}


// Handle play/stop controls from the sender
socket.on('control', (data) => {
  if (data.action === 'play') {
    startPlaybackWhenBuffered();  // Start playback when buffered enough
  } else if (data.action === 'stop') {
    receiverPlayer.pause();  // Stop playback

    // Clear the buffer when stopping
    if (sourceBuffer) {
      try {
        sourceBuffer.abort();  // Abort current buffering
        mediaSource.endOfStream();  // End the media stream
        console.log('Buffer cleared and stream stopped.');
      } catch (error) {
        console.error('Error stopping stream:', error);
      }
    }
  }
});
