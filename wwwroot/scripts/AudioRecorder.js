var BlazorAudioRecorder = {};

(function () {
    // Main variables used throughout the recorder
    var mStream; // Audio stream from the user's microphone
    var mAudioChunks; // Array to store audio data chunks
    var mMediaRecorder; // MediaRecorder instance for recording audio
    var mCaller; // Reference to Blazor component to invoke .NET methods
    var mAudioContext; // AudioContext for analyzing audio data
    var mAnalyzer; // AnalyserNode for real-time audio analysis
    var mSilenceTimeout; // Timeout for detecting silence
    var mIsRecording = false; // Flag to indicate recording state
    var mSilenceDuration = 1500; // Silence duration threshold (1.5 seconds)
    var mSilenceThreshold = 0.1; // Amplitude threshold for detecting silence
    var mCanvas, mCanvasCtx, mBufferLength, mDataArray; // Canvas and audio buffer variables for wave animation

    /**
     * Initializes the audio recorder and checks if canvas is ready.
     * @param {object} vCaller - Reference to Blazor component to call .NET methods.
     */
    BlazorAudioRecorder.Initialize = function (vCaller) {
        mCaller = vCaller;
        mCanvas = document.getElementById("waveCanvas");

        // Retry initialization if the canvas element is not available yet
        if (!mCanvas) {
            console.warn("Canvas not ready. Retrying initialization...");
            setTimeout(() => BlazorAudioRecorder.Initialize(vCaller), 100);
            return;
        }

        mCanvasCtx = mCanvas.getContext("2d"); // Get canvas context for drawing wave
        resizeCanvas(); // Adjust canvas size to screen width
        window.addEventListener("resize", resizeCanvas); // Resize canvas on window resize
    };

    /**
     * Resizes the canvas to fit the current window width, keeping a fixed height.
     */
    function resizeCanvas() {
        mCanvas.width = window.innerWidth;
        mCanvas.height = 150;
    }

    /**
     * Starts the audio recording process by requesting microphone access and setting up the recorder.
     */
    BlazorAudioRecorder.StartRecord = async function () {
        // Request microphone access and create a stream
        mStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mMediaRecorder = new MediaRecorder(mStream);
        mAudioChunks = []; // Reset audio chunks

        // Event listener to store each audio data chunk
        mMediaRecorder.addEventListener('dataavailable', vEvent => {
            mAudioChunks.push(vEvent.data);
        });

        // Handle any errors from the media recorder
        mMediaRecorder.addEventListener('error', vError => {
            console.warn('media recorder error: ' + vError);
        });

        // When recording stops, process the audio and send it to Blazor
        mMediaRecorder.addEventListener('stop', async () => {
            // Create audio blob and URL from chunks
            var pAudioBlob = new Blob(mAudioChunks, { type: "audio/mp3;" });
            var pAudioUrl = URL.createObjectURL(pAudioBlob);

            // Play the recorded audio immediately
            var pAudio = new Audio(pAudioUrl);
            pAudio.play();

            // Send the audio URL back to the Blazor component
            await mCaller.invokeMethodAsync('OnAudioUrl', pAudioUrl);
            stopAnimation(); // Stop wave animation after recording stops
        });

        // Set up audio analysis for visualizing wave animation
        mAudioContext = new AudioContext();
        var source = mAudioContext.createMediaStreamSource(mStream);
        mAnalyzer = mAudioContext.createAnalyser();
        mAnalyzer.fftSize = 256; // Frequency resolution for analyzer
        source.connect(mAnalyzer); // Connect audio source to analyzer

        // Initialize buffer for waveform data
        mBufferLength = mAnalyzer.frequencyBinCount;
        mDataArray = new Uint8Array(mBufferLength);

        startRecording(); // Start recording and visual updates
    };

    /**
     * Starts recording audio and visual wave animation.
     */
    function startRecording() {
        mIsRecording = true;
        mMediaRecorder.start(); // Start recording audio
        startAnimation(); // Start visual animation
        detectSilence(); // Begin silence detection
        drawWave(); // Begin wave animation loop
    }

    /**
     * Stops the audio recording and closes resources.
     */
    function stopRecording() {
        if (mIsRecording && mMediaRecorder.state !== 'inactive') {
            mIsRecording = false;
            mMediaRecorder.stop(); // Stop audio recording
            mStream.getTracks().forEach(pTrack => pTrack.stop()); // Stop microphone access
            clearTimeout(mSilenceTimeout); // Clear silence detection timer
            if (mAudioContext) {
                mAudioContext.close(); // Close audio context
                mAudioContext = null;
            }
            stopAnimation(); // Stop wave animation
        }
    }

    /**
     * Detects silence in audio input and stops recording if silence persists.
     */
    function detectSilence() {
        const buffer = new Uint8Array(mAnalyzer.fftSize);

        const checkSilence = () => {
            mAnalyzer.getByteFrequencyData(buffer);
            const average = buffer.reduce((sum, value) => sum + value) / buffer.length;

            // If volume is below the threshold, start a timer to stop recording
            if (average < mSilenceThreshold * 255) {
                if (!mSilenceTimeout) {
                    mSilenceTimeout = setTimeout(() => {
                        stopRecording();
                    }, mSilenceDuration);
                }
            } else {
                clearTimeout(mSilenceTimeout);
                mSilenceTimeout = null;
            }

            requestAnimationFrame(checkSilence); // Repeat the check in the next frame
        };

        checkSilence();
    }

    /**
     * Draws a wave animation on the canvas based on the audio input.
     */
    function drawWave() {
        if (!mIsRecording) return;

        requestAnimationFrame(drawWave); // Continue drawing while recording
        mAnalyzer.getByteTimeDomainData(mDataArray); // Get waveform data

        // Clear canvas and set background
        mCanvasCtx.fillStyle = "rgba(0, 0, 0, 0.1)";
        mCanvasCtx.fillRect(0, 0, mCanvas.width, mCanvas.height);

        // Set line style for wave
        mCanvasCtx.lineWidth = 2;
        mCanvasCtx.strokeStyle = "#ff0000";
        mCanvasCtx.beginPath();

        var sliceWidth = mCanvas.width * 1.0 / mBufferLength;
        var x = 0;

        // Draw the waveform line
        for (var i = 0; i < mBufferLength; i++) {
            var v = mDataArray[i] / 128.0;
            var y = v * mCanvas.height / 2;

            if (i === 0) {
                mCanvasCtx.moveTo(x, y);
            } else {
                mCanvasCtx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        mCanvasCtx.lineTo(mCanvas.width, mCanvas.height / 2);
        mCanvasCtx.stroke(); // Render the waveform
    }

    /**
     * Starts the visual animation by adding the 'recording' class to the button.
     */
    function startAnimation() {
        document.getElementById("micButton").classList.add("recording");
    }

    /**
     * Stops the visual animation by removing the 'recording' class and clearing the canvas.
     */
    function stopAnimation() {
        document.getElementById("micButton").classList.remove("recording");
        mCanvasCtx.clearRect(0, 0, mCanvas.width, mCanvas.height); // Clear the canvas
    }
})();
