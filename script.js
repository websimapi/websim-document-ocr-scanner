import * as Tesseract from 'tesseract.js';

class DocumentScanner {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.stream = null;
        
        this.initializeElements();
        this.bindEvents();
    }
    
    initializeElements() {
        this.startCameraBtn = document.getElementById('startCamera');
        this.captureBtn = document.getElementById('captureBtn');
        this.retakeBtn = document.getElementById('retakeBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.newScanBtn = document.getElementById('newScanBtn');
        
        this.cameraSection = document.getElementById('cameraSection');
        this.processingSection = document.getElementById('processingSection');
        this.previewSection = document.getElementById('previewSection');
        
        this.progressBar = document.getElementById('progressBar');
        this.capturedImage = document.getElementById('capturedImage');
        this.extractedForm = document.getElementById('extractedForm');
        this.rawText = document.getElementById('rawText');
    }
    
    bindEvents() {
        this.startCameraBtn.addEventListener('click', () => this.startCamera());
        this.captureBtn.addEventListener('click', () => this.captureImage());
        this.retakeBtn.addEventListener('click', () => this.retakePhoto());
        this.downloadBtn.addEventListener('click', () => this.downloadData());
        this.newScanBtn.addEventListener('click', () => this.newScan());
        
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
    }
    
    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            this.video.srcObject = this.stream;
            this.startCameraBtn.style.display = 'none';
            this.captureBtn.style.display = 'inline-flex';
            this.retakeBtn.style.display = 'inline-flex';
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('Unable to access camera. Please ensure you have granted camera permissions.');
        }
    }
    
    captureImage() {
        // Set canvas dimensions to match video
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        
        // Draw the video frame to canvas
        this.ctx.drawImage(this.video, 0, 0);
        
        // Get image data
        const imageData = this.canvas.toDataURL('image/png');
        
        // Stop camera
        this.stopCamera();
        
        // Show processing
        this.showProcessing();
        
        // Process with OCR
        this.processOCR(imageData);
    }
    
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.video.srcObject = null;
    }
    
    showProcessing() {
        this.cameraSection.style.display = 'none';
        this.processingSection.style.display = 'block';
        this.previewSection.style.display = 'none';
    }
    
    async processOCR(imageData) {
        try {
            // Show captured image
            this.capturedImage.src = imageData;
            
            // Preprocess image for better OCR
            const processedImageData = await this.preprocessImage(imageData);
            
            // Create worker with better configuration for documents
            const worker = await Tesseract.createWorker('eng', 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        this.progressBar.style.width = `${progress}%`;
                    }
                }
            });
            
            // Configure worker specifically for document scanning
            await worker.setParameters({
                'tessedit_char_whitelist': 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?@#$%^&*()_+-=[]{}|;:\'",.<>?/\\ \n\t',
                'tessedit_pageseg_mode': '3', // Auto page segmentation with OSD. Better for general docs.
                'tessedit_ocr_engine_mode': '2', // LSTM neural net mode
            });
            
            const { data } = await worker.recognize(processedImageData);
            await worker.terminate();

            const { text, confidence } = data;
            
            console.log(`OCR Confidence: ${confidence}%`);
            
            if (!text || text.trim().length === 0) {
                throw new Error('No text detected in the image. Please ensure the document is clearly visible and well-lit.');
            }
            
            // Set raw text, generate the form from detailed OCR data, and show results
            this.rawText.value = text;
            this.generateForm(data);
            this.showResults();
            
        } catch (error) {
            console.error('OCR Error:', error);
            
            let errorMessage = 'Error processing image: ';
            if (error.message.includes('No text detected')) {
                errorMessage += error.message;
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                errorMessage += 'Network error. Please check your internet connection and try again.';
            } else if (error.message.includes('worker')) {
                errorMessage += 'OCR service failed to initialize. Please refresh the page and try again.';
            } else {
                errorMessage += 'Unable to process the image. Please ensure the document is clear, well-lit, and try taking another photo.';
            }
            
            alert(errorMessage);
            this.retakePhoto();
        }
    }
    
    async preprocessImage(imageData) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // Create a temporary canvas for preprocessing
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                
                // Draw original image
                tempCtx.drawImage(img, 0, 0);
                
                // Get image data for processing
                const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const data = imageData.data;
                
                // Convert to grayscale and enhance contrast
                for (let i = 0; i < data.length; i += 4) {
                    // Calculate grayscale value
                    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                    
                    // Enhance contrast (make text darker, background lighter)
                    const enhanced = gray < 128 ? Math.max(0, gray - 30) : Math.min(255, gray + 30);
                    
                    data[i] = enhanced;     // Red
                    data[i + 1] = enhanced; // Green
                    data[i + 2] = enhanced; // Blue
                    // Alpha remains the same
                }
                
                // Put processed image data back
                tempCtx.putImageData(imageData, 0, 0);
                
                // Return processed image as data URL
                resolve(tempCanvas.toDataURL('image/png'));
            };
            img.src = imageData;
        });
    }
    
    cleanOCRText(text) {
        if (!text) return '';
        return text
            // Normalize whitespace
            .replace(/[ \t]+/g, ' ')
            // Preserve meaningful newlines
            .replace(/\s*\n\s*/g, '\n')
            .trim();
    }
    
    generateForm(data) {
        const formFields = this.extractFormFields(data);
        this.extractedForm.innerHTML = '';
        
        formFields.forEach((field, index) => {
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = field.label;
            label.setAttribute('for', `field_${index}`);
            
            let input;
            if (field.type === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 3;
            } else {
                input = document.createElement('input');
                input.type = field.type || 'text';
            }
            
            input.id = `field_${index}`;
            input.name = field.name;
            input.value = field.value || '';
            input.placeholder = field.placeholder || '';
            
            formGroup.appendChild(label);
            formGroup.appendChild(input);
            this.extractedForm.appendChild(formGroup);
        });
        
        if (formFields.length === 0) {
            const message = document.createElement('p');
            message.textContent = "Could not automatically detect form fields. The extracted text is available in the 'Raw Text' tab.";
            message.style.textAlign = 'center';
            message.style.color = '#666';
            message.style.fontStyle = 'italic';
            this.extractedForm.appendChild(message);
        }
    }
    
    extractFormFields(data) {
        const { words } = data;
        if (!words) return [];
        const fields = [];
        const usedWords = new Set();
        
        // Sort words top-to-bottom, then left-to-right
        words.sort((a, b) => {
            const yDiff = a.bbox.y0 - b.bbox.y0;
            if (Math.abs(yDiff) > 5) return yDiff; // 5px tolerance for same line
            return a.bbox.x0 - b.bbox.x0;
        });
        
        const lines = this.groupWordsIntoLines(words);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineWords = line.words;
            const lineBbox = line.bbox;
            const lineText = line.text;

            if (lineWords.every(w => usedWords.has(w))) continue;
            
            // --- Strategy 1: Find "Label: Value" pairs on one line ---
            const colonIndex = lineText.indexOf(':');
            if (colonIndex > 0 && colonIndex < lineText.length -1) {
                const labelText = lineText.substring(0, colonIndex).trim();
                let valueText = lineText.substring(colonIndex + 1).trim();

                if (this.isValidLabel(labelText)) {
                     // Check if value continues on the next line (e.g., for addresses)
                    if (i + 1 < lines.length) {
                        const nextLine = lines[i+1];
                        // If next line is indented relative to label, and doesn't look like a new label
                        if (nextLine.bbox.x0 > lineBbox.x0 + 10 && !nextLine.text.includes(':')) {
                            valueText += '\n' + nextLine.text;
                            nextLine.words.forEach(w => usedWords.add(w));
                        }
                    }
                    fields.push(this.createField(labelText, valueText));
                    lineWords.forEach(w => usedWords.add(w));
                    continue;
                }
            }

            // --- Strategy 2: Find "Label" and "Value" separated by a large gap ---
            for (let j = 0; j < lineWords.length - 1; j++) {
                const labelPart = lineWords.slice(0, j + 1).map(w => w.text).join(' ');
                const lastWordOfLabel = lineWords[j];
                const nextWord = lineWords[j+1];
                
                const gap = nextWord.bbox.x0 - lastWordOfLabel.bbox.x1;
                if (gap > 40 && this.isValidLabel(labelPart)) { // 40px is a significant gap
                    const valuePart = lineWords.slice(j + 1).map(w => w.text).join(' ');
                    if (valuePart) {
                        fields.push(this.createField(labelPart, valuePart));
                        lineWords.forEach(w => usedWords.add(w));
                        break; // Field found, move to next line
                    }
                }
            }
            if (lineWords.every(w => usedWords.has(w))) continue;


            // --- Strategy 3: Label on one line, value on the next line ---
            if (i + 1 < lines.length) {
                const nextLine = lines[i+1];
                if (!nextLine.text.includes(':') && this.isValidLabel(lineText)) {
                    // Heuristic: next line is indented OR current line is a short, typical label
                    const isIndented = nextLine.bbox.x0 > lineBbox.x0 + 5;
                    const isShortLabel = lineText.length < 25 && lineText.split(' ').length < 5;
                    if (isIndented || isShortLabel) {
                        fields.push(this.createField(lineText, nextLine.text));
                        lineWords.forEach(w => usedWords.add(w));
                        nextLine.words.forEach(w => usedWords.add(w));
                        continue;
                    }
                }
            }
            
            // --- Strategy 4: A standalone line that looks like a label gets an empty input field ---
            if (this.isValidLabel(lineText)) {
                fields.push(this.createField(lineText, ''));
                lineWords.forEach(w => usedWords.add(w));
            }
        }
        
        return this.removeDuplicateFields(fields);
    }
    
    groupWordsIntoLines(words) {
        if (!words || words.length === 0) return [];
        
        const lines = [];
        let currentLineWords = [words[0]];

        for (let i = 1; i < words.length; i++) {
            const prevWord = words[i - 1];
            const currentWord = words[i];
            
            const verticalMidpointPrev = prevWord.bbox.y0 + (prevWord.bbox.y1 - prevWord.bbox.y0) / 2;
            const verticalMidpointCurr = currentWord.bbox.y0 + (currentWord.bbox.y1 - currentWord.bbox.y0) / 2;
            
            // If vertical midpoints are close, they are on the same line
            if (Math.abs(verticalMidpointPrev - verticalMidpointCurr) < (prevWord.bbox.y1 - prevWord.bbox.y0) / 2) {
                currentLineWords.push(currentWord);
            } else {
                lines.push(this.finalizeLine(currentLineWords));
                currentLineWords = [currentWord];
            }
        }
        lines.push(this.finalizeLine(currentLineWords));

        return lines;
    }

    finalizeLine(words) {
        if (!words || words.length === 0) return null;
        words.sort((a,b) => a.bbox.x0 - b.bbox.x0); // ensure left-to-right order
        const x0 = Math.min(...words.map(w => w.bbox.x0));
        const y0 = Math.min(...words.map(w => w.bbox.y0));
        const x1 = Math.max(...words.map(w => w.bbox.x1));
        const y1 = Math.max(...words.map(w => w.bbox.y1));
        const text = words.map(w => w.text).join(' ').trim();
        return { words, bbox: { x0, y0, x1, y1 }, text };
    }

    isValidLabel(text) {
        const cleanedText = text.trim();
        if (cleanedText.length < 2 || cleanedText.length > 50) return false;
        if (/^[\d\s\W_]+$/.test(cleanedText)) return false; // Not just numbers/symbols
        if (!/[a-zA-Z]/.test(cleanedText)) return false; // Must contain a letter
        if (/\S+@\S+\.\S+/.test(cleanedText)) return false; // Not an email
        if (/[\d\-\(\)\s\+]{7,}/.test(cleanedText)) return false; // Not a phone number
        return true;
    }

    createField(label, value) {
        const cleanedLabel = this.formatLabel(label);
        const cleanedValue = this.cleanOCRText(value);
        
        return {
            label: cleanedLabel,
            name: cleanedLabel.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 50),
            type: this.detectFieldType(cleanedLabel, cleanedValue),
            value: cleanedValue,
            placeholder: `Enter ${cleanedLabel.toLowerCase()}`
        };
    }
    
    formatLabel(label) {
        return label.replace(/([a-z])([A-Z])/g, '$1 $2')
                   .replace(/\b\w/g, l => l.toUpperCase())
                   .replace(/[:]$/, '') // Remove trailing colon
                   .trim();
    }
    
    detectFieldType(label, value) {
        const lowerLabel = label.toLowerCase();
        
        if (lowerLabel.includes('email')) return 'email';
        if (lowerLabel.includes('phone') || lowerLabel.includes('tel') || lowerLabel.includes('mobile')) return 'tel';
        if (lowerLabel.includes('date') || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(value)) return 'date';
        if (lowerLabel.includes('age') || lowerLabel.includes('amount') || lowerLabel.includes('total') || /^\d+$/.test(value)) return 'number';
        if (lowerLabel.includes('address') || lowerLabel.includes('comment') || value.length > 60 || value.includes('\n')) return 'textarea';
        
        return 'text';
    }
    
    removeDuplicateFields(fields) {
        const seen = new Set();
        return fields.filter(field => {
            const key = field.label.toLowerCase().replace(/\s+/g, '');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    
    showResults() {
        this.processingSection.style.display = 'none';
        this.previewSection.style.display = 'block';
    }
    
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');
    }
    
    downloadData() {
        const formData = new FormData(this.extractedForm);
        const data = Object.fromEntries(formData.entries());
        
        const jsonData = {
            extractedText: this.rawText.value,
            formFields: data,
            timestamp: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `document_scan_${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
    
    retakePhoto() {
        this.processingSection.style.display = 'none';
        this.previewSection.style.display = 'none';
        this.cameraSection.style.display = 'block';
        
        this.startCamera();
    }
    
    newScan() {
        this.previewSection.style.display = 'none';
        this.cameraSection.style.display = 'block';
        
        this.startCameraBtn.style.display = 'inline-flex';
        this.captureBtn.style.display = 'none';
        this.retakeBtn.style.display = 'none';
        
        this.progressBar.style.width = '0%';
        this.extractedForm.innerHTML = '';
        this.rawText.value = '';
    }
}

// Initialize the scanner when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new DocumentScanner();
});