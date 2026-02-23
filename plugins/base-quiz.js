// plugins/base-quiz.js

/**
 * BaseQuizPlugin (The Logic & UI Engine)
 * A media-agnostic base class that handles the core "Identify the Item" game loop.
 * Supports both Image-based (URL) and Text-based (String) questions.
 * This class is NOT meant to be registered directly.
 */
class BaseQuizPlugin {
  constructor() {
    this.id = 'base-quiz';
    this.name = 'Base Quiz';
    this.title = 'Base Challenge';
    this.subtitle = 'Identify the items correctly';
    this.supportedModes = ['solo', 'race', 'compete', 'land-grab'];

    this.fullDataset = [];
    this.container = null;
    this.imgEl = null;
    this.textEl = null;
    this.overlay = null;
    this.nameDisplay = null;
    this.claims = {}; // { itemId: color }

    // Default configuration for styling
    this.uiConfig = {
        imagePadding: 'p-2',
        imageBg: 'bg-slate-700',
        imageRounded: 'rounded-2xl',
        aspectRatio: 'aspect-[3/2]',
        textClass: 'text-5xl sm:text-7xl font-bold text-white text-center px-4 py-12'
    };
  }

  // --- Core Implementation ---

  async loadScripts() {
    return Promise.resolve();
  }

  // To be implemented by subclasses
  async loadData() {
    throw new Error('loadData() must be implemented by subclass');
  }

  // To be implemented by subclasses
  getSettingsView() { return ''; }
  getLobbySettingsView() { return ''; }
  updateSettings(settings) {}

  // To be implemented by subclasses
  generateQuestionPool(settings) {
    return this.fullDataset.filter(item => this._isAllowed(item, settings));
  }

  getItemId(item) {
    return item.id;
  }

  getItemById(id) {
    if (!id) return null;
    return this.fullDataset.find(item => item.id.toString() === id.toString());
  }

  getCorrectAnswer(item) {
    return item.answer;
  }

  /**
   * Fuzzy check for typed answers.
   * Handles string normalization and Levenshtein distance.
   */
  checkTypedAnswer(item, answer) {
    const guess = this._normalizeString(answer);
    if (guess.length < 2) return false;

    const primary = this._normalizeString(this.getCorrectAnswer(item));
    if (guess === primary) return true;

    // Check additional acceptable answers if they exist
    if (item.acceptableAnswers) {
        for (const name of item.acceptableAnswers) {
            const normalized = this._normalizeString(name);
            if (guess === normalized || (normalized.includes(guess) && guess.length > 3)) {
                return true;
            }
        }
    }

    const distance = this._levenshteinDistance(guess, primary);
    const threshold = primary.length < 5 ? 1 : 2;
    return distance <= threshold;
  }

  /**
   * Picks 3 incorrect options from the pool/dataset to create a 4-choice set.
   */
  generateChoices(correctItem, pool) {
    const correctName = this.getCorrectAnswer(correctItem);
    const options = [{ text: correctName, correct: true }];
    const incorrectOptions = new Set();

    // Use a subset for performance if the pool is massive
    const source = (pool && pool.length > 5) ? pool : this.fullDataset;
    
    let attempts = 0;
    while (incorrectOptions.size < 3 && attempts < 100 && source.length > 1) {
        const randomItem = source[Math.floor(Math.random() * source.length)];
        const randomName = this.getCorrectAnswer(randomItem);
        if (randomName !== correctName) {
            incorrectOptions.add(randomName);
        }
        attempts++;
    }

    incorrectOptions.forEach(name => {
        options.push({ text: name, correct: false });
    });

    return options.sort(() => Math.random() - 0.5);
  }

  /**
   * Renders a generic media container that can show either images or text.
   */
  renderQuizView(container) {
    this.container = container;
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full w-full p-4 gap-6 bg-slate-900/50">
        <div id="quiz-display-container" class="relative group w-full flex items-center justify-center min-h-[40vh]">
            <!-- Image Media -->
            <div id="quiz-media-border" class="${this.uiConfig.imagePadding} ${this.uiConfig.imageBg} ${this.uiConfig.imageRounded} shadow-2xl transition-all duration-300 hidden">
                <img id="quiz-img" class="max-w-full max-h-[45vh] rounded-lg shadow-lg">
            </div>
            
            <!-- Text Media -->
            <div id="quiz-text" class="${this.uiConfig.textClass} hidden"></div>

            <!-- Generic Overlay (for Correct/Wrong state) -->
            <div id="quiz-overlay" class="absolute inset-0 flex items-center justify-center pointer-events-none z-10 hidden">
                <div id="quiz-name-display" class="text-3xl sm:text-4xl font-bold px-6 py-3 rounded-xl bg-black/80 backdrop-blur-sm border border-white/20 shadow-2xl"></div>
            </div>
        </div>
      </div>
    `;

    this.imgEl = document.getElementById('quiz-img');
    this.textEl = document.getElementById('quiz-text');
    this.overlay = document.getElementById('quiz-overlay');
    this.nameDisplay = document.getElementById('quiz-name-display');
  }

  bindUIEvents() {}

  /**
   * Displays the question. If media looks like a URL, it shows an image.
   * Otherwise, it renders as large text.
   */
  displayQuestion(item) {
    if (!item) return;
    const media = item.questionMedia || '';
    const isUrl = (typeof media === 'string') && (media.startsWith('http') || media.includes('/') || media.includes('.'));

    this.overlay.classList.add('hidden');
    
    const border = document.getElementById('quiz-media-border');
    if (isUrl) {
        this.imgEl.src = media;
        this.textEl.classList.add('hidden');
        border.classList.remove('hidden');
        border.style.backgroundColor = '';
        border.className = `${this.uiConfig.imagePadding} ${this.uiConfig.imageBg} ${this.uiConfig.imageRounded} shadow-2xl transition-all duration-300`;
    } else {
        this.textEl.textContent = media;
        this.textEl.style.color = '';
        this.textEl.classList.remove('hidden');
        border.classList.add('hidden');
    }
  }

  updateViewOnAnswer(item, correct, color) {
    const border = document.getElementById('quiz-media-border');
    if (border && !border.classList.contains('hidden')) {
        border.style.backgroundColor = color || (correct ? '#16a34a' : '#dc2626');
    } else {
        // For text-based, color the text
        this.textEl.style.color = color || (correct ? '#4ade80' : '#f87171');
    }
    const name = this.getCorrectAnswer(item);
    this.showOverlay(name, correct);
  }

  showOverlay(name, isCorrect) {
    if (!this.overlay || !this.nameDisplay) return;
    this.nameDisplay.textContent = name;
    this.nameDisplay.className = `text-3xl sm:text-4xl font-bold px-6 py-3 rounded-xl bg-black/80 backdrop-blur-sm border shadow-2xl ${isCorrect ? 'text-green-400 border-green-500/50' : 'text-red-400 border-red-500/50'}`;
    this.overlay.classList.remove('hidden');
  }

  colorItem(itemId, color) {
    this.claims[itemId] = color;
  }

  renderResultView(container) {
    if (!container) return;
    const claimedIds = Object.keys(this.claims);
    if (claimedIds.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 text-center">Collection</h3>
        <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
            ${claimedIds.map(id => {
                const color = this.claims[id];
                const item = this.getItemById(id);
                if (!item) return '';
                
                const isUrl = (typeof item.questionMedia === 'string') && (item.questionMedia.startsWith('http') || item.questionMedia.includes('/') || item.questionMedia.includes('.'));
                const content = isUrl 
                    ? `<img src="${item.thumbnailUrl || item.questionMedia}" class="max-w-full max-h-full rounded-sm shadow-sm pointer-events-none">`
                    : `<span class="text-[10px] font-bold text-white text-center line-clamp-2">${item.questionMedia}</span>`;

                return `
                    <div class="${this.uiConfig.aspectRatio} rounded-md p-1 shadow-sm flex items-center justify-center transition-transform hover:scale-105" 
                         style="background-color: ${color}" title="${item.answer}">
                        ${content}
                    </div>
                `;
            }).join('')}
        </div>
    `;
  }

  clearHighlights() {}

  resetView() {
    this.claims = {};
    if (this.textEl) this.textEl.style.color = '';
    if (this.imgEl) this.imgEl.src = '';
    if (this.overlay) this.overlay.classList.add('hidden');
    const border = document.getElementById('quiz-media-border');
    if (border) {
        border.style.backgroundColor = '';
        border.className = `${this.uiConfig.imagePadding} ${this.uiConfig.imageBg} ${this.uiConfig.imageRounded} shadow-2xl transition-all duration-300 hidden`;
    }
  }

  getScoreSettingsDescription(settings) { return ''; }

  // --- Internal Helpers ---

  _isAllowed(item, settings) { return true; }

  _normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.']/g, '');
  }

  _levenshteinDistance(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
  }
}

// Global scope check
if (typeof window !== 'undefined') {
    window.BaseQuizPlugin = BaseQuizPlugin;
}
