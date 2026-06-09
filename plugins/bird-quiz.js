// plugins/bird-quiz.js

/**
 * BirdQuizPlugin
 * A specialized plugin for identifying bird species from images.
 * Loads its data from birds.csv and uses CSVQuizPlugin's logic.
 */
class BirdQuizPlugin extends CSVQuizPlugin {
  constructor() {
    super({
        id: 'bird-quiz',
        name: 'Bird Quiz',
        title: 'Bird Challenge',
        subtitle: 'Identify global bird species',
        csvUrl: 'birds.csv', // Local file reference
        mapping: {
            id: 'id',
            answer: 'answer',
            questionMedia: 'questionMedia',
            categories: 'categories'
        }
    });

    // Override UI config for bird images
    this.uiConfig.aspectRatio = 'aspect-square';
    this.uiConfig.imagePadding = 'p-1';
  }
}

if (typeof Registry !== 'undefined') {
    Registry.registerPlugin(new BirdQuizPlugin());
}
