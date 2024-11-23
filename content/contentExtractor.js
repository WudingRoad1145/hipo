class ContentExtractor {
  constructor() {
      this.settings = {
          minContentLength: 100,
          maxAnalysisFrequency: 2000,
          enableDynamicAnalysis: true
      };
  }

  async extractContent() {
      console.log('Starting content extraction');
      try {
          const content = this.getPageContent();
          console.log('Extracted raw content:', {
            fullText: content,
            length: content.length,
            preview: content.substring(0,200) + '...'
          });

          if (!content || content.trim().length < this.settings.minContentLength) {
              console.warn('Insufficient content length');
              throw new Error('Not enough content found on page');
          }

          const result = {
                url: window.location.href,
                domain: window.location.hostname,
                title: document.title,
                content: this.cleanContent(content),
                metadata: this.extractMetadata(),
                timestamp: Date.now()
            };

            console.log('Processed content:', {
                ...result,
            contentPreview: result.content.substring(0, 200) + '...'
        });
            return result;
      } catch (error) {
          console.error('Content extraction failed:', error);
          throw error;
      }
  }

  getPageContent() {
      // Try multiple methods to get the content
      const methods = [
            this.getArticleContent,
            this.getMainContent,
            this.getAllParagraphs,
            this.getBodyContent
      ];

        for (const method of methods) {
            console.log(`Trying extraction method: ${method.name}`);
            const content = method.call(this);
            if (content && content.length > this.settings.minContentLength) {
                console.log(`Successfully extracted content using ${method.name}`);
                return content;
            }
            console.log(`Method ${method.name} failed or returned insufficient content`);
        }

      // Fallback to body text if nothing else works
      console.log('All extraction methods failed, falling back to body text');
      return document.body.textContent;
  }

  getArticleContent() {
      // Try to find article content first
      const selectors = [
          'article',
          '[role="article"]',
          '[role="main"]',
          'main',
          '#article',
          '.article',
          '.post-content',
          '.entry-content'
      ];

      for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
              return element.textContent;
          }
      }
      return null;
  }

  getMainContent() {
      // Look for main content areas
      const mainElement = document.querySelector('main');
      if (mainElement) {
          return mainElement.textContent;
      }
      return null;
  }

  getAllParagraphs() {
      // Collect all paragraphs
      const paragraphs = Array.from(document.getElementsByTagName('p'))
          .map(p => p.textContent.trim())
          .filter(text => text.length > 20); // Filter out very short paragraphs

      if (paragraphs.length > 0) {
          return paragraphs.join('\n\n');
      }
      return null;
  }

  getBodyContent() {
      // Remove common noisy elements
      const bodyClone = document.body.cloneNode(true);
      const elementsToRemove = bodyClone.querySelectorAll(
          'header, footer, nav, aside, script, style, .header, .footer, .nav, .menu, .sidebar, .ad, .advertisement'
      );
      
      elementsToRemove.forEach(element => element.remove());
      return bodyClone.textContent;
  }

  cleanContent(text) {
      return text
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .replace(/\n\s*\n/g, '\n') // Replace multiple newlines with single newline
          .trim();
  }

  extractMetadata() {
      return {
          author: this.findMetaContent('author') || this.findMetaContent('article:author'),
          publishDate: this.findMetaContent('article:published_time') || 
                      this.findMetaContent('publishedDate'),
          keywords: this.findMetaContent('keywords'),
          description: this.findMetaContent('description')
      };
  }

  findMetaContent(name) {
      return document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.content;
  }
}