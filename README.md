Pigment — Color Theory & Lighting Tool

Pigment is a custom, dark-mode, Figma-inspired web tool I built to streamline my own digital painting workflow, tackle color choices, and help navigate color blindness. It combines smart HSL math, live 3D form rendering, and AI-driven mood palette generation to make lighting characters intuitive.

What It Does

Smart HSL Lighting Engine: Automatically calculates harmonious shadow and highlight values based on a chosen base midtone and light temperature (Warm vs. Cool).
Layer Settings: Translates generated colors into actionable digital painting recipes—suggesting specific blending modes (Multiply for shadows, Add (Glow) or Overlay for highlights, and Screen for bounce light) with recommended opacities.
Layer Visibility Toggles: Intuitive layer eye-icon toggles next to each light source, letting me isolate specific lighting elements on the live 3D sphere preview.
Live 3D Sphere Preview: Real-time form rendering using custom CSS inset box-shadow logic to simulate natural volume wrapping, core shadows, and subtle ambient bounce light.
AI Mood Generator: Powered by a secure serverless backend, letting me type any custom emotion, scene, or atmospheric prompt to instantly generate a cohesive 5-color palette.
Grayscale Value-Check: A quick global toggle that shifts the interface into pure grayscale to test value contrast and ensure readability across tones.
One-Click Copy: Every color swatch displays its Hex code and copies directly to the clipboard with instant toast notifications.]

Tech Stack

Frontend: HTML5, Vanilla CSS (Flexbox & CSS Grid), Vanilla JavaScript.
Backend / Security: Vercel Serverless Functions (/api/generateMood.js) to securely route requests to the palette service without exposing credentials in client-side code.
AI Integration: A hosted palette-generation model via REST API.
can you add that its best to run on a laptop since the color picking option on mobile is not a wheel but a manual slider with hue and shadow slider and light slider

