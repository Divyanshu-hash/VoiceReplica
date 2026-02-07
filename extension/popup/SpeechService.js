export class SpeechService {
    constructor() {
        if (!('webkitSpeechRecognition' in window)) {
            console.error('Speech recognition not supported');
            return;
        }

        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = false; // Stop after one sentence for now
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.isListening = false;

        // Callbacks
        this.onResult = null;
        this.onError = null;
        this.onEnd = null;

        this._setupListeners();
    }

    _setupListeners() {
        this.recognition.onstart = () => {
            this.isListening = true;
            console.log('Speech recognition started');
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            if (this.onError) this.onError(event.error);
        };

        this.recognition.onend = () => {
            this.isListening = false;
            console.log('Speech recognition ended');
            if (this.onEnd) this.onEnd();
        };

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (this.onResult) {
                this.onResult(finalTranscript, interimTranscript);
            }
        };
    }

    start() {
        if (this.isListening) return;
        try {
            this.recognition.start();
        } catch (e) {
            console.error('Error starting recognition:', e);
        }
    }

    stop() {
        if (!this.isListening) return;
        this.recognition.stop();
    }

    speak(text) {
        if (!('speechSynthesis' in window)) return;

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    }
}
