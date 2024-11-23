class HipoUI {
    // Static configuration object
    static POLARIZATION_LEVELS = {
        balanced: {
          range: [0, 30],
          title: 'Fairly Balanced Views',
          message: 'This content presents a balanced perspective.',
          color: '#4CAF50', // Green
          icon: '✓'
        },
        slight: {
          range: [31, 60],
          title: 'Potential Bias Detected',
          message: 'Consider exploring other perspectives for a fuller understanding.',
          color: '#FFC107', // Yellow
          icon: '💡'
        },
        moderate: {
          range: [61, 80],
          title: 'Slightly Biased Views',
          message: 'This content shows notable bias. Here are some alternative viewpoints:',
          color: '#FF9800', // Orange
          icon: '⚡'
        },
        extreme: {
          range: [81, 100],
          title: 'Extremely Skewed Views Detected',
          message: 'Strong bias detected. Consider these opposing perspectives:',
          color: '#F44336', // Red
          icon: '⚠️'
        }
    };

    constructor() {
        console.log('Initializing HipoUI');
        this.initializeElements();
        this.bindEvents();
        this.initializeUI();
    }
    
    initializeElements() {
        console.log('Setting up UI elements');
        this.elements = {
            polarizationMeter: document.getElementById('polarization-meter'),
            leftLabel: document.getElementById('left-label'),
            rightLabel: document.getElementById('right-label'),
            submitBtn: document.getElementById('submit-btn'),
            reportBtn: document.getElementById('report-btn'),
            warningCard: document.getElementById('warning-card'),
            status: document.getElementById('status'),
            alternatives: document.getElementById('alternatives')
        };

        // Verify all elements are found
        Object.entries(this.elements).forEach(([key, element]) => {
            if (!element) {
            console.error(`Failed to find element: ${key}`);
            }
        });
    }    
    

    bindEvents() {
        console.log('Binding UI events');
        if (this.elements.submitBtn) {
            this.elements.submitBtn.addEventListener('click', () => this.handleSubmit());
        }
        if (this.elements.reportBtn) {
            this.elements.reportBtn.addEventListener('click', () => this.handleReport());
        }
        if (this.elements.polarizationMeter) {
            this.elements.polarizationMeter.addEventListener('input', (e) => {
                const { level, config } = this.getPolarizationLevel(parseInt(e.target.value));
                this.updateSlider(e.target.value, config.color);
            });
        }
    }

    async initializeUI() {
        console.log('Starting UI initialization');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log('Current tab:', tab);

            if (!tab) {
                throw new Error('No active tab found');
            }

            this.updateStatus('Checking stored analysis...');
            const stored = await chrome.storage.session.get(`tab-${tab.id}`);
            console.log('Stored analysis:', stored);

            if (stored && stored[`tab-${tab.id}`]) {
                this.updateUIWithAnalysis(stored[`tab-${tab.id}`].analysis);
            } else {
                this.updateStatus('Requesting new analysis...');
                await this.requestAnalysis(tab.id);
            }
        } catch (error) {
            console.error('UI initialization failed:', error);
            this.updateStatus('Failed to initialize. Please try again.');
        }
    }

    async requestAnalysis(tabId) {
        console.log('Requesting analysis for tab:', tabId);
        if (!tabId) {
            console.error('No tab ID provided');
            this.updateStatus('Error: Could not identify current tab');
            return;
        }

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'analyzeContent',
                tabId: tabId
            });
            console.log('Analysis response:', response);

            if (response.success) {
                this.updateUIWithAnalysis(response.analysis);
            } else {
                throw new Error(response.error || 'Analysis failed');
            }
        } catch (error) {
            console.error('Analysis request failed:', error);
            this.updateStatus('Analysis failed. Please try again.');
        }
    }

    updateStatus(message) {
        console.log('Status update:', message);
        if (this.elements.status) {
            this.elements.status.textContent = message;
        }
    }

    getPolarizationLevel(score) {
        // Use the static configuration
        for (const [level, config] of Object.entries(HipoUI.POLARIZATION_LEVELS)) {
          if (score >= config.range[0] && score <= config.range[1]) {
            return { level, config };
          }
        }
        return { 
          level: 'balanced', 
          config: HipoUI.POLARIZATION_LEVELS.balanced 
        };
    }

    updateUIWithAnalysis(analysis) {
        console.log('Updating UI with analysis:', analysis);
        const { level, config } = this.getPolarizationLevel(analysis.polarizationScore);
        
        // Update warning card
        if (this.elements.warningCard) {
          this.elements.warningCard.classList.remove('hidden');
          this.elements.warningCard.style.borderColor = config.color;
        }
        
        // Update status
        this.updateStatus('Analysis complete');
        
        // Update slider
        this.updateSlider(analysis.polarizationScore, config.color);
        
        // Update alternatives if score indicates bias
        if (analysis.polarizationScore > 30 && analysis.alternativeViewpoints) {
            this.updateAlternatives(analysis.alternativeViewpoints);
          }
        }

    updateSlider(value, color) {
        console.log('Updating slider:', { value, color });
        if (this.elements.polarizationMeter) {
            this.elements.polarizationMeter.value = value;
            this.elements.polarizationMeter.style.setProperty('--track-color', color);
        }
    }

  
    updateAlternatives(alternatives) {
        if (!alternatives?.length) return;
        
        this.elements.alternatives.innerHTML = alternatives
            .map(alt => `
                <div class="alternative">
                    <a href="${alt.url}" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    class="alternative-link">
                        <div class="alternative-title">${alt.title}</div>
                        ${alt.description ? `<div class="alternative-desc">${alt.description}</div>` : ''}
                        <span class="read-more">Read more ↗</span>
                    </a>
                </div>
            `)
            .join('');
    }

    async handleSubmit() {
        console.log('Handling submit');
        const feedback = {
            polarizationScore: this.elements.polarizationMeter.value,
            leftLabel: this.elements.leftLabel.value,
            rightLabel: this.elements.rightLabel.value,
            timestamp: new Date().toISOString()
        };

        try {
            await chrome.runtime.sendMessage({
                action: 'submitFeedback',
                feedback
            });
            
            this.elements.submitBtn.textContent = 'Submitted! ✨';
            setTimeout(() => {
                this.elements.submitBtn.textContent = 'Submit ✨';
            }, 2000);
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            this.updateStatus('Failed to submit feedback');
        }
    }

    async handleReport() {
        console.log('Handling report');
        try {
            await chrome.runtime.sendMessage({
                action: 'reportIssue',
                data: {
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                }
            });
            
            this.elements.reportBtn.textContent = 'Reported! 🚨';
            setTimeout(() => {
                this.elements.reportBtn.textContent = 'Report 🚨';
            }, 2000);
        } catch (error) {
            console.error('Failed to submit report:', error);
            this.updateStatus('Failed to submit report');
        }
    }
  }
  

  // Initialize when popup opens
document.addEventListener('DOMContentLoaded', () => {
    console.log('Popup opened');
    new HipoUI();
});