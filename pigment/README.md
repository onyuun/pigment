# Pigment — Digital Color Studio

A responsive, dark-mode color workspace for digital artists, built with standard HTML, vanilla CSS, and vanilla JavaScript. The mood generator uses a Vercel serverless function; the Gemini key is server-side only.

## Run locally

For the static UI only, run `python3 -m http.server 3000 --directory public` from the repository root. To use Gemini locally, run the project through Vercel's local runtime and set the server environment variable `GEMINI_API_KEY`; a plain static server cannot execute `/api/generateMood`.

`index.html` contains the semantic interface and dialogs. `style.css` provides the responsive design system, live sphere rendering, and global grayscale filter. `script.js` contains HSL conversion, hue-shifted lighting, harmony calculations, interactive Canvas drawing, same-origin mood requests, clipboard actions, local saves, and CSS/GPL exports. `api/generateMood.js` validates requests, calls Gemini with `process.env.GEMINI_API_KEY`, and returns five validated hex colors. The font and favicon are local assets.

## Use the studio

Choose a base color with the native picker or hex input. Adjust saturation and lightness, then choose warm or cool lighting. Drag the color wheel or focus it and use arrow keys to change hue. Hold Shift with an arrow key for a larger step. Select a harmony to focus its exact colors and dim the rest of the wheel.

Click the Shadow, Highlight, or Bounce Light color chip to open its native color picker. Your choice immediately updates the preview and the layer recipe. Custom choices persist through base-color and lighting changes; use the individual **Auto** button to resume automatic calculation. Use each eye button to show or hide that light on the sphere without discarding its color or card data.

Click a displayed hex code or a palette swatch to copy it. Describe a mood and press **Generate** to request five colors from Gemini using the current base color and warm/cool lighting. The browser sends only the prompt and color context to `/api/generateMood`; it never contains or sends a Gemini API key to Google directly.

Grayscale view checks visual values across the full UI. Save palette stores a collection in this browser; it does not create an online account. Export palette downloads named CSS tokens or a GIMP-format palette, including current custom lighting colors, bounce light, and custom mood colors.

## Painting notes

The sphere displays generated or customized highlight, midtone, and shadow colors, with an optional bounce reflection. Warm lighting generates a cool desaturated bounce; cool lighting generates a warmer earth-toned bounce. Layer recipes are useful starting suggestions, not physically accurate lighting simulation or guaranteed blend results. Multiply, Add (Glow), Overlay, and Screen interact with underlying pixels and may differ across painting applications. HSL lightness is not perceived luminance; use the grayscale view as a visual check.

Manrope is licensed under the SIL Open Font License; see `OFL.txt`. Font source: https://fonts.google.com/specimen/Manrope.
