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
                'tessedit_pageseg_mode': '6', // Uniform block of text
                'tessedit_ocr_engine_mode': '2', // LSTM neural net mode
                'classify_bln_numeric_mode': '1',
                'textord_really_old_xheight': '1',
                'textord_min_xheight': '12',
            });
            
            const { data: { text, confidence } } = await worker.recognize(processedImageData);
            await worker.terminate();
            
            console.log(`OCR Confidence: ${confidence}%`);
            
            if (!text || text.trim().length === 0) {
                throw new Error('No text detected in the image. Please ensure the document is clearly visible and well-lit.');
            }
            
            // Clean and process the text
            const cleanedText = this.cleanOCRText(text);
            
            // Process the extracted text
            this.processExtractedText(cleanedText);
            
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
        return text
            // Remove extra whitespace
            .replace(/\s+/g, ' ')
            // Fix common OCR errors
            .replace(/[|]/g, 'l')
            .replace(/[0]/g, 'O')
            .replace(/[1]/g, 'l')
            .replace(/rn/g, 'm')
            .replace(/vv/g, 'w')
            // Clean up line breaks
            .replace(/\s*\n\s*/g, '\n')
            .trim();
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
        
        // Enhanced form field patterns with better regex
        const patterns = [
            { regex: /(?:full\s*)?name[:\s]*(.+)/i, label: 'Full Name', type: 'text' },
            { regex: /first\s*name[:\s]*(.+)/i, label: 'First Name', type: 'text' },
            { regex: /last\s*name[:\s]*(.+)/i, label: 'Last Name', type: 'text' },
            { regex: /middle\s*(?:name|initial)[:\s]*(.+)/i, label: 'Middle Name', type: 'text' },
            { regex: /(?:email|e-mail)[:\s]*(.+)/i, label: 'Email', type: 'email' },
            { regex: /(?:phone|telephone|tel)[:\s]*(.+)/i, label: 'Phone', type: 'tel' },
            { regex: /(?:mobile|cell)[:\s]*(.+)/i, label: 'Mobile', type: 'tel' },
            { regex: /address[:\s]*(.+)/i, label: 'Address', type: 'textarea' },
            { regex: /street[:\s]*(.+)/i, label: 'Street Address', type: 'text' },
            { regex: /city[:\s]*(.+)/i, label: 'City', type: 'text' },
            { regex: /state[:\s]*(.+)/i, label: 'State', type: 'text' },
            { regex: /(?:zip|postal)[:\s]*(.+)/i, label: 'ZIP Code', type: 'text' },
            { regex: /country[:\s]*(.+)/i, label: 'Country', type: 'text' },
            { regex: /(?:birth\s*)?date[:\s]*(.+)/i, label: 'Date', type: 'date' },
            { regex: /signature[:\s]*(.+)/i, label: 'Signature', type: 'text' },
            { regex: /company[:\s]*(.+)/i, label: 'Company', type: 'text' },
            { regex: /(?:job\s*)?title[:\s]*(.+)/i, label: 'Job Title', type: 'text' },
            { regex: /position[:\s]*(.+)/i, label: 'Position', type: 'text' },
            { regex: /age[:\s]*(.+)/i, label: 'Age', type: 'number' },
            { regex: /(?:amount|total)[:\s]*(.+)/i, label: 'Amount', type: 'number' },
            { regex: /(?:ssn|social\s*security)[:\s]*(.+)/i, label: 'SSN', type: 'text' },
            { regex: /(?:id|identification)[:\s]*(.+)/i, label: 'ID Number', type: 'text' },
            { regex: /license[:\s]*(.+)/i, label: 'License Number', type: 'text' },
            { regex: /(?:emergency\s*)?contact[:\s]*(.+)/i, label: 'Emergency Contact', type: 'text' },
            { regex: /(?:comments|notes|remarks)[:\s]*(.+)/i, label: 'Comments', type: 'textarea' }
        ];
        
        // Process each line for field detection
        lines.forEach((line, lineIndex) => {
            const cleanLine = line.trim();
            
            // Skip very short lines or lines that look like headers
            if (cleanLine.length < 3 || /^[A-Z\s]+$/.test(cleanLine)) {
                return;
            }
            
            // Check against patterns
            for (const pattern of patterns) {
                const match = cleanLine.match(pattern.regex);
                if (match && match[1]) {
                    const value = match[1].trim();
                    
                    // Validate the extracted value
                    if (this.isValidFieldValue(value, pattern.type)) {
                        fields.push({
                            label: pattern.label,
                            name: pattern.label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                            type: pattern.type,
                            value: value,
                            placeholder: `Enter ${pattern.label.toLowerCase()}`
                        });
                        break; // Don't match multiple patterns for the same line
                    }
                }
            }
            
            // If no pattern matched, try to detect label-value pairs
            if (!fields.some(f => cleanLine.includes(f.label))) {
                const colonMatch = cleanLine.match(/^([^:]+):\s*(.+)$/);
                const tabMatch = cleanLine.match(/^([^\t]+)\t+(.+)$/);
                const spaceMatch = cleanLine.match(/^([A-Za-z\s]{3,20})\s{2,}(.+)$/);
                
                const match = colonMatch || tabMatch || spaceMatch;
                if (match && match[1] && match[2]) {
                    const label = match[1].trim();
                    const value = match[2].trim();
                    
                    if (this.isValidFieldValue(value, 'text') && !this.isLikelyHeader(label)) {
                        fields.push({
                            label: this.formatLabel(label),
                            name: label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                            type: this.detectFieldType(label, value),
                            value: value,
                            placeholder: `Enter ${label.toLowerCase()}`
                        });
                    }
                }
            }
        });
        
        // Remove duplicates based on similar labels
        return this.removeDuplicateFields(fields);
    }
    
    isValidFieldValue(value, type) {
        if (!value || value.length === 0) return false;
        
        // Check for common OCR artifacts
        if (/^[_\-\.]+$/.test(value)) return false;
        if (value.length > 200) return false;
        if (value.split('').every(char => char === value[0])) return false;
        
        // Type-specific validation
        switch (type) {
            case 'email':
                return /\S+@\S+\.\S+/.test(value);
            case 'tel':
                return /[\d\-\(\)\s\+]{7,}/.test(value);
            case 'number':
                return /^\d+\.?\d*$/.test(value);
            default:
                return value.length >= 1 && value.length <= 100;
        }
    }
    
    isLikelyHeader(text) {
        return /^[A-Z\s]+$/.test(text) && text.length > 15;
    }
    
    formatLabel(label) {
        return label.replace(/([a-z])([A-Z])/g, '$1 $2')
                   .replace(/\b\w/g, l => l.toUpperCase())
                   .trim();
    }
    
    detectFieldType(label, value) {
        const lowerLabel = label.toLowerCase();
        
        if (lowerLabel.includes('email')) return 'email';
        if (lowerLabel.includes('phone') || lowerLabel.includes('tel')) return 'tel';
        if (lowerLabel.includes('date') || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(value)) return 'date';
        if (lowerLabel.includes('age') || lowerLabel.includes('amount') || /^\d+$/.test(value)) return 'number';
        if (lowerLabel.includes('address') || lowerLabel.includes('comment') || value.length > 50) return 'textarea';
        
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