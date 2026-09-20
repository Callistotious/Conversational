Talk Cards
==========
Open index.html in any web browser. That is all you need.

Folder map
  index.html        The page structure (what is on the screen)
  css/style.css     The look (colors, fonts, card flip animation)
  js/config.js      Your Gemini key and model name (needed only for "new questions")
  js/questions.js   The questions and themes. Edit this to add your own.
  js/app.js         The behavior (flipping, shuffling, asking Gemini for new questions)

Getting new questions
  1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
  2. Create a key and copy it.
  3. Open js/config.js, paste the key between the quotes, and save.
  4. Refresh index.html. The "Get new questions" button now works with no pop-up.
