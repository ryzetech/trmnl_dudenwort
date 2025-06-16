export default {
  async fetch(request, env, ctx) {
    const timeStart = Date.now();

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
      usage: '',
      type: '',
      debug: {
        wordPath: wordPath,
        dudenWordURL: dudenWordURL,
        fetchDate: '',
        fetchTime: ''
      }
    };

    // tracking flags
    let foundFirstDefinition = false;
    let foundFirstSpelling = false;
    let linebreakControl = false;

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
          if (!foundFirstSpelling) {
            const cleanText = text.text.replace(/^\s+|\s+$/g, '');
            if (cleanText) {
              wordData.spelling = cleanText;
              foundFirstSpelling = true;
            }
          }
        }
      })
      // meaning - single definition case
      .on('#bedeutung p', {
        text(text) {
          const cleanText = text.text.replace(/^\s+|\s+$|\s\(\d\)/g, '');
          if (cleanText && !text.lastInTextNode) {
            wordData.meaning += (wordData.meaning.length == 0 ? cleanText : " " + cleanText);
          }
        }
      })
      // meaning - multiple definitions case
      .on('#bedeutungen ol.enumeration li div', {
        text(text) {
          const cleanText = text.text.replace(/^\s+|\s+$|\s\(\d\)/g, '');
          if (cleanText && !text.lastInTextNode) {
            if (wordData.meaning.length === 0 || linebreakControl) {
              wordData.meaning += cleanText;
              linebreakControl = false;
            } else {
              wordData.meaning += " " + cleanText;
            }
          }
          if (text.lastInTextNode) {
            wordData.meaning += '\n';
            linebreakControl = true;
          };
        }
      })
      // origin
      .on('#herkunft p', {
        text(text) {
          wordData.origin += text.text.replace(/^\s+|\s\(\d\)/g, '').replace(/&nbsp;/g, ' '); // ZOMG DOUBLE REPLACE!!!
        }
      })
      // type
      .on('dl.tuple:nth-child(4) > dd:nth-child(2)', {
        text(text) {
          if (text.text.length > 0) {
            wordData.type = text.text.replace(/^\s+|\s+$/g, '');
          }
        }
      })
      // usage
      .on('dl.tuple:nth-child(5) > dd:nth-child(2)', {
        text(text) {
          if (text.text.length > 0) {
            wordData.usage = text.text.replace(/^\s+|\s+$/g, '');
          }
        }
      });

    await dataExtractor.transform(dudenWordResponse).text();

    if (wordData.fullFrequency !== undefined && wordData.emptyFrequency !== undefined) {
      wordData.frequency = createFrequency(wordData.fullFrequency, wordData.emptyFrequency);
      delete wordData.fullFrequency;
      delete wordData.emptyFrequency;
    } else {
      wordData.frequency = 'N/A';
    }

    // default values if data is missing
    if (!wordData.spelling) wordData.spelling = 'N/A';
    if (!wordData.meaning) wordData.meaning = 'N/A';
    if (!wordData.origin) wordData.origin = 'N/A';
    if (!wordData.type) wordData.type = 'N/A';
    if (!wordData.usage) wordData.usage = 'N/A';

    wordData.debug.fetchDate = new Date().toISOString();
    wordData.debug.fetchTime = Date.now() - timeStart + 'ms';

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
    wordFrequency = 'N/A';
  }

  return wordFrequency;
}
