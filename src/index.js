export default {
  async fetch(request, env, ctx) {
    const dudenBaseUrl = "https://www.duden.de";
    const dudenWDT = dudenBaseUrl + "/wort-des-tages";
    const dudenWDTResponse = await fetch(dudenWDT);

    if (!dudenWDTResponse.ok) {
      return new Response('Failed to fetch Duden Wort des Tages', { status: 500 });
    }

    let wordPath = '';
    const linkExtractor = new HTMLRewriter()
      .on('a.scene__title-link', {
        element(element) {
          const href = element.getAttribute('href');
          if (href) wordPath = href;
        }
      });

    await linkExtractor.transform(dudenWDTResponse).arrayBuffer();

    if (!wordPath) {
      return new Response('Failed to find word of the day link', { status: 500 });
    }

    const dudenWordURL = dudenBaseUrl + wordPath;
    const dudenWordResponse = await fetch(dudenWordURL);

    if (!dudenWordResponse.ok) {
      return new Response('Failed to fetch Duden Wort', { status: 500 });
    }

    const wordData = {
      word: '',
      frequency: '',
      spelling: '',
      meaning: '',
      origin: '',
    };

    const dataExtractor = new HTMLRewriter()
      // word
      .on('span.lemma__main', {
        text(text) {
          wordData.word += text.text.replace('\u00AD', '');
        }
      })
      // frequency
      .on('span.shaft__full', {
        text(text) {
          if (text.text.length > 0)
            wordData.fullFrequency = text.text.length;
        }
      })
      .on('span.shaft__empty', {
        text(text) {
          if (text.text.length > 0)
            wordData.emptyFrequency = text.text.length;
        }
      })
      // spelling
      .on('#rechtschreibung dd', {
        text(text) {
          wordData.spelling += text.text;
        }
      })
      // meaning
      .on('#bedeutung p', {
        text(text) {
          wordData.meaning += text.text.replace(/^\s+|\s+$/g, '');;
        }
      })
      // origin
      .on('#herkunft p', {
        text(text) {
          wordData.origin += text.text.replace(/^\s+|\s+$/g, '');;
        }
      });

    await dataExtractor.transform(dudenWordResponse).text();

    if (wordData.fullFrequency !== undefined && wordData.emptyFrequency !== undefined) {
      wordData.frequency = createFrequency(wordData.fullFrequency, wordData.emptyFrequency);
      delete wordData.fullFrequency;
      delete wordData.emptyFrequency;
    } else {
      wordData.frequency = 'nicht verfügbar';
    }

    // default values if data is missing
    if (!wordData.spelling) wordData.spelling = 'nicht verfügbar';
    if (!wordData.meaning) wordData.meaning = 'nicht verfügbar';
    if (!wordData.origin) wordData.origin = 'nicht verfügbar';

    return new Response(JSON.stringify(wordData, null, 2), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  },
};

function createFrequency(full, empty) {
  let wordFrequency = '';
  for (let i = 0; i < full; i++) {
    wordFrequency += '▮';
  }

  for (let i = 0; i < empty; i++) {
    wordFrequency += '▯';
  }

  if (wordFrequency.length === 0) {
    wordFrequency = 'nicht verfügbar';
  }

  return wordFrequency;
}
