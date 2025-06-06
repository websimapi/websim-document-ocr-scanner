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
            
            // Create worker with better configuration
            const worker = await Tesseract.createWorker('eng', 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        this.progressBar.style.width = `${progress}%`;
                    }
                }
            });
            
            // Configure worker for better accuracy
            await worker.setParameters({
                'tessedit_char_whitelist': 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?@#$%^&*()_+-=[]{}|;:\'",.<>?/\\ \n\t',
                'tessedit_pageseg_mode': '1', // Automatic page segmentation with OSD
            });
            
            const { data: { text, confidence } } = await worker.recognize(imageData);
            await worker.terminate();
            
            console.log(`OCR Confidence: ${confidence}%`);
            
            if (!text || text.trim().length === 0) {
                throw new Error('No text detected in the image. Please ensure the document is clearly visible and well-lit.');
            }
            
            if (confidence < 30) {
                console.warn('Low confidence OCR result, but proceeding...');
            }
            
            // Process the extracted text
            this.processExtractedText(text);
            
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
    
    processExtractedText(text) {
        // Set raw text
        this.rawText.value = text;
        
        // Generate form from text
        this.generateForm(text);
        
        // Show results
        this.showResults();
    }
    
    generateForm(text) {
        const formFields = this.extractFormFields(text);
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
            message.textContent = 'No form fields detected. The extracted text is available in the Raw Text tab.';
            message.style.textAlign = 'center';
            message.style.color = '#666';
            message.style.fontStyle = 'italic';
            this.extractedForm.appendChild(message);
        }
    }
    
    extractFormFields(text) {
        const fields = [];
        const lines = text.split('\n').filter(line => line.trim());
        
        // Common form field patterns
        const patterns = [
            { regex: /name[:\s]*(.+)/i, label: 'Name', type: 'text' },
            { regex: /first\s*name[:\s]*(.+)/i, label: 'First Name', type: 'text' },
            { regex: /last\s*name[:\s]*(.+)/i, label: 'Last Name', type: 'text' },
            { regex: /email[:\s]*(.+)/i, label: 'Email', type: 'email' },
            { regex: /phone[:\s]*(.+)/i, label: 'Phone', type: 'tel' },
            { regex: /address[:\s]*(.+)/i, label: 'Address', type: 'textarea' },
            { regex: /city[:\s]*(.+)/i, label: 'City', type: 'text' },
            { regex: /state[:\s]*(.+)/i, label: 'State', type: 'text' },
            { regex: /zip[:\s]*(.+)/i, label: 'ZIP Code', type: 'text' },
            { regex: /date[:\s]*(.+)/i, label: 'Date', type: 'date' },
            { regex: /signature[:\s]*(.+)/i, label: 'Signature', type: 'text' },
            { regex: /company[:\s]*(.+)/i, label: 'Company', type: 'text' },
            { regex: /title[:\s]*(.+)/i, label: 'Title', type: 'text' },
            { regex: /age[:\s]*(.+)/i, label: 'Age', type: 'number' },
            { regex: /amount[:\s]*(.+)/i, label: 'Amount', type: 'number' }
        ];
        
        lines.forEach(line => {
            for (const pattern of patterns) {
                const match = line.match(pattern.regex);
                if (match) {
                    const value = match[1] ? match[1].trim() : '';
                    // Only add if value looks like it might be filled in
                    if (value && value.length > 0 && !value.includes('_') && !value.includes('.')) {
                        fields.push({
                            label: pattern.label,
                            name: pattern.label.toLowerCase().replace(/\s+/g, '_'),
                            type: pattern.type,
                            value: value,
                            placeholder: `Enter ${pattern.label.toLowerCase()}`
                        });
                        break; // Don't match multiple patterns for the same line
                    }
                }
            }
        });
        
        // If no specific patterns match, create fields for any line that looks like a label-value pair
        if (fields.length === 0) {
            lines.forEach((line, index) => {
                if (line.includes(':') || line.match(/^[A-Za-z\s]+\s+[A-Za-z0-9\s@.-]+$/)) {
                    const parts = line.split(/[:]\s*/);
                    if (parts.length >= 2) {
                        fields.push({
                            label: parts[0].trim(),
                            name: `field_${index}`,
                            type: 'text',
                            value: parts.slice(1).join(':').trim(),
                            placeholder: `Enter ${parts[0].trim().toLowerCase()}`
                        });
                    }
                }
            });
        }
        
        return fields;
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