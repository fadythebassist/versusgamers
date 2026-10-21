# Licenses

## Game code and art

`index.html`, `game.js`, `style.css` and the answer lists (`words/en-answers.txt`, `words/fr-answers.txt`) are original work made for Versus Gamers (versusgamers.com). The answer lists were written by hand for this game and checked against the valid-guess lists below.

All sound effects are generated at runtime with the Web Audio API. The game ships no audio, image or font files.

## Valid-guess word lists

`words/en-valid.txt` and `words/fr-valid.txt` are derived from these npm packages. Processing: every word was accent-stripped (NFD, combining marks removed) and uppercased. Words containing œ or æ, hyphens, apostrophes or anything else outside A–Z were dropped, along with any word that did not come out at exactly 5 letters. The rest were deduplicated and sorted.

| File | Source package | Version | License | Words kept |
|---|---|---|---|---|
| `words/en-valid.txt` | [`an-array-of-english-words`](https://github.com/words/an-array-of-english-words) | 2.0.0 | MIT, © 2014 Zeke Sikelianos | 12,653 |
| `words/fr-valid.txt` | [`an-array-of-french-words`](https://github.com/words/an-array-of-french-words) | 2.0.0 | MIT, © 2016 Zeke Sikelianos | 5,891 |

Both packages say they are derived from the Letterpress word list by Loren Brichter ([github.com/lorenbrichter/Words](https://github.com/lorenbrichter/Words)), which is released under **CC0 1.0 Universal** (public domain dedication).

### MIT License (an-array-of-english-words, an-array-of-french-words)

```
(The MIT License)

Copyright (c) 2014 Zeke Sikelianos <zeke@sikelianos.com>   (English package)
Copyright (c) 2016 Zeke Sikelianos <zeke@sikelianos.com>   (French package)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Optional background

If `assets/bg.webp` is added later, record its source and license here.
