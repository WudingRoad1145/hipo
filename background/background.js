console.log('Background script loaded');

class BackgroundController {
  constructor() {
    this.analyzer = new BackgroundAnalyzer();
    this.setupListeners();
    console.log('BackgroundController initialized');
  }

  setupListeners() {
    // Handle initial page load
    chrome.webNavigation.onCompleted.addListener(({ tabId, frameId }) => {
      if (frameId === 0) { // Only handle main frame
        this.initializeAnalysis(tabId);
      }
    });

    // Handle SPA navigation
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.url) {
        this.initializeAnalysis(tabId);
      }
    });

    // Handle messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async response
    });
  }

  async handleMessage(request, sender, sendResponse) {
    console.log('Handling message:', request.action);
    try {
      switch (request.action) {
        case 'analyzeContent':
          // Use request.tabId instead of sender.tab.id TODO might be wrong
          const tabId = request.tabId || (sender && sender.tab && sender.tab.id);
          if (!tabId) {
              throw new Error('No tab ID provided');
          }
          
          (async () => {
              try {
                  const analysis = await this.analyzer.handleContentAnalysis(
                      request.content,
                      tabId
                  );
                  sendResponse({ success: true, analysis });
              } catch (error) {
                  sendResponse({ success: false, error: error.message });
              }
          })();
          break;

        case 'submitFeedback':
          await this.analyzer.storeFeedback(request.feedback);
          sendResponse({ success: true });
          break;

        case 'reportIssue':
          await this.analyzer.storeReport(request.data);
          sendResponse({ success: true });
          break;

        default:
          console.warn('Unknown action:', request.action);
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Message handling failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async initializeAnalysis(tabId) {
    console.log('Initializing analysis for tab:', tabId);
    try {
        this.updateBadge(tabId, 'analyzing');

        // Execute content script if not already done
        await this.ensureContentScript(tabId);
        
        // Add delay to ensure content script is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const response = await chrome.tabs.sendMessage(tabId, { 
            action: 'getContentAnalysis' 
        });

        
        console.log('Content analysis response:', {
            success: response?.success,
            url: response?.content?.url,
            title: response?.content?.title,
            contentLength: response?.content?.content?.length,
            contentPreview: response?.content?.content?.substring(0, 200) + '...',
            fullContent: response?.content?.content // This will show the full text
        });

        if (!response?.success || !response?.content) {
            throw new Error(response.error || 'Failed to analyze content');
        }

        console.log('Content extracted:', {
            url: response.content.url,
            title: response.content.title,
            contentLength: response.content.content.length
        });

        const analysis = await this.analyzer.handleContentAnalysis(response.content, tabId);
        await this.storeAnalysis(tabId, analysis);
        
        this.updateBadge(tabId, 'ready', analysis.polarizationScore);
        } catch (error) {
            console.error('Analysis initialization failed:', error);
            this.updateBadge(tabId, 'error');
        }
    }
    async ensureContentScript(tabId) {
        try {
            // Get the tab URL first
            const tab = await chrome.tabs.get(tabId);
            
            // Skip content script injection for extension pages
            if (tab.url.startsWith('chrome-extension://')) {
                console.log('Skipping content script injection for extension page');
                return;
            }

            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content/contentExtractor.js', 'content/content.js']
            });
        } catch (error) {
            console.log('Content script already injected or injection failed:', error);
        }
    }

    async storeAnalysis(tabId, analysis) {
        console.log('Storing analysis for tab:', tabId);
        await chrome.storage.session.set({
        [`tab-${tabId}`]: {
            analysis,
            timestamp: Date.now()
        }
        });
    }

    updateBadge(tabId, status, score = 0) {
        const badges = {
        analyzing: { text: '...', color: '#808080' },
        ready: { text: score > 70 ? '!' : '✓', color: score > 70 ? '#FFB100' : '#8BC34A' },
        error: { text: '×', color: '#FF4444' }
        };
        
        const badge = badges[status];
        chrome.action.setBadgeText({ text: badge.text, tabId });
        chrome.action.setBadgeBackgroundColor({ color: badge.color, tabId });
    }
}

class BackgroundAnalyzer {
    constructor() {
      this.analysisCache = new Map();
      this.apiConfig = null;
      this.initializeAPI(); // Initial call but don't await here
    }
  
    async initializeAPI() {
      console.log('Initializing API settings');
      try {
        const { apiKey } = await chrome.storage.local.get(['apiKey']);
        
        if (!apiKey) {
          console.warn('No API key found in storage. Please configure in extension settings.');
          this.apiConfig = null;
          return;
        }
  
        this.apiConfig = {
          key: apiKey,
          preferredApi: 'claude'
        };
  
        console.log('API initialized successfully');
      } catch (error) {
        console.error('API initialization failed:', error);
        this.apiConfig = null;
      }
    }
  
    async handleContentAnalysis(content, tabId) {
      // Check API configuration first
      if (!this.apiConfig?.key) {
        try {
          await this.initializeAPI(); // Try to initialize again
          if (!this.apiConfig?.key) {
            throw new Error('Please configure your Claude API key in extension settings');
          }
        } catch (error) {
          throw new Error('API configuration error. Please check extension settings.');
        }
      }
  
      const cacheKey = `${content.url}-${content.timestamp}`;
      console.log('Handling content analysis for:', cacheKey);
  
      if (this.analysisCache.has(cacheKey)) {
        console.log('Returning cached analysis');
        return this.analysisCache.get(cacheKey);
      }
  
      try {
        const analysis = await this.analyzePolarization(content);
        this.analysisCache.set(cacheKey, analysis);
        this.cleanupCache();
        return analysis;
      } catch (error) {
        console.error('Analysis failed:', error);
        // Enhance error message based on type
        if (error.message.includes('401')) {
          throw new Error('Invalid API key. Please check your settings.');
        }
        throw error;
      }
    }

    async analyzePolarization(content) {
        if (!this.apiConfig?.key) {
          throw new Error('API not configured');
        }
    
        console.log('Starting Claude analysis with content:', {
          contentLength: content.content.length,
          url: content.url
        });
    
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this.apiConfig.key,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
              model: "claude-3-5-sonnet-latest",
              max_tokens: 1000,
              system: `Analyze the following content for polarization and bias. 
                        Provide a structured response in exactly this format:
                        Polarization score: [0-100]
                        Main viewpoint summary: [one concise sentence]
                        Detected biases: [exactly 3 most significant biases, bullet points]
                        Missing perspectives: [exactly 3 key missing viewpoints, bullet points]
                        Alternative viewpoints: [exactly 3 suggested articles in markdown link format]

                        For alternative viewpoints, provide links in this format:
                        • [Article Title 1](URL1) - Brief description
                        • [Article Title 2](URL2) - Brief description
                        • [Article Title 3](URL3) - Brief description
                        
                        Keep responses concise and focused on the most important points.
                        `,
            messages: [{
                role: "user",
                content: content.content
              }]
            })
          });
    
          console.log('Claude API response status:', response.status);
    
          if (!response.ok) {
            const errorText = await response.text();
            console.error('Claude API error:', errorText);
            
            // Enhanced error handling
            switch (response.status) {
                case 401:
                    if (errorText.includes('CORS')) {
                        throw new Error('Browser access not properly configured. Please check API headers.');
                    } else {
                        throw new Error('Invalid API key. Please check your settings.');
                    }
                case 403:
                    throw new Error('Access forbidden. Please check API permissions.');
                case 429:
                    throw new Error('Rate limit exceeded. Please try again later.');
                case 500:
                    throw new Error('Claude API service error. Please try again later.');
                default:
                    throw new Error(`API Error: ${response.status} - ${errorText}`);
            }
          }
    
          const result = await response.json();
          console.log('Claude API response:', result);
          return this.parseAnalysis(result);
        } catch (error) {
          console.error('Claude analysis failed:', error);
          throw error;
        }
    }

    parseAnalysis(response) {
        try {
            // Get the content from response
            let content;
            if (response.content) {
                content = response.content;
            } else if (response.messages && response.messages[0]) {
                content = response.messages[0].content;
            } else {
                throw new Error('Unexpected response format');
            }
    
            if (typeof content !== 'string') {
                console.error('Unexpected content type:', typeof content, content);
                throw new Error('Content is not a string');
            }
    
            return {
                polarizationScore: this.extractPolarizationScore(content),
                summary: this.extractSection(content, 'Main viewpoint summary'),
                biases: this.extractListSection(content, 'Detected biases', 3),
                missingPerspectives: this.extractListSection(content, 'Missing perspectives', 3),
                alternativeViewpoints: this.extractLinkSection(content, 'Alternative viewpoints')
            };
        } catch (error) {
            console.error('Failed to parse LLM response:', error);
            console.log('Raw response:', response);
            throw new Error(`Invalid response format from LLM: ${error.message}`);
        }
    }

    // Base extractor - used by other methods
    extractSection(content, sectionName) {
        try {
            // This regex finds content between section headers
            const regex = new RegExp(`${sectionName}:?([^\\n]*(?:\\n(?!\\w+:)[^\\n]*)*)`, 'i');
            const match = content.match(regex);
            const extracted = match ? match[1].trim() : '';
            console.log(`Extracted ${sectionName}:`, extracted);
            return extracted;
        } catch (error) {
            console.error(`Failed to extract section ${sectionName}:`, error);
            return '';
        }
    }

    extractPolarizationScore(content) {
        try {
            const match = content.match(/Polarization score:\s*(\d+)/i);
            return match ? Math.min(100, Math.max(0, parseInt(match[1]))) : 50;
        } catch (error) {
            console.error('Failed to extract polarization score:', error);
            return 50; // default score
        }
    }
    
    extractListSection(content, sectionName, maxItems = 3) {
        try {
            const section = this.extractSection(content, sectionName);
            return section
                .split(/\n/)
                .map(item => item.replace(/^[-*•]\s*/, '').trim())
                .filter(Boolean)
                .slice(0, maxItems);
        } catch (error) {
            console.error(`Failed to extract ${sectionName}:`, error);
            return [];
        }
    }

    extractLinkSection(content, sectionName) {
        try {
            const section = this.extractSection(content, sectionName);
            return section
                .split(/\n/)
                .map(item => {
                    const matches = item.match(/\[(.*?)\]\((.*?)\)/);
                    if (matches) {
                        return {
                            title: matches[1],
                            url: matches[2]
                        };
                    }
                    return {
                        title: item.replace(/^[-*•]\s*/, '').trim(),
                        url: '#'
                    };
                })
                .slice(0, 3);
        } catch (error) {
            console.error('Failed to extract links:', error);
            return [];
        }
    }

    cleanupCache() {
        const MAX_CACHE_SIZE = 100;
        const MAX_AGE = 30 * 60 * 1000; // 30 minutes
        const now = Date.now();

        // Remove old entries
        for (const [key, value] of this.analysisCache.entries()) {
        if (now - value.timestamp > MAX_AGE) {
            this.analysisCache.delete(key);
        }
        }

        // Remove excess entries if still too large
        if (this.analysisCache.size > MAX_CACHE_SIZE) {
        const oldestKey = this.analysisCache.keys().next().value;
        this.analysisCache.delete(oldestKey);
        }
    }

    async storeFeedback(feedback) {
        console.log('Storing feedback:', feedback);
        // Implement feedback storage logic here
        // You might want to send this to your backend or store locally
    }

    async storeReport(report) {
        console.log('Storing report:', report);
        // Implement report storage logic here
        // You might want to send this to your backend or store locally
    }
}

// Initialize the controller
const controller = new BackgroundController();