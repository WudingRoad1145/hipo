console.log('Content script loaded');
class ContentController {
    constructor() {
        console.log('Initializing content controller');
        this.extractor = new ContentExtractor();
        this.setupMessageListeners();
    }
  
    setupMessageListeners() {
        console.log('Setting up message listeners');
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Received message:', request);
            // Return true immediately to indicate we'll respond asynchronously
            this.handleMessage(request, sender, sendResponse);
            console.log('Message handled:', this.handleMessage(request, sender, sendResponse));
            return true; // chrome extension rule: always return true for async responses
        });
    }
  
    async handleMessage(request, sender, sendResponse) {
        console.log('Handling message:', request.action);
        try {
          switch (request.action) {
            case 'getContentAnalysis':
              const content = await this.extractor.extractContent();
              console.log('Extracted content:', content);
              sendResponse({ success: true, content });
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
    
  
    async handleContentAnalysis(sendResponse) {
      try {
        const content = await this.extractor.extractContent();
        sendResponse({ success: true, content });
      } catch (error) {
        console.error('Content analysis failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    }
  
    handleSettingsUpdate(settings, sendResponse) {
      try {
        this.extractor.updateSettings(settings);
        sendResponse({ success: true });
      } catch (error) {
        console.error('Settings update failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    }
  
    async handleContentChange(sendResponse) {
      try {
        const content = await this.extractor.extractContent();
        // Send to background for analysis
        chrome.runtime.sendMessage({
          action: 'analyzeContent',
          content
        }, sendResponse);
      } catch (error) {
        console.error('Content change handling failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    }
  
    destroy() {
      this.extractor.destroy();
    }
  }
  
  // Initialize controller when content script loads
  console.log('Creating ContentController instance');
  const controller = new ContentController();
  
  // Cleanup on unload
  window.addEventListener('unload', () => {
    controller.destroy();
  });