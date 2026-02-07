import { SpeechService } from './SpeechService.js';

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggleBtn');
    const statusDiv = document.getElementById('status');
    const transcriptDiv = document.getElementById('transcript');

    // State
    let isRecording = false;
    const speechService = new SpeechService();

    // --- Event Listeners ---
    toggleBtn.addEventListener('click', toggleRecording);

    // --- Speech Service Callbacks ---
    speechService.onResult = (final, interim) => {
        let display = '';
        if (final) display += `<p class="final" style="color:#fff; font-weight:500;">${final}</p>`;
        if (interim) display += `<p class="interim" style="color:#94a3b8; font-style:italic;">${interim}...</p>`;

        // Only clear placeholder if we have text
        if (final || interim) {
            transcriptDiv.innerHTML = display;
            // Auto-scroll to bottom
            transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
        }

        if (final) {
            handleFinalResult(final);
        }
    };

    speechService.onError = (error) => {
        console.error('Speech Error:', error);
        setStatus(`Error: ${error}`, 'error');

        if (error === 'not-allowed') {
            setStatus('Mic Permission Denied', 'error');
            setTimeout(() => chrome.tabs.create({ url: 'permission.html' }), 1500);
        }

        stopUI();
    };

    speechService.onEnd = () => {
        if (isRecording) {
            // Unexpected stop (silence/error)
            stopUI();
        }
    };

    // --- Logic ---

    function toggleRecording() {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    }

    function startRecording() {
        try {
            speechService.start();
            isRecording = true;

            // UI Updates
            toggleBtn.classList.add('recording');
            setStatus('Listening...', 'listening');
            transcriptDiv.innerHTML = ''; // Clear previous
        } catch (e) {
            setStatus('Failed to start', 'error');
        }
    }

    function stopRecording() {
        speechService.stop();
        stopUI();
    }

    function stopUI() {
        isRecording = false;
        toggleBtn.classList.remove('recording');
        if (!statusDiv.className.includes('processing')) {
            setStatus('Tap to speak', 'default');
        }
    }

    function handleFinalResult(text) {
        if (!isRecording) return; // Prevent multiple sends for the same session
        console.log('Sending command:', text);

        speechService.stop(); // Explicitly stop listening immediately

        // Show processing state
        setStatus('Processing...', 'processing');
        stopUI(); // Stop recording animation, but keep processing status

        // Send to Background
        chrome.runtime.sendMessage({ type: 'VOICE_COMMAND', command: text });

        // After 2s, reset to ready (unless background sends a message back, handled separately)
        setTimeout(() => {
            setStatus('Tap to speak', 'default');
        }, 3000);
    }

    function setStatus(text, type) {
        statusDiv.textContent = text;
        statusDiv.className = 'status ' + type;
    }
});
