document.addEventListener("DOMContentLoaded", function () {
    const chatInput = document.getElementById("chat-input");
    const sendButton = document.getElementById("send-button");
    const chatBox = document.getElementById("chat-box");

    async function sendMessage() {
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        // Add user message to chat
        appendMessage("user", userMessage);
        chatInput.value = "";

        try {
            // Show loading message
            const loadingId = appendMessage("bot", "Thinking...");

            const response = await fetch("http://127.0.0.1:5000/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ message: userMessage })
            });

            if (!response.ok) {
                throw new Error("Server response was not ok");
            }

            const data = await response.json();

            // Remove loading message and add bot response
            const loadingMessage = document.getElementById(loadingId);
            if (loadingMessage) chatBox.removeChild(loadingMessage);
            appendMessage("bot", data.response);
        } catch (error) {
            console.error("Error:", error);
            appendMessage("bot", "Sorry, I'm having trouble connecting. Please try again.");
        }
    }

    function appendMessage(sender, message) {
        const messageDiv = document.createElement("div");
        const messageId = `msg-${Date.now()}`;
        messageDiv.id = messageId;
        messageDiv.classList.add(sender === "user" ? "user-message" : "bot-message");
        messageDiv.textContent = message;
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        return messageId;
    }

    // Send message on button click
    sendButton.addEventListener("click", sendMessage);

    // Send message on Enter key
    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendMessage();
        }
    });

    // Hide all pages except home on load
    document.querySelectorAll(".page").forEach(page => {
        page.style.display = "none";
    });
    document.querySelector("#home").style.display = "block";

    // Handle navigation clicks
    document.querySelectorAll(".nav-link").forEach(link => {
        link.addEventListener("click", function (e) {
            e.preventDefault();

            document.querySelectorAll(".page").forEach(page => {
                page.style.display = "none";
            });

            const target = document.querySelector(this.getAttribute("href"));
            if (target) {
                target.style.display = "block";
            }
        });
    });

    // Chatbot Navigation (also auto-start camera analysis)
    document.querySelectorAll(".chat-button").forEach(chatButton => {
        chatButton.addEventListener("click", function (e) {
            e.preventDefault();
            document.querySelectorAll(".page").forEach(page => {
                page.style.display = "none";
            });
            document.querySelector("#chatbot").style.display = "block";
            // Try to auto-start camera mood analysis when user enters chat
            if (typeof startCamera === "function") {
                const video = document.getElementById("camera-video");
                if (video) startCamera();
            }
        });
    });

    // Remove legacy handlers that referenced non-existent elements (prevent runtime errors)

    // Meditation Timer
    let timer;
    let timeLeft = 300; // 5 minutes
    const timerDisplay = document.getElementById("timer");
    const startButton = document.getElementById("start-timer");
    const pauseButton = document.getElementById("pause-timer");
    const resetButton = document.getElementById("reset-timer");

    function updateTimerDisplay() {
        let minutes = Math.floor(timeLeft / 60);
        let seconds = timeLeft % 60;
        timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }

    function startTimer() {
        if (!timer) {
            timer = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updateTimerDisplay();
                } else {
                    clearInterval(timer);
                    timer = null;
                }
            }, 1000);
        }
    }

    function pauseTimer() {
        clearInterval(timer);
        timer = null;
    }

    function resetTimer() {
        clearInterval(timer);
        timer = null;
        timeLeft = 300;
        updateTimerDisplay();
    }

    if (startButton) startButton.addEventListener("click", startTimer);
    if (pauseButton) pauseButton.addEventListener("click", pauseTimer);
    if (resetButton) resetButton.addEventListener("click", resetTimer);
    updateTimerDisplay();

    // Meditation Sound Selection
    let soundPlayer = new Audio();

    function playSound(type) {
        const sounds = {
            ocean: "sounds/ocean.mp3",
            rain: "sounds/rain.mp3",
            birds: "sounds/birds.mp3"
        };

        const source = sounds[type];
        if (!source) return;

        try {
            soundPlayer.pause();
            soundPlayer.src = source;
            soundPlayer.loop = true;
            const playPromise = soundPlayer.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {
                    // Some browsers need a direct user gesture; silently fail
                });
            }
        } catch (_) {}
    }

    function stopSound() {
        try {
            soundPlayer.pause();
            soundPlayer.currentTime = 0;
        } catch (_) {}
    }

    document.querySelectorAll(".sound-button").forEach(button => {
        button.addEventListener("click", () => playSound(button.dataset.sound));
    });

    const stopSoundButton = document.getElementById("stop-sound");
    if (stopSoundButton) stopSoundButton.addEventListener("click", stopSound);

    // Meditation video controls
    const meditationVideo = document.getElementById("meditation-video");
    const playVideoBtn = document.getElementById("play-video");
    const pauseVideoBtn = document.getElementById("pause-video");
    const resetVideoBtn = document.getElementById("reset-video");

    if (playVideoBtn && meditationVideo) {
        playVideoBtn.addEventListener("click", () => meditationVideo.play());
    }
    if (pauseVideoBtn && meditationVideo) {
        pauseVideoBtn.addEventListener("click", () => meditationVideo.pause());
    }
    if (resetVideoBtn && meditationVideo) {
        resetVideoBtn.addEventListener("click", () => {
            meditationVideo.pause();
            meditationVideo.currentTime = 0;
        });
    }

    // Camera + Emotion Analysis (face-api.js)
    const startCameraBtn = document.getElementById("start-camera");
    const endCameraBtn = document.getElementById("end-camera");
    const cameraVideo = document.getElementById("camera-video");
    const emotionText = document.getElementById("detected-emotion");
    const happyText = document.getElementById("happy-score");
    const sadText = document.getElementById("sad-score");
    const angryText = document.getElementById("angry-score");
    let cameraStream;
    let analysisInterval;

    async function ensureModelsLoaded() {
        if (!window.faceapi) return false;
        const modelUrl = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
        const needed = [
            faceapi.nets.tinyFaceDetector.isLoaded,
            faceapi.nets.faceExpressionNet.isLoaded
        ];
        if (needed.every(Boolean)) return true;
        await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
        await faceapi.nets.faceExpressionNet.loadFromUri(modelUrl);
        return true;
    }

    async function startCamera() {
        try {
            if (!await ensureModelsLoaded()) return;
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            cameraVideo.srcObject = cameraStream;
            emotionText.textContent = "Detected Emotion: Analyzing...";

            const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

            analysisInterval = setInterval(async () => {
                try {
                    const result = await faceapi
                        .detectSingleFace(cameraVideo, options)
                        .withFaceExpressions();

                    if (!result) return;

                    const expr = result.expressions;
                    const entries = Object.entries(expr);
                    entries.sort((a, b) => b[1] - a[1]);
                    const [topEmotion, confidence] = entries[0];

                    emotionText.textContent = `Detected Emotion: ${topEmotion}`;
                    happyText.textContent = `Happy: ${Math.round((expr.happy || 0) * 100)}%`;
                    sadText.textContent = `Sad: ${Math.round((expr.sad || 0) * 100)}%`;
                    angryText.textContent = `Angry: ${Math.round((expr.angry || 0) * 100)}%`;
                } catch (_) {}
            }, 500);
        } catch (err) {
            emotionText.textContent = "Detected Emotion: Permission denied or no camera";
        }
    }

    function endCamera() {
        if (analysisInterval) {
            clearInterval(analysisInterval);
            analysisInterval = null;
        }
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            cameraStream = null;
        }
        if (cameraVideo) {
            cameraVideo.srcObject = null;
        }
        if (emotionText) emotionText.textContent = "Detected Emotion: Not started";
        if (happyText) happyText.textContent = "Happy: 0%";
        if (sadText) sadText.textContent = "Sad: 0%";
        if (angryText) angryText.textContent = "Angry: 0%";
    }

    if (startCameraBtn && cameraVideo) startCameraBtn.addEventListener("click", startCamera);
    if (endCameraBtn) endCameraBtn.addEventListener("click", endCamera);
});
