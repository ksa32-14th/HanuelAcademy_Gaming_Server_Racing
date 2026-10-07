# fonts/

The site uses **Formula1 Display** as its typeface (`css/style.css` → `@font-face 'HRC F1'`).
It is a licensed font, so it is not included here. Put the licensed files in this folder with these names and the whole
site switches to it — no code change needed:

- `Formula1-Display-Regular.woff2`
- `Formula1-Display-Bold.woff2`
- `Formula1-Display-Black.woff2` (optional; Bold is used for the heaviest text otherwise)

`.ttf` / `.otf` files can be converted to `.woff2` with any woff2 converter.
Until the files are here, the site falls back to Titillium Web (and Noto Sans KR for Hangul).
